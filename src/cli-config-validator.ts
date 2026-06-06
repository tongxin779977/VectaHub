import type { InfrastructureContext } from './infrastructure/context.js';

/** Severity level for validation issues. */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** A single validation issue found during config validation. */
export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
  value?: unknown;
  expected?: string;
  rule?: string;
}

/** Result of a configuration validation. */
export interface ConfigValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  validatedAt: number;
  duration?: number;
}

/** A validation rule that checks a specific config field. */
export interface ConfigValidationRule {
  field: string;
  description: string;
  validate: (value: unknown, config: Record<string, unknown>) => ValidationIssue | null;
  /** Optional condition to determine if this rule should be applied. */
  condition?: (config: Record<string, unknown>) => boolean;
  /** Rule priority (higher = executed first). */
  priority?: number;
}

/** Conditional validation rule that applies based on config state. */
export interface ConditionalValidationRule extends ConfigValidationRule {
  condition: (config: Record<string, unknown>) => boolean;
}

/** Dependency validation rule that checks field dependencies. */
export interface DependencyValidationRule {
  field: string;
  description: string;
  dependencies: string[];
  validate: (value: unknown, config: Record<string, unknown>, dependencies: Record<string, unknown>) => ValidationIssue | null;
  /** Optional condition to determine if this rule should be applied. */
  condition?: (config: Record<string, unknown>) => boolean;
  /** Rule priority (higher = executed first). */
  priority?: number;
}

/** Cross-field validation rule that validates relationships between fields. */
export interface CrossFieldValidationRule {
  fields: string[];
  description: string;
  validate: (config: Record<string, unknown>) => ValidationIssue | null;
}

/** Configuration validator with rule engine support. */
export interface ConfigValidator {
  validate(config: Record<string, unknown>): ConfigValidationResult;
  addRule(rule: ConfigValidationRule): void;
  removeRule(field: string): void;
  getRules(): ConfigValidationRule[];
  addConditionalRule(rule: ConditionalValidationRule): void;
  addDependencyRule(rule: DependencyValidationRule): void;
  addCrossFieldRule(rule: CrossFieldValidationRule): void;
}

/** CLI-specific configuration shape. */
export interface CliConfig {
  verbose?: boolean;
  debug?: boolean;
  nonInteractive?: boolean;
  json?: boolean;
  dryRun?: boolean;
  outputFormat?: 'text' | 'json' | 'table';
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  maxRetries?: number;
  timeoutMs?: number;
}

const VALID_OUTPUT_FORMATS: CliConfig['outputFormat'][] = ['text', 'json', 'table'];
const VALID_LOG_LEVELS: CliConfig['logLevel'][] = ['debug', 'info', 'warn', 'error'];
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 3600000;
const MAX_RETRIES = 10;

/**
 * Create a CLI configuration validator with built-in and custom rules.
 * Supports conditional rules, dependency rules, and cross-field validation.
 * @param customRules - Optional additional validation rules.
 * @returns A ConfigValidator instance.
 */
export function createCliConfigValidator(customRules?: ConfigValidationRule[]): ConfigValidator {
  const rules: ConfigValidationRule[] = [
    ...getDefaultCliRules(),
    ...(customRules ?? []),
  ];
  const conditionalRules: ConditionalValidationRule[] = [];
  const dependencyRules: DependencyValidationRule[] = [];
  const crossFieldRules: CrossFieldValidationRule[] = [];

  /**
   * Execute a single rule with condition check.
   * @param rule - The validation rule to execute.
   * @param config - The configuration to validate.
   * @returns Validation issue or null.
   */
  function executeRule(rule: ConfigValidationRule, config: Record<string, unknown>): ValidationIssue | null {
    if (rule.condition && !rule.condition(config)) {
      return null;
    }

    const value = config[rule.field];
    const issue = rule.validate(value, config);
    if (issue) {
      return { ...issue, rule: rule.description };
    }
    return null;
  }

  return {
    /**
     * Validate a CLI configuration object against all rules.
     * Executes rules in priority order and includes timing information.
     * @param config - The configuration to validate.
     * @returns Validation result with issues list.
     */
    validate(config: Record<string, unknown>): ConfigValidationResult {
      const startTime = Date.now();
      const issues: ValidationIssue[] = [];

      const sortedRules = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      for (const rule of sortedRules) {
        const issue = executeRule(rule, config);
        if (issue) {
          issues.push(issue);
        }
      }

      for (const rule of conditionalRules) {
        const issue = executeRule(rule, config);
        if (issue) {
          issues.push(issue);
        }
      }

      for (const rule of dependencyRules) {
        if (rule.condition && !rule.condition(config)) {
          continue;
        }

        const value = config[rule.field];
        const deps: Record<string, unknown> = {};
        for (const dep of rule.dependencies) {
          deps[dep] = config[dep];
        }

        const issue = rule.validate(value, config, deps);
        if (issue) {
          issues.push({ ...issue, rule: rule.description });
        }
      }

      for (const rule of crossFieldRules) {
        const issue = rule.validate(config);
        if (issue) {
          issues.push({ ...issue, rule: rule.description });
        }
      }

      return {
        valid: !issues.some(i => i.severity === 'error'),
        issues,
        validatedAt: Date.now(),
        duration: Date.now() - startTime,
      };
    },

    /**
     * Add a custom validation rule. Replaces existing rule with same field.
     * @param rule - The validation rule to add.
     */
    addRule(rule: ConfigValidationRule): void {
      const existing = rules.findIndex(r => r.field === rule.field);
      if (existing >= 0) {
        rules[existing] = rule;
      } else {
        rules.push(rule);
      }
    },

    /**
     * Remove a validation rule by field name.
     * @param field - The field name of the rule to remove.
     */
    removeRule(field: string): void {
      const index = rules.findIndex(r => r.field === field);
      if (index >= 0) {
        rules.splice(index, 1);
      }
    },

    /**
     * Get all registered validation rules.
     * @returns Array of validation rules.
     */
    getRules(): ConfigValidationRule[] {
      return [...rules];
    },

    /**
     * Add a conditional validation rule.
     * @param rule - The conditional validation rule to add.
     */
    addConditionalRule(rule: ConditionalValidationRule): void {
      conditionalRules.push(rule);
    },

    /**
     * Add a dependency validation rule.
     * @param rule - The dependency validation rule to add.
     */
    addDependencyRule(rule: DependencyValidationRule): void {
      dependencyRules.push(rule);
    },

    /**
     * Add a cross-field validation rule.
     * @param rule - The cross-field validation rule to add.
     */
    addCrossFieldRule(rule: CrossFieldValidationRule): void {
      crossFieldRules.push(rule);
    },
  };
}

