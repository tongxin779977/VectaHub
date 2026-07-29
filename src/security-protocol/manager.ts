import type { SecurityRule, SecurityDatabase, SecurityConfig, DetectionResult } from './types.js';
import { getDefaultRules } from './default-rules.js';
import { SecurityConfigStore, type TestState } from './security-config-store.js';
import { SecurityRuleStore } from './security-rule-store.js';
import { CommandDetector } from './command-detector.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';

const testState: TestState = {
  mode: false,
  config: null,
  database: null,
};

let managerInstance: SecurityProtocolManager | null = null;

export interface SecurityProtocolManagerOptions {
  configPath?: string;
  environment?: IEnvironmentService;
  logger?: Pick<Console, 'warn'>;
}

const silentSecurityProtocolLogger: Required<Pick<SecurityProtocolManagerOptions, 'logger'>>['logger'] = {
  warn(): void {},
};

export function setTestMode(enabled: boolean): void {
  testState.mode = enabled;
  if (enabled) {
    testState.config = {
      databasePath: '',
      autoUpdate: true,
      rules: {
        enabled: [],
        disabled: []
      }
    };
    testState.database = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      rules: getDefaultRules()
    };
  } else {
    testState.config = null;
    testState.database = null;
    managerInstance = null;
  }
}

/**
 * Facade for the VectaHub security protocol subsystem.
 *
 * Composes {@link SecurityConfigStore} (config/database I/O),
 * {@link SecurityRuleStore} (rule CRUD), and {@link CommandDetector}
 * (command risk evaluation) into a single public API surface.
 *
 * Supports test mode for in-memory operation via {@link setTestMode}.
 */
export class SecurityProtocolManager {
  private readonly configStore: SecurityConfigStore;
  private readonly ruleStore: SecurityRuleStore;
  private readonly detector: CommandDetector;
  private degradedMode = false;
  private readonly logger: Pick<Console, 'warn'>;

  /**
   * Creates a new SecurityProtocolManager.
   *
   * @param configPathOrOptions - Optional config file path or full options object
   */
  constructor(configPathOrOptions?: string | SecurityProtocolManagerOptions) {
    const options = typeof configPathOrOptions === 'string'
      ? { configPath: configPathOrOptions }
      : configPathOrOptions ?? {};
    this.logger = options.logger ?? silentSecurityProtocolLogger;

    // 构建 SecurityConfigStore 选项：优先使用传入的 environment，否则创建默认 environment
    const environment = options.environment ?? createEnvironmentService();
    const storeOptions = options.configPath
      ? { configPath: options.configPath, logger: options.logger }
      : { environment, logger: options.logger };
    this.configStore = new SecurityConfigStore(storeOptions, testState);
    this.ruleStore = new SecurityRuleStore(this.configStore, testState.mode);
    this.detector = new CommandDetector();
  }

  /** Returns whether the security engine is operating in degraded mode */
  isDegradedMode(): boolean {
    return this.degradedMode;
  }

  /** Enables or disables degraded mode externally (e.g., during initialization failure) */
  setDegradedMode(enabled: boolean): void {
    this.degradedMode = enabled;
  }

  /** Returns a shallow copy of the current security database */
  getDatabase(): SecurityDatabase {
    return { ...this.configStore.getDatabase() };
  }

  /** Returns a shallow copy of the current security config */
  getConfig(): SecurityConfig {
    return { ...this.configStore.getConfig() };
  }

  /** Returns shallow copies of all rules */
  getAllRules(): SecurityRule[] {
    return this.ruleStore.getAllRules();
  }

  /** Returns shallow copies of rules that are currently enabled */
  getEnabledRules(): SecurityRule[] {
    return this.ruleStore.getEnabledRules();
  }

  /** Finds a rule by its ID */
  getRuleById(id: string): SecurityRule | undefined {
    return this.ruleStore.getRuleById(id);
  }

  /**
   * Adds a new custom security rule.
   *
   * @param rule - Rule data (id, createdAt, updatedAt, source are auto-generated)
   * @returns The newly created rule with generated fields
   */
  addRule(rule: Omit<SecurityRule, 'id' | 'createdAt' | 'updatedAt' | 'source'>): SecurityRule {
    return this.ruleStore.addRule(rule);
  }

  /**
   * Updates an existing rule by ID.
   *
   * @param id - The rule ID to update
   * @param updates - Partial rule fields to merge
   * @returns The updated rule, or undefined if not found
   */
  updateRule(id: string, updates: Partial<Omit<SecurityRule, 'id' | 'createdAt' | 'source'>>): SecurityRule | undefined {
    return this.ruleStore.updateRule(id, updates);
  }

  /**
   * Deletes a rule by ID.
   *
   * @param id - The rule ID to delete
   * @returns true if deleted, false if not found
   */
  deleteRule(id: string): boolean {
    return this.ruleStore.deleteRule(id);
  }

  /** Enables a rule by ID in the config overrides */
  enableRule(id: string): boolean {
    return this.ruleStore.enableRule(id);
  }

  /** Disables a rule by ID in the config overrides */
  disableRule(id: string): boolean {
    return this.ruleStore.disableRule(id);
  }

  /**
   * Evaluates a command against all enabled security rules.
   * Fails closed for oversized commands and degraded mode.
   *
   * @param command - The raw command string to evaluate
   * @param cliTool - Optional CLI tool name for tool-specific rule filtering
   * @returns DetectionResult indicating whether the command is dangerous
   */
  detectCommand(command: string, cliTool?: string): DetectionResult {
    return this.detector.detectCommand(
      command,
      cliTool,
      this.ruleStore.getEnabledRules(),
      this.degradedMode,
      this.logger,
    );
  }

  /**
   * Imports rules from a JSON file. Supports both array and {rules:[]} formats.
   * Existing rules are updated; new rules are appended.
   *
   * @param filePath - Path to the JSON file containing rules
   * @returns The number of rules imported
   */
  async importRulesFromFile(filePath: string): Promise<number> {
    return this.ruleStore.importRulesFromFile(filePath);
  }

  /**
   * Exports current rules to a JSON file.
   *
   * @param filePath - Destination file path
   * @param options.includeDisabled - Whether to include disabled rules (default: false)
   */
  exportRulesToFile(filePath: string, options?: { includeDisabled?: boolean }): void {
    this.ruleStore.exportRulesToFile(filePath, options);
  }

  /** Resets all rules and config to factory defaults */
  resetToDefaults(): void {
    this.ruleStore.resetToDefaults();
  }
}

/**
 * Returns the singleton SecurityProtocolManager instance.
 * In test mode, creates a new instance each time.
 *
 * @param configPath - Optional config file path override
 */
export function getSecurityManager(configPath?: string): SecurityProtocolManager {
  if (testState.mode) {
    return new SecurityProtocolManager(configPath);
  }

  if (!managerInstance) {
    managerInstance = new SecurityProtocolManager(configPath);
  }
  return managerInstance;
}
