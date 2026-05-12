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

interface PatternDef {
  pattern: RegExp;
  type: string;
}

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

const PII_PATTERNS: PatternDef[] = [
  { pattern: /1[3-9]\d{9}/g, type: 'phone' },
  { pattern: /[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, type: 'id_card' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'email' },
];

const FINANCIAL_PATTERNS: PatternDef[] = [
  { pattern: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g, type: 'credit_card' },
];

export interface RedactionOptions {
  mode?: 'full' | 'partial' | 'mask';
  visibleChars?: number;
  maskChar?: string;
}

const DEFAULT_OPTIONS: RedactionOptions = {
  mode: 'full',
  visibleChars: 4,
  maskChar: '*',
};

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

export function redactString(str: string, options?: RedactionOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = str;

  for (const def of API_KEY_PATTERNS) {
    result = result.replace(def.pattern, (match) =>
      opts.mode === 'mask' ? maskMatch(match, opts) : '[REDACTED]'
    );
  }

  for (const def of PII_PATTERNS) {
    result = result.replace(def.pattern, (match) =>
      opts.mode === 'mask' ? maskMatch(match, opts) : '[REDACTED_PII]'
    );
  }

  for (const def of FINANCIAL_PATTERNS) {
    result = result.replace(def.pattern, (match) =>
      opts.mode === 'mask' ? maskMatch(match, opts) : '[REDACTED_FIN]'
    );
  }

  for (const key of SENSITIVE_KEYS) {
    const regex = new RegExp(`(${key}\\s*[=:]\\s*)['"]?[a-zA-Z0-9_\\-]+['"]?`, 'gi');
    result = result.replace(regex, `$1${formatRedacted(key, opts)}`);
  }

  const jwtPattern = /[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g;
  result = result.replace(jwtPattern, '[REDACTED_JWT]');

  return result;
}

function maskMatch(match: string, options: RedactionOptions): string {
  const visible = Math.min(options.visibleChars || 4, Math.floor(match.length / 2));
  return match.slice(0, visible) + (options.maskChar || '*').repeat(match.length - visible);
}

export function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some(sensitiveKey => lowerKey.includes(sensitiveKey.toLowerCase()));
}

export function maskString(value: string, visibleChars: number = 4, maskChar: string = '*'): string {
  if (value.length <= visibleChars) {
    return '[REDACTED]';
  }
  return value.slice(0, visibleChars) + maskChar.repeat(value.length - visibleChars);
}

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
