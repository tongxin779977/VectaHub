import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse, stringify } from 'yaml';
import type { DefaultPolicy } from '../../command-rules/types.js';
import { getVectaHubPath } from '../../utils/paths.js';

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

export interface AIModuleConfig {
  enabled: boolean;
  config?: Record<string, unknown>;
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
  ai_modules: Record<string, AIModuleConfig>;
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
  ai_modules: {},
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
    dir: getVectaHubPath(),
  },
  priority: ['external_cli_with_permission', 'vectahub_llm', 'rules'],
};

function getConfigPath(): string {
  return getVectaHubPath('config.yaml');
}

function validateConfig(config: Partial<Config>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.version !== undefined && typeof config.version !== 'number') {
    errors.push('config.version must be a number');
  }

  if (config.first_run_completed !== undefined && typeof config.first_run_completed !== 'boolean') {
    errors.push('config.first_run_completed must be a boolean');
  }

  if (config.sandbox) {
    if (typeof config.sandbox.enabled !== 'boolean') {
      errors.push('config.sandbox.enabled must be a boolean');
    }
    if (!['STRICT', 'RELAXED', 'CONSENSUS'].includes(config.sandbox.mode)) {
      errors.push('config.sandbox.mode must be one of: STRICT, RELAXED, CONSENSUS');
    }
    if (!['allow', 'block', 'prompt'].includes(config.sandbox.defaultPolicy)) {
      errors.push('config.sandbox.defaultPolicy must be one of: allow, block, prompt');
    }
  }

  if (config.ai) {
    if (config.ai.environment_scan) {
      if (typeof config.ai.environment_scan.enabled !== 'boolean') {
        errors.push('config.ai.environment_scan.enabled must be a boolean');
      }
      if (typeof config.ai.environment_scan.show_report !== 'boolean') {
        errors.push('config.ai.environment_scan.show_report must be a boolean');
      }
      if (typeof config.ai.environment_scan.scan_interval_ms !== 'number' || config.ai.environment_scan.scan_interval_ms < 0) {
        errors.push('config.ai.environment_scan.scan_interval_ms must be a non-negative number');
      }
    }

    if (config.ai.fallback) {
      if (typeof config.ai.fallback.auto_fallback !== 'boolean') {
        errors.push('config.ai.fallback.auto_fallback must be a boolean');
      }
      if (typeof config.ai.fallback.prompt_before_switch !== 'boolean') {
        errors.push('config.ai.fallback.prompt_before_switch must be a boolean');
      }
      if (typeof config.ai.fallback.max_attempts !== 'number' || config.ai.fallback.max_attempts < 1) {
        errors.push('config.ai.fallback.max_attempts must be at least 1');
      }
      if (typeof config.ai.fallback.timeout_ms !== 'number' || config.ai.fallback.timeout_ms < 1000) {
        errors.push('config.ai.fallback.timeout_ms must be at least 1000');
      }
    }

    if (config.ai.provider_priority) {
      config.ai.provider_priority.forEach((provider, index) => {
        if (typeof provider.name !== 'string' || !provider.name) {
          errors.push(`config.ai.provider_priority[${index}].name must be a non-empty string`);
        }
        if (typeof provider.enabled !== 'boolean') {
          errors.push(`config.ai.provider_priority[${index}].enabled must be a boolean`);
        }
        if (typeof provider.priority !== 'number' || provider.priority < 0 || provider.priority > 100) {
          errors.push(`config.ai.provider_priority[${index}].priority must be between 0 and 100`);
        }
      });
    }

    if (config.ai.built_in_ai) {
      if (typeof config.ai.built_in_ai.enabled !== 'boolean') {
        errors.push('config.ai.built_in_ai.enabled must be a boolean');
      }
      if (typeof config.ai.built_in_ai.model !== 'string' || !config.ai.built_in_ai.model) {
        errors.push('config.ai.built_in_ai.model must be a non-empty string');
      }
      if (typeof config.ai.built_in_ai.max_tokens !== 'number' || config.ai.built_in_ai.max_tokens < 1) {
        errors.push('config.ai.built_in_ai.max_tokens must be at least 1');
      }
    }
  }

  if (config.storage && typeof config.storage.dir !== 'string') {
    errors.push('config.storage.dir must be a string');
  }

  if (config.priority && !Array.isArray(config.priority)) {
    errors.push('config.priority must be an array');
  }

  return { valid: errors.length === 0, errors };
}

export function loadConfig(configPath?: string): Config {
  const path = configPath || getConfigPath();

  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = parse(content) as Partial<Config>;
    
    const validation = validateConfig(parsed);
    if (!validation.valid) {
      console.warn('Invalid config detected, using defaults with partial overrides:', validation.errors);
    }
    
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    
    return merged;
  } catch (error) {
    console.warn('Failed to load config, using defaults:', (error as Error).message);
    return { ...DEFAULT_CONFIG };
  }
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath || getConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
  }
  
  writeFileSync(path, stringify(config, { indent: 2 }), 'utf-8');
}

export function updateConfig(patch: Partial<Config>, configPath?: string): Config {
  const current = loadConfig(configPath);
  const updated = { ...current, ...patch };
  
  const validation = validateConfig(updated);
  if (!validation.valid) {
    throw new Error(`Invalid config update: ${validation.errors.join(', ')}`);
  }
  
  saveConfig(updated, configPath);
  return updated;
}