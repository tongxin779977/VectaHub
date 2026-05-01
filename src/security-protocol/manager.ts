import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { SecurityRule, SecurityDatabase, SecurityConfig, DetectionResult } from './types.js';
import { getDefaultRules } from './default-rules.js';

let testMode = false;
let testConfig: SecurityConfig | null = null;
let testDatabase: SecurityDatabase | null = null;
let managerInstance: SecurityProtocolManager | null = null;

export function setTestMode(enabled: boolean): void {
  testMode = enabled;
  if (enabled) {
    testConfig = {
      databasePath: '',
      autoUpdate: true,
      rules: {
        enabled: [],
        disabled: []
      }
    };
    testDatabase = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      rules: getDefaultRules()
    };
  } else {
    testConfig = null;
    testDatabase = null;
    managerInstance = null;
  }
}

export class SecurityProtocolManager {
  private config: SecurityConfig;
  private database: SecurityDatabase;
  private databasePath: string;
  private configPath: string;

  constructor(configPath?: string) {
    if (testMode && testConfig && testDatabase) {
      this.configPath = '';
      this.databasePath = '';
      this.config = testConfig;
      this.database = testDatabase;
      return;
    }

    this.configPath = configPath || join(homedir(), '.vectahub', 'security-config.json');
    this.databasePath = join(dirname(this.configPath), 'security-database.json');
    this.config = this.loadConfig();
    this.database = this.loadDatabase();
  }

  private loadConfig(): SecurityConfig {
    const defaultConfig: SecurityConfig = {
      databasePath: this.databasePath,
      autoUpdate: true,
      rules: {
        enabled: [],
        disabled: []
      }
    };

    if (testMode || !existsSync(this.configPath)) {
      if (testMode) {
        return testConfig || defaultConfig;
      }
      try {
        this.ensureDirectory(this.configPath);
        writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      } catch (e) {
        // Ignore write errors, just use defaults
      }
      return defaultConfig;
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const loaded = JSON.parse(content);
      return { ...defaultConfig, ...loaded };
    } catch (e) {
      console.warn('Failed to load security config, using defaults:', e);
      return defaultConfig;
    }
  }

  private saveConfig(): void {
    if (testMode) {
      if (testConfig) {
        testConfig = this.config;
      }
      return;
    }

    try {
      this.ensureDirectory(this.configPath);
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to save security config:', e);
    }
  }

  private loadDatabase(): SecurityDatabase {
    const defaultDb: SecurityDatabase = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      rules: getDefaultRules()
    };

    if (testMode || !existsSync(this.databasePath)) {
      if (testMode) {
        return testDatabase || defaultDb;
      }
      try {
        this.ensureDirectory(this.databasePath);
        writeFileSync(this.databasePath, JSON.stringify(defaultDb, null, 2), 'utf-8');
      } catch (e) {
        // Ignore write errors, just use defaults
      }
      return defaultDb;
    }

