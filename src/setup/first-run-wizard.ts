import { dirname } from 'path';
import { parse, stringify } from 'yaml';
import { createInterface, type Interface } from 'readline';
import type { StepResult } from './priority-installer.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';

export interface FirstRunWizardDeps {
  environment: Pick<IEnvironmentService, 'exists' | 'ensureDir' | 'readFile' | 'writeFile' | 'getPath' | 'getEnv'>;
  logger?: Pick<pino.Logger, 'error'>;
  output?: FirstRunWizardOutput;
  configPath?: string;
}

export type FirstRunWizardRuntimeDeps = FirstRunWizardDeps & {
  logger: Pick<pino.Logger, 'error'>;
  output: FirstRunWizardOutput;
};

export interface FirstRunWizardOutput {
  log(message: string): void;
}

let sharedRl: Interface | null = null;
let nonInteractiveMode = false;

export function setNonInteractiveMode(enabled: boolean): void {
  nonInteractiveMode = enabled;
}

export function isNonInteractiveMode(): boolean {
  return isNonInteractiveModeWithDeps();
}

export function isNonInteractiveModeWithDeps(deps?: Pick<FirstRunWizardDeps, 'environment'>): boolean {
  const getEnv = (name: string): string | undefined => {
    return deps?.environment?.getEnv(name) ?? process.env[name];
  };

  return nonInteractiveMode
    || getEnv('VECTAHUB_NON_INTERACTIVE') === '1'
    || getEnv('CI') === 'true'
    || getEnv('CI') === '1';
}

function getRl(): Interface {
  if (!sharedRl) {
    sharedRl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return sharedRl;
}

export function closeRl(): void {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
}

export function _resetSharedRl(): void {
  closeRl();
}

function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    getRl().question(question, (answer: string) => {
      resolve(answer);
    });
  });
}

export interface LLMProviderConfig {
  provider: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeout_ms?: number;
  enabled: boolean;
}

export interface AgentProviderConfig {
  provider: string;
  displayName?: string;
  entryCommand: string;
  subcommand?: string;
  promptTransport: 'arg' | 'stdin' | 'file' | 'positional';
  promptArgName?: string;
  workingDirectoryArg?: string;
  nonInteractiveFlags: string[];
  description?: string;
  version?: string;
  enabled: boolean;
  priority: number;
  registeredAt: string;
  lastChecked: string;
}

export interface VectaHubConfig {
  version: number;
  first_run_completed: boolean;
  ai_providers: {
    vectahub_llm: LLMProviderConfig;
    [key: string]: LLMProviderConfig | AgentProviderConfig;
  };
  external_cli: Record<string, {
    enabled: boolean;
    has_permission: boolean;
  }>;
  priority: string[];
  templates?: {
    directory?: string;
  };
}

const DEFAULT_CONFIG: VectaHubConfig = {
  version: 1,
  first_run_completed: false,
  ai_providers: {
    vectahub_llm: {
      provider: '',
      enabled: false,
    },
  },
  external_cli: {
    gemini: { enabled: true, has_permission: true },
    claude: { enabled: true, has_permission: true },
    codex: { enabled: true, has_permission: true },
    aider: { enabled: true, has_permission: true },
  },
  priority: [
    'external_cli_with_permission',
    'vectahub_llm',
    'rules',
  ],
};

function resolveLogger(deps: FirstRunWizardRuntimeDeps): Pick<pino.Logger, 'error'> {
  return deps.logger;
}

function resolveOutput(deps: FirstRunWizardRuntimeDeps): FirstRunWizardOutput {
  return deps.output;
}

function getConfigPath(deps: FirstRunWizardDeps): string {
  return deps.configPath ?? deps.environment.getPath('config.yaml');
}

function getConfigDir(deps: FirstRunWizardDeps): string {
  const configPath = getConfigPath(deps);
  return dirname(configPath);
}

// Step 1: Create config directory
export async function createConfigDir(deps: FirstRunWizardDeps): Promise<StepResult> {
  const configDir = getConfigDir(deps);

  try {
    if (deps.environment.exists(configDir)) {
      return { success: true };
    }

    deps.environment.ensureDir(configDir);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const causeMessage = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    const fullMessage = causeMessage ? `${message}: ${causeMessage}` : message;
    return { success: false, reason: `创建配置目录失败: ${fullMessage}` };
  }
}

// Step 2: Initialize config file
export async function initConfigFile(deps: FirstRunWizardDeps): Promise<StepResult> {
  const configPath = getConfigPath(deps);

  try {
    if (deps.environment.exists(configPath)) {
      return { success: true };
    }

    const content = stringify(DEFAULT_CONFIG);
    deps.environment.writeFile(configPath, content);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const causeMessage = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    const fullMessage = causeMessage ? `${message}: ${causeMessage}` : message;
    return { success: false, reason: `初始化配置文件失败: ${fullMessage}` };
  }
}

