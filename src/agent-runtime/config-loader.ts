import type { AgentDescriptor } from '../types/agent.js';
import type { VectaHubConfig, AgentProviderConfig } from '../setup/first-run-wizard.js';
import type { AgentPromptTransport } from '../types/agent.js';
import { loadConfig } from '../setup/first-run-wizard-bridge.js';
import { getAgentRegistry } from './registry.js';
import { GenericAdapter } from './generic-adapter.js';
import { createSilentLogger, formatErrorMessage } from './utils.js';

/**
 * 配置加载器依赖项
 */
export interface ConfigLoaderDeps {
  /** 自定义配置加载函数 */
  configLoader?: () => VectaHubConfig;
  /** 自定义 logger */
  logger?: Pick<Console, 'error' | 'info'>;
}

/**
 * 配置验证错误
 */
export interface ConfigValidationError {
  /** 验证错误所在字段路径 */
  field: string;
  /** 错误描述 */
  message: string;
}

const VALID_PROMPT_TRANSPORTS: readonly AgentPromptTransport[] = ['arg', 'stdin', 'file', 'positional'];

/**
 * 类型守卫：检查是否为 AgentProviderConfig
 * @param config 配置对象
 * @returns 是否为 AgentProviderConfig
 */
function isAgentProviderConfig(config: unknown): config is AgentProviderConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return typeof c.enabled === 'boolean' && 
         typeof c.entryCommand === 'string' &&
         Array.isArray(c.nonInteractiveFlags);
}

/**
 * 验证顶层配置对象结构
 * @param config 要验证的配置对象
 * @returns 验证错误列表，空数组表示验证通过
 */
export function validateConfig(config: unknown): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!config || typeof config !== 'object') {
    errors.push({ field: 'config', message: 'Configuration must be a non-null object' });
    return errors;
  }

  const c = config as Record<string, unknown>;

  if (typeof c.version !== 'number') {
    errors.push({ field: 'version', message: 'version must be a number' });
  }

  if (typeof c.first_run_completed !== 'boolean') {
    errors.push({ field: 'first_run_completed', message: 'first_run_completed must be a boolean' });
  }

  if (!c.ai_providers || typeof c.ai_providers !== 'object') {
    errors.push({ field: 'ai_providers', message: 'ai_providers must be an object' });
    return errors;
  }

  const providers = c.ai_providers as Record<string, unknown>;
  for (const [id, providerConfig] of Object.entries(providers)) {
    if (id === 'vectahub_llm') continue;
    const providerErrors = validateProviderConfig(id, providerConfig);
    errors.push(...providerErrors);
  }

  return errors;
}

/**
 * 验证单个 Provider 配置
 * @param id Provider ID
 * @param config Provider 配置对象
 * @returns 验证错误列表
 */
function validateProviderConfig(id: string, config: unknown): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  const prefix = `ai_providers.${id}`;

  if (!config || typeof config !== 'object') {
    errors.push({ field: prefix, message: 'Provider config must be a non-null object' });
    return errors;
  }

  const c = config as Record<string, unknown>;

  if (typeof c.entryCommand !== 'string' || c.entryCommand.trim() === '') {
    errors.push({ field: `${prefix}.entryCommand`, message: 'entryCommand must be a non-empty string' });
  }

  if (typeof c.enabled !== 'boolean') {
    errors.push({ field: `${prefix}.enabled`, message: 'enabled must be a boolean' });
  }

  if (!Array.isArray(c.nonInteractiveFlags)) {
    errors.push({ field: `${prefix}.nonInteractiveFlags`, message: 'nonInteractiveFlags must be an array' });
  }

  if (c.promptTransport !== undefined && !VALID_PROMPT_TRANSPORTS.includes(c.promptTransport as AgentPromptTransport)) {
    errors.push({
      field: `${prefix}.promptTransport`,
      message: `promptTransport must be one of: ${VALID_PROMPT_TRANSPORTS.join(', ')}`,
    });
  }

  return errors;
}

/**
 * 从配置文件加载并注册所有 providers
 * @param deps 依赖项
 * @throws {Error} 当配置验证失败时抛出错误
 */
export async function loadProvidersFromConfig(deps?: ConfigLoaderDeps): Promise<void> {
  const configLoader = deps?.configLoader || loadConfig;
  const logger = deps?.logger || createSilentLogger();

  try {
    const config = configLoader();

    const validationErrors = validateConfig(config);
    if (validationErrors.length > 0) {
      const errorSummary = validationErrors.map(e => `${e.field}: ${e.message}`).join('; ');
      logger.error(`Configuration validation failed: ${errorSummary}`);
      throw new Error(`Configuration validation failed: ${errorSummary}`);
    }

    const providers = config.ai_providers;
    const registry = getAgentRegistry();

    for (const [id, providerConfig] of Object.entries(providers)) {
      if (id === 'vectahub_llm') continue;
      
      if (!isAgentProviderConfig(providerConfig)) continue;
      
      if (!providerConfig.enabled) continue;

      const descriptor: AgentDescriptor = {
        id,
        displayName: providerConfig.displayName || id,
        entryCommand: providerConfig.entryCommand,
        subcommand: providerConfig.subcommand,
        promptTransport: providerConfig.promptTransport,
        promptArgName: providerConfig.promptArgName,
        workingDirectoryArg: providerConfig.workingDirectoryArg,
        nonInteractiveFlags: providerConfig.nonInteractiveFlags,
        approvalPolicySupport: 'unknown',
        structuredOutputSupport: false,
        preflightSpec: {
          versionArgs: ['--version'],
          invocableArgs: ['--help'],
          readyArgs: ['--help'],
        },
        dryRunRenderMode: 'prompt-only',
        runtimePolicy: {
          configSemantics: 'inherit-user-default',
        },
        description: providerConfig.description,
      };

      const adapter = new GenericAdapter(descriptor);
      registry.register(descriptor, adapter);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Configuration validation failed')) {
      throw error;
    }
    logger.error(`Failed to load providers from config: ${formatErrorMessage(error)}`, error);
  }
}