    try {
      const content = readFileSync(this.databasePath, 'utf-8');
      const loaded = JSON.parse(content);
      return loaded;
    } catch (e) {
      console.warn('Failed to load security database, using defaults:', e);
      return defaultDb;
    }
  }

  private saveDatabase(): void {
    if (testMode) {
      if (testDatabase) {
        testDatabase = this.database;
      }
      return;
    }

    this.database.lastUpdated = new Date().toISOString();
    try {
      this.ensureDirectory(this.databasePath);
      writeFileSync(this.databasePath, JSON.stringify(this.database, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to save security database:', e);
    }
  }

  private ensureDirectory(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (e) {
        // Ignore mkdir errors, we'll just fail gracefully when saving
      }
    }
  }

  getDatabase(): SecurityDatabase {
    return { ...this.database };
  }

  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  getAllRules(): SecurityRule[] {
    return this.database.rules.map(rule => ({ ...rule }));
  }

  getEnabledRules(): SecurityRule[] {
    return this.database.rules.filter(rule => {
      if (this.config.rules.disabled.includes(rule.id)) {
        return false;
      }
      if (this.config.rules.enabled.includes(rule.id)) {
        return true;
      }
      return rule.enabled;
    }).map(rule => ({ ...rule }));
  }

  getRuleById(id: string): SecurityRule | undefined {
    return this.database.rules.find(r => r.id === id);
  }

  addRule(rule: Omit<SecurityRule, 'id' | 'createdAt' | 'updatedAt' | 'source'>): SecurityRule {
    const newRule: SecurityRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: 'custom',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.database.rules.push(newRule);
    this.saveDatabase();
    return { ...newRule };
  }

  updateRule(id: string, updates: Partial<Omit<SecurityRule, 'id' | 'createdAt' | 'source'>>): SecurityRule | undefined {
    const index = this.database.rules.findIndex(r => r.id === id);
    if (index === -1) return undefined;

    this.database.rules[index] = {
      ...this.database.rules[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveDatabase();
    return { ...this.database.rules[index] };
  }

  deleteRule(id: string): boolean {
    const index = this.database.rules.findIndex(r => r.id === id);
    if (index === -1) return false;

    this.database.rules.splice(index, 1);
    this.saveDatabase();
    return true;
  }

  enableRule(id: string): boolean {
    const rule = this.getRuleById(id);
    if (!rule) return false;

    this.config.rules.disabled = this.config.rules.disabled.filter(r => r !== id);
    if (!this.config.rules.enabled.includes(id)) {
      this.config.rules.enabled.push(id);
    }
    this.saveConfig();
    return true;
  }

  disableRule(id: string): boolean {
    const rule = this.getRuleById(id);
    if (!rule) return false;

    this.config.rules.enabled = this.config.rules.enabled.filter(r => r !== id);
    if (!this.config.rules.disabled.includes(id)) {
      this.config.rules.disabled.push(id);
    }
    this.saveConfig();
    return true;
  }

  detectCommand(command: string, cliTool?: string): DetectionResult {
    const enabledRules = this.getEnabledRules();

    for (const rule of enabledRules) {
      if (cliTool && rule.cliTools && rule.cliTools.length > 0) {
        if (!rule.cliTools.includes(cliTool)) {
          continue;
        }
      }

      for (const pattern of rule.patterns) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(command)) {
            return {
              isDangerous: true,
              rule: { ...rule },
              matchedPattern: pattern,
              severity: rule.severity
            };
          }
        } catch (e) {
          console.warn(`Invalid regex pattern in rule ${rule.id}:`, e);
        }
      }
    }

    return {
      isDangerous: false,
      severity: 'none'
    };
  }

  async importRulesFromFile(filePath: string): Promise<number> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    let imported = 0;
    if (Array.isArray(data)) {
      for (const ruleData of data) {
        const rule = this.normalizeRule(ruleData);
        if (rule) {
          const existing = this.getRuleById(rule.id);
          if (existing) {
            this.updateRule(rule.id, rule);
          } else {
            this.database.rules.push(rule);
          }
          imported++;
        }
      }
    } else if (data.rules && Array.isArray(data.rules)) {
      for (const ruleData of data.rules) {
        const rule = this.normalizeRule(ruleData);
        if (rule) {
          const existing = this.getRuleById(rule.id);
          if (existing) {
            this.updateRule(rule.id, rule);
          } else {
            this.database.rules.push(rule);
          }
          imported++;
        }
      }
    }

    this.saveDatabase();
    return imported;
  }

  private normalizeRule(data: any): SecurityRule | null {
    if (!data.name || !data.patterns) {
      return null;
    }

    return {
      id: data.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: data.name,
      description: data.description || '',
      category: data.category || 'custom',
      severity: data.severity || 'medium',
      patterns: Array.isArray(data.patterns) ? data.patterns : [data.patterns],
      cliTools: data.cliTools ? (Array.isArray(data.cliTools) ? data.cliTools : [data.cliTools]) : undefined,
      enabled: data.enabled !== false,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: data.source || 'custom'
    };
  }

  exportRulesToFile(filePath: string, options?: { includeDisabled?: boolean }): void {
    let rules = this.database.rules;
    if (!options?.includeDisabled) {
      rules = this.getEnabledRules();
    }

    const data: SecurityDatabase = {
      version: this.database.version,
      lastUpdated: new Date().toISOString(),
      rules: rules
    };

    if (!testMode) {
      this.ensureDirectory(filePath);
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
  }

  resetToDefaults(): void {
    this.database = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      rules: getDefaultRules()
    };
    this.saveDatabase();
  }
}

export function getSecurityManager(configPath?: string): SecurityProtocolManager {
  if (testMode) {
    return new SecurityProtocolManager(configPath);
  }

  if (!managerInstance) {
    managerInstance = new SecurityProtocolManager(configPath);
  }
  return managerInstance;
}
