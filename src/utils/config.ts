import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import type { DefaultPolicy } from '../command-rules/types.js';

export interface AIConfig {
  environment_scan: {
    enabled: boolean;
    show_report: boolean;
    scan_interval_ms: number;
  };
  fallback: {
    auto_fallback: boolean;
    prompt_before_switch: boolean;
    max_attempts: number;
    timeout_ms: number;
  };
  provider_priority: Array<{
    name: string;
    enabled: boolean;
    priority: number;
  }>;
  built_in_ai: {
    enabled: boolean;
    model: string;
    max_tokens: number;
  };
}

export interface AIProviderConfig {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  timeout_ms?: number;
  enabled: boolean;
}

export interface ExternalCLIConfig {
  enabled: boolean;
  has_permission: boolean;
}

export interface CLIToolsConfig {
  version: string;
  registeredTools: string[];
  templates: {
    enabled: string[];
  };
}

export interface Config {
  version: number;
  first_run_completed: boolean;
  sandbox: {
    enabled: boolean;
    mode: 'STRICT' | 'RELAXED' | 'CONSENSUS';
    defaultPolicy: DefaultPolicy;
  };
  ai: AIConfig;
  ai_providers: Record<string, AIProviderConfig>;
  external_cli: Record<string, ExternalCLIConfig>;
  cli_tools: CLIToolsConfig;
  storage: {
    dir: string;
  };
  priority: string[];
}

const DEFAULT_CONFIG: Config = {
  version: 1,
  first_run_completed: false,
  sandbox: {
    enabled: true,
    mode: 'STRICT',
    defaultPolicy: 'block',
  },
  ai: {
    environment_scan: {
      enabled: true,
      show_report: false,
      scan_interval_ms: 86400000,
    },
    fallback: {
      auto_fallback: true,
      prompt_before_switch: false,
      max_attempts: 3,
      timeout_ms: 30000,
    },
    provider_priority: [
      { name: 'gemini', enabled: true, priority: 90 },
      { name: 'claude', enabled: true, priority: 85 },
      { name: 'codex', enabled: true, priority: 80 },
      { name: 'aider', enabled: true, priority: 75 },
      { name: 'opencli', enabled: true, priority: 70 },
    ],
    built_in_ai: {
      enabled: true,
      model: 'vectahub-ai-v1',
      max_tokens: 4096,
    },
  },
  ai_providers: {},
  external_cli: {
    gemini: { enabled: true, has_permission: true },
    claude: { enabled: true, has_permission: true },
    codex: { enabled: true, has_permission: true },
    aider: { enabled: true, has_permission: true },
  },
  cli_tools: {
    version: '1.0.0',
    registeredTools: ['git'],
    templates: { enabled: ['default'] },
  },
  storage: {
    dir: '~/.vectahub',
  },
  priority: ['external_cli_with_permission', 'vectahub_llm', 'rules'],
};

function getConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return join(homeDir, '.vectahub', 'config.yaml');
}

export function loadConfig(configPath?: string): Config {
  const path = configPath || getConfigPath();

  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = parse(content) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}
