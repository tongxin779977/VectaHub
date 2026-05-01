import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import type { DefaultPolicy } from '../command-rules/types.js';

export interface Config {
  mode: 'strict' | 'relaxed' | 'consensus';
  sandbox: {
    enabled: boolean;
    mode: 'STRICT' | 'RELAXED' | 'CONSENSUS';
    defaultPolicy: DefaultPolicy;
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
    defaultPolicy: 'passthrough', // 安全优先: 默认拒绝
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