/**
 * Get default CLI configuration validation rules.
 * @returns Array of built-in validation rules.
 */
function getDefaultCliRules(): ConfigValidationRule[] {
  return [
    {
      field: 'outputFormat',
      description: 'Validate output format is a supported value',
      validate(value): ValidationIssue | null {
        if (value !== undefined && !VALID_OUTPUT_FORMATS.includes(value as CliConfig['outputFormat'])) {
          return {
            field: 'outputFormat',
            message: `outputFormat must be one of: ${VALID_OUTPUT_FORMATS.join(', ')}`,
            severity: 'error',
            value,
            expected: VALID_OUTPUT_FORMATS.join(' | '),
          };
        }
        return null;
      },
    },
    {
      field: 'logLevel',
      description: 'Validate log level is a supported value',
      validate(value): ValidationIssue | null {
        if (value !== undefined && !VALID_LOG_LEVELS.includes(value as CliConfig['logLevel'])) {
          return {
            field: 'logLevel',
            message: `logLevel must be one of: ${VALID_LOG_LEVELS.join(', ')}`,
            severity: 'error',
            value,
            expected: VALID_LOG_LEVELS.join(' | '),
          };
        }
        return null;
      },
    },
    {
      field: 'maxRetries',
      description: 'Validate max retries is within acceptable range',
      validate(value): ValidationIssue | null {
        if (value === undefined) return null;
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return {
            field: 'maxRetries',
            message: 'maxRetries must be an integer',
            severity: 'error',
            value,
          };
        }
        if (value < 0 || value > MAX_RETRIES) {
          return {
            field: 'maxRetries',
            message: `maxRetries must be between 0 and ${MAX_RETRIES}`,
            severity: 'error',
            value,
            expected: `0-${MAX_RETRIES}`,
          };
        }
        return null;
      },
    },
    {
      field: 'timeoutMs',
      description: 'Validate timeout is within acceptable range',
      validate(value): ValidationIssue | null {
        if (value === undefined) return null;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return {
            field: 'timeoutMs',
            message: 'timeoutMs must be a finite number',
            severity: 'error',
            value,
          };
        }
        if (value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
          return {
            field: 'timeoutMs',
            message: `timeoutMs must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
            severity: 'error',
            value,
            expected: `${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS}`,
          };
        }
        return null;
      },
    },
    {
      field: 'verbose',
      description: 'Validate verbose flag is boolean',
      validate(value): ValidationIssue | null {
        if (value !== undefined && typeof value !== 'boolean') {
          return {
            field: 'verbose',
            message: 'verbose must be a boolean',
            severity: 'error',
            value,
          };
        }
        return null;
      },
    },
    {
      field: 'debug',
      description: 'Validate debug flag is boolean',
      validate(value): ValidationIssue | null {
        if (value !== undefined && typeof value !== 'boolean') {
          return {
            field: 'debug',
            message: 'debug must be a boolean',
            severity: 'error',
            value,
          };
        }
        return null;
      },
    },
    {
      field: 'nonInteractive',
      description: 'Validate nonInteractive flag is boolean',
      validate(value): ValidationIssue | null {
        if (value !== undefined && typeof value !== 'boolean') {
          return {
            field: 'nonInteractive',
            message: 'nonInteractive must be a boolean',
            severity: 'error',
            value,
          };
        }
        return null;
      },
    },
    {
      field: 'dryRun',
      description: 'Validate dryRun flag is boolean',
      validate(value): ValidationIssue | null {
        if (value !== undefined && typeof value !== 'boolean') {
          return {
            field: 'dryRun',
            message: 'dryRun must be a boolean',
            severity: 'error',
            value,
          };
        }
        return null;
      },
    },
  ];
}

/**
 * Validate CLI options from Commander and return issues.
 * @param options - The CLI options object from Commander.
 * @param ctx - The infrastructure context.
 * @returns Validation result.
 */
export function validateCliOptions(
  options: Record<string, unknown>,
  ctx: InfrastructureContext,
): ConfigValidationResult {
  const validator = createCliConfigValidator();
  const result = validator.validate(options);

  if (!result.valid) {
    ctx.logger.getLogger('cli-config').warn(
      { issues: result.issues },
      'CLI options validation failed',
    );
  }

  return result;
}
