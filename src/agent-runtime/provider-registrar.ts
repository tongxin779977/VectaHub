import type {
  IProviderRegistrar,
  ProviderRegistrationRequest,
  ProviderRegistrationResult,
  ProviderTestResult,
  ICliDetector,
  ILlmInferencer,
} from '../types/provider.js';
import type { AgentDescriptor } from '../types/agent.js';
import type { VectaHubConfig, AgentProviderConfig } from '../setup/first-run-wizard.js';
import { getAgentRegistry } from './registry.js';
import { getCliDetector } from './cli-detector.js';
import { getLlmInferencer } from './llm-inferencer.js';
import { loadConfig, saveConfig } from '../setup/first-run-wizard-bridge.js';
import { GenericAdapter } from './generic-adapter.js';
import { createSingleton, createSilentLogger, formatErrorMessage } from './utils.js';

/**
 * Provider Registrar 依赖项
 */
export interface ProviderRegistrarDeps {
  /** 自定义 CLI 检测器 */
  cliDetector?: ICliDetector;
  /** 自定义 LLM 推理器 */
  llmInferencer?: ILlmInferencer;
  /** 自定义 logger */
  logger?: Pick<Console, 'warn' | 'error' | 'info'>;
  /** 自定义配置加载函数 */
  configLoader?: () => VectaHubConfig;
  /** 自定义配置保存函数 */
  configSaver?: (config: VectaHubConfig) => void;
}

/**
 * Provider Registrar 实现类
 * 负责注册、取消注册、测试和刷新 AI Providers
 */
export class ProviderRegistrar implements IProviderRegistrar {
  private readonly cliDetector: ICliDetector;
  private readonly llmInferencer: ILlmInferencer;
  private readonly logger: Pick<Console, 'warn' | 'error' | 'info'>;
  private readonly configLoader: () => VectaHubConfig;
  private readonly configSaver: (config: VectaHubConfig) => void;

  constructor(deps: ProviderRegistrarDeps = {}) {
    this.cliDetector = deps.cliDetector || getCliDetector();
    this.llmInferencer = deps.llmInferencer || getLlmInferencer();
    this.logger = deps.logger || createSilentLogger();
    this.configLoader = deps.configLoader || loadConfig;
    this.configSaver = deps.configSaver || saveConfig;
  }

  /**
   * 注册新的 Provider
   * @param request 注册请求
   * @returns 注册结果
   */
  async register(request: ProviderRegistrationRequest): Promise<ProviderRegistrationResult> {
    const { cliCommand } = request;

    try {
      this.logger.info(`Detecting CLI: ${cliCommand}`);
      const detectionResult = await this.cliDetector.detect(cliCommand);

      if (!detectionResult.found) {
        return {
          success: false,
          error: `CLI '${cliCommand}' not found: ${detectionResult.error}`,
        };
      }

      this.logger.info(`Inferring configuration for CLI: ${cliCommand}`);
      const inferenceResult = await this.llmInferencer.infer(cliCommand, detectionResult);

      const descriptor: AgentDescriptor = {
        ...inferenceResult.descriptor,
        id: request.cliCommand.toLowerCase(),
        entryCommand: cliCommand,
      };

      if (request.displayName) {
        descriptor.displayName = request.displayName;
      }
      if (request.description) {
        descriptor.description = request.description;
      }

      const registry = getAgentRegistry();
      const adapter = new GenericAdapter(descriptor);
      registry.register(descriptor, adapter);

      await this.persistProvider(descriptor, detectionResult.version);

      this.logger.info(`Successfully registered provider: ${descriptor.id}`);

      return {
        success: true,
        providerId: descriptor.id,
        descriptor,
      };
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      this.logger.error(`Failed to register provider '${cliCommand}':`, error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 取消注册 Provider
   * @param providerId Provider ID
   * @returns 是否成功
   */
  async unregister(providerId: string): Promise<boolean> {
    const registry = getAgentRegistry();

    if (!registry.has(providerId)) {
      return false;
    }

    registry.unregister(providerId);

    await this.removeProviderFromConfig(providerId);

    this.logger.info(`Unregistered provider: ${providerId}`);

    return true;
  }

  /**
   * 列出所有已注册的 Providers
   * @returns Agent 描述符数组
   */
  list(): AgentDescriptor[] {
    const registry = getAgentRegistry();
    return registry.getAllDescriptors();
  }

  /**
   * 测试 Provider 是否可用
   * @param providerId Provider ID
   * @returns 测试结果
   */
  async test(providerId: string): Promise<ProviderTestResult> {
    const registry = getAgentRegistry();
    const descriptor = registry.getAgentDescriptor(providerId);

    if (!descriptor) {
      return {
        available: false,
        error: `Provider '${providerId}' not found`,
      };
    }

    try {
      const detectionResult = await this.cliDetector.detect(descriptor.entryCommand);

      return {
        available: detectionResult.found,
        version: detectionResult.version,
        error: detectionResult.error,
      };
    } catch (error) {
      return {
        available: false,
        error: formatErrorMessage(error),
      };
    }
  }

  /**
   * 刷新 Provider 配置
   * @param providerId Provider ID
   * @returns 刷新结果
   */
  async refresh(providerId: string): Promise<ProviderRegistrationResult> {
    const registry = getAgentRegistry();
    const descriptor = registry.getAgentDescriptor(providerId);

    if (!descriptor) {
      return {
        success: false,
        error: `Provider '${providerId}' not found`,
      };
    }

    return this.register({
      cliCommand: descriptor.entryCommand,
      displayName: descriptor.displayName,
      description: descriptor.description,
    });
  }

  /**
   * 持久化 Provider 配置
   * @param descriptor Agent 描述符
   * @param version 版本号
   */
  private async persistProvider(descriptor: AgentDescriptor, version?: string): Promise<void> {
    try {
      const config = this.configLoader();

      const providerConfig: AgentProviderConfig = {
        provider: descriptor.id,
        displayName: descriptor.displayName,
        entryCommand: descriptor.entryCommand,
        promptTransport: descriptor.promptTransport,
        nonInteractiveFlags: descriptor.nonInteractiveFlags,
        enabled: true,
        priority: 50,
        registeredAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      };

      if (descriptor.description) providerConfig.description = descriptor.description;
      if (version) providerConfig.version = version;
      if (descriptor.subcommand) providerConfig.subcommand = descriptor.subcommand;
      if (descriptor.promptArgName) providerConfig.promptArgName = descriptor.promptArgName;
      if (descriptor.workingDirectoryArg) providerConfig.workingDirectoryArg = descriptor.workingDirectoryArg;

      config.ai_providers[descriptor.id] = providerConfig;

      this.configSaver(config);
    } catch (error) {
      this.logger.error('Failed to persist provider config:', error);
    }
  }

  /**
   * 从配置中移除 Provider
   * @param providerId Provider ID
   */
  private async removeProviderFromConfig(providerId: string): Promise<void> {
    try {
      const config = this.configLoader();

      if (config.ai_providers && config.ai_providers[providerId]) {
        delete config.ai_providers[providerId];
        this.configSaver(config);
      }
    } catch (error) {
      this.logger.error('Failed to remove provider from config:', error);
    }
  }
}

/**
 * 获取 Provider Registrar 单例实例
 * @param deps 依赖项
 * @returns Provider Registrar 实例
 */
const { getInstance: getProviderRegistrar, reset: resetProviderRegistrar } = createSingleton<
  IProviderRegistrar,
  ProviderRegistrarDeps
>((deps) => new ProviderRegistrar(deps));

export { getProviderRegistrar, resetProviderRegistrar };
