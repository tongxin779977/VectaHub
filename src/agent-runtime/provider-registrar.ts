import type {
  IProviderRegistrar,
  ProviderRegistrationRequest,
  ProviderRegistrationResult,
  ProviderTestResult,
  ICliDetector,
  ILlmInferencer,
} from '../types/provider.js';
import type { AgentDescriptor, AgentAdapter, AgentAdapterInput, AgentAdapterOutput } from '../types/agent.js';
import { getAgentRegistry, type AgentRegistryDeps } from './registry.js';
import { getCliDetector } from './cli-detector.js';
import { getLlmInferencer } from './llm-inferencer.js';
import { loadConfig, saveConfig } from '../setup/first-run-wizard-bridge.js';

export interface ProviderRegistrarDeps {
  cliDetector?: ICliDetector;
  llmInferencer?: ILlmInferencer;
  logger: Pick<Console, 'warn' | 'error' | 'info'>;
  configLoader?: () => Record<string, unknown>;
  configSaver?: (config: Record<string, unknown>) => void;
}

const silentLogger: ProviderRegistrarDeps['logger'] = {
  warn(): void {},
  error(): void {},
  info(): void {},
};

class GenericAdapter implements AgentAdapter {
  constructor(private readonly descriptor: AgentDescriptor) {}

  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === this.descriptor.id;
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const { descriptor, taskPrompt, workspaceRoot, outputLastMessagePath } = input;
    const args: string[] = [];

    if (descriptor.subcommand) {
      args.push(descriptor.subcommand);
    }

    if (descriptor.workingDirectoryArg) {
      args.push(descriptor.workingDirectoryArg, workspaceRoot);
    }

    if (descriptor.promptTransport === 'arg' && descriptor.promptArgName) {
      args.push(descriptor.promptArgName, taskPrompt);
    } else if (descriptor.promptTransport === 'positional') {
      args.push(taskPrompt);
    }

    for (const flag of descriptor.nonInteractiveFlags) {
      args.push(flag);
    }

    if (outputLastMessagePath && descriptor.id === 'codex') {
      args.push('--output-last-message', outputLastMessagePath);
    }

    if (descriptor.promptTransport === 'stdin') {
      args.push('-');
    }

    const command = descriptor.entryCommand;
    const stdinInput = descriptor.promptTransport === 'stdin' ? taskPrompt : undefined;

    return {
      command,
      args,
      stdinInput,
      preview: [command, ...args].join(' '),
    };
  }
}

export class ProviderRegistrar implements IProviderRegistrar {
  private readonly cliDetector: ICliDetector;
  private readonly llmInferencer: ILlmInferencer;
  private readonly logger: ProviderRegistrarDeps['logger'];
  private readonly configLoader: () => Record<string, unknown>;
  private readonly configSaver: (config: Record<string, unknown>) => void;

  constructor(deps: ProviderRegistrarDeps = { logger: silentLogger }) {
    this.cliDetector = deps.cliDetector || getCliDetector();
    this.llmInferencer = deps.llmInferencer || getLlmInferencer();
    this.logger = deps.logger;
    this.configLoader = deps.configLoader || (() => loadConfig() as unknown as Record<string, unknown>);
    this.configSaver = deps.configSaver || ((config) => saveConfig(config as unknown as import('../setup/first-run-wizard.js').VectaHubConfig));
  }

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to register provider '${cliCommand}':`, error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

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

  list(): AgentDescriptor[] {
    const registry = getAgentRegistry();
    return registry.getAllDescriptors();
  }

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
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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

  private async persistProvider(descriptor: AgentDescriptor, version?: string): Promise<void> {
    try {
      const config = this.configLoader() as Record<string, unknown>;

      if (!config.ai_providers) {
        config.ai_providers = {};
      }

      const providers = config.ai_providers as Record<string, unknown>;
      const providerConfig: Record<string, unknown> = {
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

      providers[descriptor.id] = providerConfig;

      this.configSaver(config);
    } catch (error) {
      this.logger.error('Failed to persist provider config:', error);
    }
  }

  private async removeProviderFromConfig(providerId: string): Promise<void> {
    try {
      const config = this.configLoader() as Record<string, unknown>;

      if (config.ai_providers) {
        const providers = config.ai_providers as Record<string, unknown>;
        delete providers[providerId];
        this.configSaver(config);
      }
    } catch (error) {
      this.logger.error('Failed to remove provider from config:', error);
    }
  }
}

export async function loadProvidersFromConfig(): Promise<void> {
  try {
    const config = loadConfig() as unknown as Record<string, unknown>;
    const providers = (config.ai_providers || {}) as Record<string, Record<string, unknown>>;
    const registry = getAgentRegistry();

    for (const [id, providerConfig] of Object.entries(providers)) {
      if (!providerConfig.enabled) continue;

      const descriptor: AgentDescriptor = {
        id,
        displayName: (providerConfig.displayName as string) || id,
        entryCommand: (providerConfig.entryCommand as string) || id,
        subcommand: providerConfig.subcommand as string | undefined,
        promptTransport: (providerConfig.promptTransport as 'arg' | 'stdin' | 'file' | 'positional') || 'arg',
        promptArgName: providerConfig.promptArgName as string | undefined,
        workingDirectoryArg: providerConfig.workingDirectoryArg as string | undefined,
        nonInteractiveFlags: (providerConfig.nonInteractiveFlags as string[]) || [],
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
        description: providerConfig.description as string | undefined,
      };

      const adapter = new GenericAdapter(descriptor);
      registry.register(descriptor, adapter);
    }
  } catch (error) {
    console.error('Failed to load providers from config:', error);
  }
}

let instance: IProviderRegistrar | null = null;

export function getProviderRegistrar(deps?: ProviderRegistrarDeps): IProviderRegistrar {
  if (!instance) {
    instance = new ProviderRegistrar(deps);
  }
  return instance;
}

export function resetProviderRegistrar(): void {
  instance = null;
}
