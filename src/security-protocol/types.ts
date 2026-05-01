export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'filesystem' | 'network' | 'resource' | 'custom';
  severity: 'critical' | 'high' | 'medium' | 'low';
  patterns: string[];
  cliTools?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  source: 'builtin' | 'remote' | 'custom';
}

export interface SecurityDatabase {
  version: string;
  lastUpdated: string;
  rules: SecurityRule[];
}

export interface SecurityUpdateSource {
  type: 'local' | 'remote' | 'git';
  url?: string;
  path?: string;
  branch?: string;
  autoUpdate?: boolean;
  updateInterval?: number; // in minutes
}

export interface SecurityConfig {
  databasePath: string;
  updateSource?: SecurityUpdateSource;
  autoUpdate: boolean;
  rules: {
    enabled: string[];
    disabled: string[];
  };
}

export interface DetectionResult {
  isDangerous: boolean;
  rule?: SecurityRule;
  matchedPattern?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
}
