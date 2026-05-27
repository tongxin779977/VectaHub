import type { AgentDescriptor } from '../types/agent.js';
import type { VectaHubConfig, AgentProviderConfig } from '../setup/first-run-wizard.js';
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
 * 从配置文件加载并注册所有 providers
 * @param deps 依赖项
 */
export async function loadProvidersFromConfig(deps?: ConfigLoaderDeps): Promise<void> {
  const configLoader = deps?.configLoader || loadConfig;
  const logger = deps?.logger || createSilentLogger();

  try {
    const config = configLoader();
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
    logger.error(`Failed to load providers from config: ${formatErrorMessage(error)}`, error);
  }
}
