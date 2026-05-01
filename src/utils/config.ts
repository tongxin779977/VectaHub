import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

export interface Config {
  mode: 'strict' | 'relaxed' | 'consensus';
  sandbox: {
    enabled: boolean;
    mode: 'STRICT' | 'RELAXED' | 'CONSENSUS';
  };
  storage: {
    dir: string;
  };
}

const DEFAULT_CONFIG: Config = {
  mode: 'relaxed',
  sandbox: {
    enabled: true,
    mode: 'STRICT',
  },
  storage: {
    dir: '~/.vectahub',
  },
};

export function loadConfig(configPath?: string): Config {
  const path = configPath || join(process.cwd(), 'vectahub.config.yaml');

  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = parse(content) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}