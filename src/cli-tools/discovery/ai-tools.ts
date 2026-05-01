import type { KnownTool } from './types.js';

export const AI_CLI_TOOLS: KnownTool[] = [
  {
    id: 'gemini',
    name: 'gemini',
    version: '>=2.5.0',
    versionRequirement: '>=2.5.0',
    description: 'Google Gemini CLI - AI 代码助手',
    checkCommand: 'gemini --version',
    checkOutputRegex: '([0-9]+)\\.([0-9]+)\\.([0-9]+)',
    packageManager: 'npm',
    versionCommands: ['gemini --version'],
    categories: ['ai-cli'],
    confidence: 0.95,
  },
  {
    id: 'claude',
    name: 'claude',
    version: '>=1.0.33',
    versionRequirement: '>=1.0.33',
    description: 'Anthropic Claude CLI - AI 代码助手',
    checkCommand: 'claude --version',
    checkOutputRegex: '([0-9]+)\\.([0-9]+)\\.([0-9]+)',
    packageManager: 'npm',
    versionCommands: ['claude --version'],
    categories: ['ai-cli'],
    confidence: 0.95,
  },
  {
    id: 'codex',
    name: 'codex',
    version: '>=1.0.0',
    versionRequirement: '>=1.0.0',
    description: 'OpenAI Codex CLI - AI 代码生成器',
    checkCommand: 'codex --version',
    checkOutputRegex: '([0-9]+)\\.([0-9]+)\\.([0-9]+)',
    packageManager: 'npm',
    versionCommands: ['codex --version'],
    categories: ['ai-cli'],
    confidence: 0.90,
  },
  {
    id: 'aider',
    name: 'aider',
    version: '>=0.50.0',
    versionRequirement: '>=0.50.0',
    description: 'Aider - AI 结对编程工具',
    checkCommand: 'aider --version',
    checkOutputRegex: '([0-9]+)\\.([0-9]+)\\.([0-9]+)',
    packageManager: 'unknown',
    versionCommands: ['aider --version'],
    categories: ['ai-cli'],
    confidence: 0.90,
  },
  {
    id: 'opencli',
    name: 'opencli',
    version: '>=1.0.0',
    versionRequirement: '>=1.0.0',
    description: 'OpenCLI - 开源 AI CLI 框架',
    checkCommand: 'opencli --version',
    checkOutputRegex: '([0-9]+)\\.([0-9]+)\\.([0-9]+)',
    packageManager: 'npm',
    versionCommands: ['opencli --version'],
    categories: ['ai-cli'],
    confidence: 0.85,
  },
];

export interface AIProviderConfig {
  name: string;
  cliCommand: string;
  versionCommand: string;
  requiredEnvVars: string[];
  minVersion: string;
  priority: number;
  fallbackTargets: string[];
}

export const AI_PROVIDER_CONFIGS: Record<string, AIProviderConfig> = {
  gemini: {
    name: 'gemini',
    cliCommand: 'gemini',
    versionCommand: '--version',
    requiredEnvVars: ['GEMINI_API_KEY'],
    minVersion: '2.5.0',
    priority: 90,
    fallbackTargets: ['claude', 'codex', 'built-in'],
  },
  claude: {
    name: 'claude',
    cliCommand: 'claude',
    versionCommand: '--version',
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    minVersion: '1.0.33',
    priority: 85,
    fallbackTargets: ['gemini', 'codex', 'built-in'],
  },
  codex: {
    name: 'codex',
    cliCommand: 'codex',
    versionCommand: '--version',
    requiredEnvVars: ['OPENAI_API_KEY'],
    minVersion: '1.0.0',
    priority: 80,
    fallbackTargets: ['gemini', 'claude', 'built-in'],
  },
  aider: {
    name: 'aider',
    cliCommand: 'aider',
    versionCommand: '--version',
    requiredEnvVars: [],
    minVersion: '0.50.0',
    priority: 75,
    fallbackTargets: ['gemini', 'claude', 'built-in'],
  },
  opencli: {
    name: 'opencli',
    cliCommand: 'opencli',
    versionCommand: '--version',
    requiredEnvVars: [],
    minVersion: '1.0.0',
    priority: 70,
    fallbackTargets: ['gemini', 'claude', 'built-in'],
  },
};

export function getAIProviderConfig(name: string): AIProviderConfig | undefined {
  return AI_PROVIDER_CONFIGS[name];
}

export function getAllAIProviderConfigs(): AIProviderConfig[] {
  return Object.values(AI_PROVIDER_CONFIGS);
}

export function getAIProviderNames(): string[] {
  return Object.keys(AI_PROVIDER_CONFIGS);
}
