import type {
  SandboxConfig,
  ConfigValidationResult,
  ConfigValidationRule,
  ConfigValidator,
  ValidationIssue,
} from './types.js';

const VALID_MODES: SandboxConfig['mode'][] = ['STRICT', 'RELAXED', 'CONSENSUS'];

const MIN_MEMORY_MB = 16;
const MAX_MEMORY_MB = 16384;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 3600000;

/**
 * 创建配置验证器实例
 *
 * 提供内置验证规则（内存范围、超时范围、模式合法性、路径非空等），
 * 并支持通过 addRule 注册自定义验证规则。
 *
 * @param customRules - 可选的额外验证规则列表
 * @returns 配置验证器实例
 */
export function createConfigValidator(customRules?: ConfigValidationRule[]): ConfigValidator {
  const rules: ConfigValidationRule[] = [
    ...getDefaultRules(),
    ...(customRules ?? []),
  ];

  return {
    /**
     * 验证沙箱配置
     *
     * @param config - 待验证的（部分）配置对象
     * @returns 验证结果，包含是否合法及所有问题列表
     */
    validate(config: Partial<SandboxConfig>): ConfigValidationResult {
      const issues: ValidationIssue[] = [];

      for (const rule of rules) {
        const value = (config as Record<string, unknown>)[rule.field];
        const issue = rule.validate(value, config as SandboxConfig);
        if (issue) {
          issues.push(issue);
        }
      }

      return {
        valid: !issues.some((i) => i.severity === 'error'),
        issues,
        validatedAt: Date.now(),
      };
    },

    /**
     * 添加自定义验证规则
     *
     * @param rule - 验证规则定义
     */
    addRule(rule: ConfigValidationRule): void {
      const existing = rules.findIndex((r) => r.field === rule.field);
      if (existing >= 0) {
        rules[existing] = rule;
      } else {
        rules.push(rule);
      }
    },

    /**
     * 移除指定字段的验证规则
     *
     * @param field - 要移除规则的字段名
     */
    removeRule(field: string): void {
      const idx = rules.findIndex((r) => r.field === field);
      if (idx >= 0) {
        rules.splice(idx, 1);
      }
    },

    /**
     * 获取当前所有验证规则
     *
     * @returns 验证规则列表
     */
    getRules(): ConfigValidationRule[] {
      return [...rules];
    },
  };
}

function getDefaultRules(): ConfigValidationRule[] {
  return [
    {
      field: 'root',
      validate(value): ValidationIssue | null {
        if (value !== undefined && typeof value === 'string' && value.trim() === '') {
          return { field: 'root', message: 'root 路径不能为空字符串', severity: 'error', value };
        }
        return null;
      },
    },
    {
      field: 'workspace',
      validate(value): ValidationIssue | null {
        if (value !== undefined && typeof value === 'string' && value.trim() === '') {
          return { field: 'workspace', message: 'workspace 路径不能为空字符串', severity: 'error', value };
        }
        return null;
      },
    },
    {
      field: 'mode',
      validate(value): ValidationIssue | null {
        if (value !== undefined && !VALID_MODES.includes(value as SandboxConfig['mode'])) {
          return {
            field: 'mode',
            message: `mode 必须是 ${VALID_MODES.join(', ')} 之一`,
            severity: 'error',
            value,
            expected: VALID_MODES.join(' | '),
          };
        }
        return null;
      },
    },
    {
      field: 'maxMemoryMB',
      validate(value): ValidationIssue | null {
        if (value === undefined) return null;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return { field: 'maxMemoryMB', message: 'maxMemoryMB 必须是有限数值', severity: 'error', value };
        }
        if (value < MIN_MEMORY_MB || value > MAX_MEMORY_MB) {
          return {
            field: 'maxMemoryMB',
            message: `maxMemoryMB 必须在 ${MIN_MEMORY_MB}-${MAX_MEMORY_MB} 之间`,
            severity: 'error',
            value,
            expected: `${MIN_MEMORY_MB}-${MAX_MEMORY_MB}`,
          };
        }
        return null;
      },
    },
    {
      field: 'timeoutMs',
      validate(value): ValidationIssue | null {
        if (value === undefined) return null;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return { field: 'timeoutMs', message: 'timeoutMs 必须是有限数值', severity: 'error', value };
        }
        if (value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
          return {
            field: 'timeoutMs',
            message: `timeoutMs 必须在 ${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS} 之间`,
            severity: 'error',
            value,
            expected: `${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS}`,
          };
        }
        return null;
      },
    },
    {
      field: 'allowedEnvVars',
      validate(value): ValidationIssue | null {
        if (value === undefined) return null;
        if (!Array.isArray(value)) {
          return { field: 'allowedEnvVars', message: 'allowedEnvVars 必须是字符串数组', severity: 'error', value };
        }
        if (value.some((v) => typeof v !== 'string')) {
          return { field: 'allowedEnvVars', message: 'allowedEnvVars 的元素必须是字符串', severity: 'error', value };
        }
        return null;
      },
    },
    {
      field: 'namespaceIsolation',
      validate(value): ValidationIssue | null {
        if (value !== undefined && typeof value !== 'boolean') {
          return { field: 'namespaceIsolation', message: 'namespaceIsolation 必须是布尔值', severity: 'error', value };
        }
        return null;
      },
    },
  ];
}
