import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse, stringify } from 'yaml';
import { createInterface, type Interface } from 'readline';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('setup');

let sharedRl: Interface | null = null;

function getRl(): Interface {
  if (!sharedRl) {
    sharedRl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return sharedRl;
}

function closeRl(): void {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
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
  enabled: boolean;
}

export interface VectaHubConfig {
  version: number;
  first_run_completed: boolean;
  ai_providers: {
    vectahub_llm: LLMProviderConfig;
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

function getConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  return join(homeDir, '.vectahub', 'config.yaml');
}

export function isFirstRun(): boolean {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return true;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = parse(content) as VectaHubConfig;
    return !config.first_run_completed;
  } catch {
    return true;
  }
}

export function loadConfig(): VectaHubConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parse(content);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: VectaHubConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const content = stringify(config);
  writeFileSync(configPath, content, 'utf-8');
}

export async function runFirstRunWizard(): Promise<boolean> {
  console.log('\n👋 Welcome to VectaHub!\n');
  console.log('首次使用需要配置 AI 能力。\n');
  console.log('请选择你的 LLM 提供商:');
  console.log('1. OpenAI (兼容协议，支持 TokenPlan 等)');
  console.log('2. Anthropic (兼容协议)');
  console.log('3. Google Gemini (兼容协议)');
  console.log('4. 本地模型 (Ollama)');
  console.log('5. 跳过 (仅使用规则匹配)\n');

  const answer = await promptUser('选择 [1-5]: ');
  const choice = answer.trim();

  const config = loadConfig();

  switch (choice) {
    case '1':
      await setupOpenAI(config);
      break;
    case '2':
      await setupAnthropic(config);
      break;
    case '3':
      await setupGemini(config);
      break;
    case '4':
      await setupOllama(config);
      break;
    case '5':
      console.log('⏭️  跳过 AI 配置，将仅使用规则匹配\n');
      config.first_run_completed = true;
      saveConfig(config);
      closeRl();
      return false;
    default:
      console.log('❌ 无效选择，跳过 AI 配置\n');
      config.first_run_completed = true;
      saveConfig(config);
      closeRl();
      return false;
  }

  config.first_run_completed = true;
  saveConfig(config);
  closeRl();
  return true;
}

async function setupOpenAI(config: VectaHubConfig): Promise<void> {
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

  console.log('✅ OpenAI 兼容协议配置成功!\n');
}

async function setupAnthropic(config: VectaHubConfig): Promise<void> {
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

  console.log('✅ Anthropic 兼容协议配置成功!\n');
}

async function setupGemini(config: VectaHubConfig): Promise<void> {
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

  console.log('✅ Gemini 兼容协议配置成功!\n');
}

async function setupOllama(config: VectaHubConfig): Promise<void> {
  const baseUrl = await promptUser('Ollama 地址 [http://localhost:11434/v1/chat/completions]: ');
  const model = await promptUser('模型名称 [qwen2.5]: ');

  config.ai_providers.vectahub_llm = {
    provider: 'ollama',
    baseUrl: baseUrl.trim() || 'http://localhost:11434/v1/chat/completions',
    model: model.trim() || 'qwen2.5',
    enabled: true,
  };

  console.log('✅ Ollama 配置成功!\n');
}