// Step 3: Configure LLM provider (interactive)
export async function configureLLMProvider(deps: FirstRunWizardRuntimeDeps): Promise<StepResult> {
  const output = resolveOutput(deps);
  if (isNonInteractiveModeWithDeps(deps)) {
    output.log('\n🔧 非交互模式: 跳过 AI 配置\n');
    return { success: true };
  }

  output.log('\n👋 Welcome to VectaHub!\n');
  output.log('首次使用需要配置 AI 能力。\n');
  output.log('请选择你的 LLM 提供商:');
  output.log('1. OpenAI (兼容协议，支持 TokenPlan 等)');
  output.log('2. Anthropic (兼容协议)');
  output.log('3. Google Gemini (兼容协议)');
  output.log('4. 本地模型 (Ollama)');
  output.log('5. 跳过 (仅使用规则匹配)\n');

  const answer = await promptUser('选择 [1-5]: ');
  const choice = answer.trim();

  const config = loadConfig(deps);

  switch (choice) {
    case '1':
      await setupOpenAI(config, output);
      break;
    case '2':
      await setupAnthropic(config, output);
      break;
    case '3':
      await setupGemini(config, output);
      break;
    case '4':
      await setupOllama(config, output);
      break;
    case '5':
      output.log('⏭️跳过 AI 配置，将仅使用规则匹配\n');
      closeRl();
      return { success: true };
    default:
      output.log('❌ 无效选择，跳过 AI 配置\n');
      closeRl();
      return { success: true };
  }

  saveConfig(config, deps);
  closeRl();
  return { success: true };
}

export function isFirstRun(deps: FirstRunWizardDeps): boolean {
  const configPath = getConfigPath(deps);
  if (!deps.environment.exists(configPath)) {
    return true;
  }
  try {
    const content = deps.environment.readFile(configPath);
    const config = parse(content) as VectaHubConfig;
    return !config.first_run_completed;
  } catch {
    return true;
  }
}

export function loadConfig(deps: FirstRunWizardDeps): VectaHubConfig {
  const configPath = getConfigPath(deps);
  if (!deps.environment.exists(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const content = deps.environment.readFile(configPath);
    const parsed = parse(content);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: VectaHubConfig, deps: FirstRunWizardDeps): void {
  const configPath = getConfigPath(deps);
  const configDir = dirname(configPath);

  if (!deps.environment.exists(configDir)) {
    deps.environment.ensureDir(configDir);
  }

  const content = stringify(config);
  deps.environment.writeFile(configPath, content);
}

export async function runFirstRunWizard(deps: FirstRunWizardRuntimeDeps): Promise<boolean> {
  const logger = resolveLogger(deps);
  // Step 1: Create config directory
  const dirResult = await createConfigDir(deps);
  if (!dirResult.success) {
    logger.error(dirResult.reason || '创建配置目录失败');
    return false;
  }

  // Step 2: Initialize config file
  const initResult = await initConfigFile(deps);
  if (!initResult.success) {
    logger.error(initResult.reason || '初始化配置文件失败');
    return false;
  }

  // Step 3: Configure LLM provider (interactive)
  await configureLLMProvider(deps);

  // Mark first run as completed (responsibility moved from individual steps)
  const config = loadConfig(deps);
  config.first_run_completed = true;
  saveConfig(config, deps);

  // Return true only if LLM was actually configured
  return config.ai_providers.vectahub_llm.enabled;
}

async function setupOpenAI(config: VectaHubConfig, output: FirstRunWizardOutput): Promise<void> {
  const baseUrl = await promptUser('API 地址 [https://api.openai.com/v1]: ');
  const apiKey = await promptUser('API Key: ');
  const model = await promptUser('模型名称 [gpt-4o-mini]: ');

  config.ai_providers.vectahub_llm = {
    provider: 'openai',
    baseUrl: baseUrl.trim() || 'https://api.openai.com/v1',
    apiKey: apiKey.trim(),
    model: model.trim() || 'gpt-4o-mini',
    enabled: true,
  };

  output.log('✅ OpenAI 兼容协议配置成功!\n');
}

async function setupAnthropic(config: VectaHubConfig, output: FirstRunWizardOutput): Promise<void> {
  const baseUrl = await promptUser('API 地址 [https://api.anthropic.com]: ');
  const apiKey = await promptUser('API Key: ');
  const model = await promptUser('模型名称 [claude-3-5-sonnet-20241022]: ');

  config.ai_providers.vectahub_llm = {
    provider: 'anthropic',
    baseUrl: baseUrl.trim() || 'https://api.anthropic.com',
    apiKey: apiKey.trim(),
    model: model.trim() || 'claude-3-5-sonnet-20241022',
    enabled: true,
  };

  output.log('✅ Anthropic 兼容协议配置成功!\n');
}

async function setupGemini(config: VectaHubConfig, output: FirstRunWizardOutput): Promise<void> {
  const baseUrl = await promptUser('API 地址 [https://generativelanguage.googleapis.com]: ');
  const apiKey = await promptUser('API Key: ');
  const model = await promptUser('模型名称 [gemini-2.0-flash]: ');

  config.ai_providers.vectahub_llm = {
    provider: 'gemini',
    baseUrl: baseUrl.trim() || 'https://generativelanguage.googleapis.com',
    apiKey: apiKey.trim(),
    model: model.trim() || 'gemini-2.0-flash',
    enabled: true,
  };

  output.log('✅ Gemini 兼容协议配置成功!\n');
}

async function setupOllama(config: VectaHubConfig, output: FirstRunWizardOutput): Promise<void> {
  const baseUrl = await promptUser('Ollama 地址 [http://localhost:11434/v1/chat/completions]: ');
  const model = await promptUser('模型名称 [qwen2.5]: ');

  config.ai_providers.vectahub_llm = {
    provider: 'ollama',
    baseUrl: baseUrl.trim() || 'http://localhost:11434/v1/chat/completions',
    model: model.trim() || 'qwen2.5',
    enabled: true,
  };

  output.log('✅ Ollama 配置成功!\n');
}
