import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse, stringify } from 'yaml';

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

const DEFAULT_AI_CONFIG: AIConfig = {
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
};

function getConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  return join(homeDir, '.vectahub', 'ai-config.yaml');
}

export function getDefaultAIConfig(): AIConfig {
  return { ...DEFAULT_AI_CONFIG };
}

export async function loadAIConfig(): Promise<AIConfig> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_AI_CONFIG };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parse(content);
    return { ...DEFAULT_AI_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const content = stringify(config);
  writeFileSync(configPath, content, 'utf-8');
}
