/**
 * 敏感数据脱敏与检测工具
 *
 * 兼容层，统一委托给 security-protocol/redactor.ts 的 Redactor 类
 * 保持原有的公共接口（redactSensitiveData、redactString、isSensitiveKey 等）
 */
import { Redactor } from '../../security-protocol/redactor.js';

/**
 * 统一 Redactor 实例
 */
const unifiedRedactor = new Redactor();

/**
 * 敏感键名列表
 */
const SENSITIVE_KEYS = [
  'apiKey',
  'api_key',
  'API_KEY',
  'apikey',
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'auth_token',
  'credentials',
  'private_key',
  'privateKey',
  'ssh_key',
  'sshKey',
  'passphrase',
  'secret_key',
  'secretKey',
  'client_secret',
  'clientSecret',
  'client_id',
  'clientId',
  'refresh_token',
  'refreshToken',
  'session_token',
  'sessionToken',
  'jwt',
  'cookies',
  'authorization',
  'auth',
];

/**
 * 正则匹配模式定义
 */
interface PatternDef {
  pattern: RegExp;
  type: string;
}

/**
 * API 密钥匹配模式
 */
const API_KEY_PATTERNS: PatternDef[] = [
  { pattern: /sk-[a-zA-Z0-9]{48}/g, type: 'openai_key' },
  { pattern: /sk_prod_[a-zA-Z0-9]{24}/g, type: 'api_key' },
  { pattern: /pk_[a-zA-Z0-9]+/g, type: 'api_key' },
  { pattern: /pk_live_[a-zA-Z0-9]{24}/g, type: 'api_key' },
  { pattern: /pk_test_[a-zA-Z0-9]{24}/g, type: 'api_key' },
  { pattern: /AKIA[0-9A-Z]{16}/g, type: 'aws_key' },
  { pattern: /ASIA[0-9A-Z]{16}/g, type: 'aws_key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: 'github_key' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, type: 'github_key' },
  { pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, type: 'github_key' },
  { pattern: /api_[a-zA-Z0-9]{32}/g, type: 'api_key' },
];

/**
 * 个人信息匹配模式
 */
const PII_PATTERNS: PatternDef[] = [
  { pattern: /1[3-9]\d{9}/g, type: 'phone' },
  { pattern: /[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, type: 'id_card' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'email' },
];

/**
 * 金融信息匹配模式
 */
const FINANCIAL_PATTERNS: PatternDef[] = [
  { pattern: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g, type: 'credit_card' },
];

/**
 * 脱敏选项接口
 */
export interface RedactionOptions {
  mode?: 'full' | 'partial' | 'mask';
  visibleChars?: number;
  maskChar?: string;
}

/**
 * 默认脱敏选项
 */
const DEFAULT_OPTIONS: RedactionOptions = {
  mode: 'full',
  visibleChars: 4,
  maskChar: '*',
};

/**
 * 递归脱敏对象中的敏感数据
 * @param obj 输入对象
 * @param options 脱敏选项
 * @returns 脱敏后的对象
 */
export function redactSensitiveData(obj: unknown, options?: RedactionOptions): unknown {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactString(obj, opts);
  }

  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(item => redactSensitiveData(item, opts));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        result[key] = formatRedacted(key, opts);
      } else {
        result[key] = redactSensitiveData(value, opts);
      }
    }
    return result;
  }

  return obj;
}

/**
 * 格式化脱敏标记
 * @param key 键名
 * @param options 脱敏选项
 * @returns 脱敏标记字符串
 */
function formatRedacted(key: string, options: RedactionOptions): string {
  switch (options.mode) {
    case 'partial':
      return '[PARTIAL_REDACTED]';
    case 'mask':
      return '[MASKED]';
    default:
      return '[REDACTED]';
  }
}

/**
 * 脱敏字符串中的敏感数据
 * @param str 输入字符串
 * @param options 脱敏选项
 * @returns 脱敏后的字符串
 */
export function redactString(str: string, options?: RedactionOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 完整模式委托给统一 Redactor，它拥有完整的模式匹配
  if (opts.mode === 'full' || !opts.mode) {
    return unifiedRedactor.redact(str);
  }

  // 部分/掩码模式，应用键值对脱敏和格式化
  let result = str;

  for (const def of API_KEY_PATTERNS) {
    result = result.replace(def.pattern, (match) =>
      opts.mode === 'mask' ? maskMatch(match, opts) : '[REDACTED]'
    );
  }

  for (const def of PII_PATTERNS) {
    result = result.replace(def.pattern, (match) =>
      opts.mode === 'mask' ? maskMatch(match, opts) : '[REDACTED]'
    );
  }

  for (const def of FINANCIAL_PATTERNS) {
    result = result.replace(def.pattern, (match) =>
      opts.mode === 'mask' ? maskMatch(match, opts) : '[REDACTED]'
    );
  }

  for (const key of SENSITIVE_KEYS) {
    const regex = new RegExp(`(${key}\\s*[=:]\\s*)['"]?[a-zA-Z0-9_\\-]+['"]?`, 'gi');
    result = result.replace(regex, `$1${formatRedacted(key, opts)}`);
  }

  const jwtPattern = /[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g;
  result = result.replace(jwtPattern, '[REDACTED]');

  return result;
}

/**
 * 部分掩码匹配字符串
 * @param match 匹配到的字符串
 * @param options 脱敏选项
 * @returns 掩码后的字符串
 */
function maskMatch(match: string, options: RedactionOptions): string {
  const visible = Math.min(options.visibleChars || 4, Math.floor(match.length / 2));
  return match.slice(0, visible) + (options.maskChar || '*').repeat(match.length - visible);
}

/**
 * 判断键名是否为敏感键
 * @param key 输入键名
 * @returns 是否为敏感键
 */
export function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some(sensitiveKey => lowerKey.includes(sensitiveKey.toLowerCase()));
}

/**
 * 简单掩码字符串
 * @param value 输入值
 * @param visibleChars 可见字符数
 * @param maskChar 掩码字符
 * @returns 掩码后的字符串
 */
export function maskString(value: string, visibleChars: number = 4, maskChar: string = '*'): string {
  if (value.length <= visibleChars) {
    return '[REDACTED]';
  }
  return value.slice(0, visibleChars) + maskChar.repeat(value.length - visibleChars);
}

/**
 * 检测字符串中的敏感数据
 * @param str 输入字符串
 * @returns 检测结果数组（包含类型、匹配值和置信度）
 */
export function detectSensitiveData(str: string): { type: string; match: string; confidence: number }[] {
  const detections: { type: string; match: string; confidence: number }[] = [];

  for (const def of API_KEY_PATTERNS) {
    const matches = str.match(def.pattern);
    if (matches) {
      for (const match of matches) {
        detections.push({ type: def.type, match, confidence: 0.95 });
      }
    }
  }

  for (const def of PII_PATTERNS) {
    const matches = str.match(def.pattern);
    if (matches) {
      for (const match of matches) {
        detections.push({ type: def.type, match, confidence: 0.9 });
      }
    }
  }

  for (const def of FINANCIAL_PATTERNS) {
    const matches = str.match(def.pattern);
    if (matches) {
      for (const match of matches) {
        detections.push({ type: def.type, match, confidence: 0.85 });
      }
    }
  }

  return detections;
}
