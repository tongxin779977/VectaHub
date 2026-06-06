import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { SecurityRule, SecurityDatabase, SecurityConfig } from './types.js';
import { getDefaultRules } from './default-rules.js';
import type { SecurityConfigStore } from './security-config-store.js';

/**
 * Manages security rule CRUD operations.
 * Delegates persistence to SecurityConfigStore.
 */
export class SecurityRuleStore {
  private readonly config: SecurityConfig;
  private readonly database: SecurityDatabase;
  private readonly configStore: SecurityConfigStore;
  private readonly testMode: boolean;

  constructor(configStore: SecurityConfigStore, testMode = false) {
    this.configStore = configStore;
    this.config = configStore.getConfig();
    this.database = configStore.getDatabase();
    this.testMode = testMode;
  }

  /** Returns shallow copies of all rules */
  getAllRules(): SecurityRule[] {
    return this.database.rules.map(rule => ({ ...rule }));
  }

  /** Returns shallow copies of rules that are currently enabled */
  getEnabledRules(): SecurityRule[] {
    return this.database.rules.filter(rule => {
      if (this.config.rules.disabled.includes(rule.id)) return false;
      if (this.config.rules.enabled.includes(rule.id)) return true;
      return rule.enabled;
    }).map(rule => ({ ...rule }));
  }

  /** Finds a rule by its ID */
  getRuleById(id: string): SecurityRule | undefined {
    return this.database.rules.find(r => r.id === id);
  }

  /** Adds a new custom rule and persists the database */
  addRule(rule: Omit<SecurityRule, 'id' | 'createdAt' | 'updatedAt' | 'source'>): SecurityRule {
    const newRule: SecurityRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: 'custom',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.database.rules.push(newRule);
    this.configStore.saveDatabase();
    return { ...newRule };
  }

  /** Updates an existing rule by ID and persists the database */
  updateRule(id: string, updates: Partial<Omit<SecurityRule, 'id' | 'createdAt' | 'source'>>): SecurityRule | undefined {
    const index = this.database.rules.findIndex(r => r.id === id);
    if (index === -1) return undefined;

    this.database.rules[index] = {
      ...this.database.rules[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.configStore.saveDatabase();
    return { ...this.database.rules[index] };
  }

  /** Deletes a rule by ID and persists the database */
  deleteRule(id: string): boolean {
    const index = this.database.rules.findIndex(r => r.id === id);
    if (index === -1) return false;

    this.database.rules.splice(index, 1);
    this.configStore.saveDatabase();
    return true;
  }

  /** Enables a rule by ID and persists the config */
  enableRule(id: string): boolean {
    const rule = this.getRuleById(id);
    if (!rule) return false;

    this.config.rules.disabled = this.config.rules.disabled.filter(r => r !== id);
    if (!this.config.rules.enabled.includes(id)) {
      this.config.rules.enabled.push(id);
    }
    this.configStore.saveConfig();
    return true;
  }

  /** Disables a rule by ID and persists the config */
  disableRule(id: string): boolean {
    const rule = this.getRuleById(id);
    if (!rule) return false;

    this.config.rules.enabled = this.config.rules.enabled.filter(r => r !== id);
    if (!this.config.rules.disabled.includes(id)) {
      this.config.rules.disabled.push(id);
    }
    this.configStore.saveConfig();
    return true;
  }

  /** Imports rules from a JSON file, supporting both array and {rules:[]} formats */
  async importRulesFromFile(filePath: string): Promise<number> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const rulesArray = Array.isArray(data)
      ? data
      : (data.rules && Array.isArray(data.rules) ? data.rules : []);

    let imported = 0;
    for (const ruleData of rulesArray) {
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

    this.configStore.saveDatabase();
    return imported;
  }

  /** Exports enabled rules (or all rules) to a JSON file */
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

    if (!this.testMode) {
      this.configStore.ensureDirectory(filePath);
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
  }

  /** Resets all rules and config to factory defaults */
  resetToDefaults(): void {
    this.database.rules = getDefaultRules();
    this.database.version = '1.0.0';
    this.database.lastUpdated = new Date().toISOString();
    this.config.rules = { enabled: [], disabled: [] };
    this.configStore.saveConfig();
    this.configStore.saveDatabase();
  }

  /** Normalizes raw JSON data into a validated SecurityRule */
  normalizeRule(data: Record<string, unknown>): SecurityRule | null {
    const ruleName = typeof data.name === 'string' ? data.name : null;
    const rawPatterns = data.patterns;
    if (!ruleName || (!Array.isArray(rawPatterns) && typeof rawPatterns !== 'string')) {
      return null;
    }

    const patterns = Array.isArray(rawPatterns)
      ? rawPatterns.filter((pattern): pattern is string => typeof pattern === 'string')
      : [rawPatterns];
    if (patterns.length === 0) return null;

    const rawCliTools = data.cliTools;
    const cliTools = rawCliTools
      ? Array.isArray(rawCliTools)
        ? rawCliTools.filter((tool): tool is string => typeof tool === 'string')
        : typeof rawCliTools === 'string'
          ? [rawCliTools]
          : undefined
      : undefined;

    return {
      id: typeof data.id === 'string' ? data.id : `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: ruleName,
      description: typeof data.description === 'string' ? data.description : '',
      category: (typeof data.category === 'string' ? data.category : 'custom') as SecurityRule['category'],
      severity: (typeof data.severity === 'string' ? data.severity : 'medium') as SecurityRule['severity'],
      patterns,
      cliTools,
      enabled: data.enabled !== false,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: (typeof data.source === 'string' ? data.source : 'custom') as SecurityRule['source']
    };
  }
}
