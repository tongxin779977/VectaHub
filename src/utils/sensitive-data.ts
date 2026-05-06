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

const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{48}/g,
  /sk_prod_[a-zA-Z0-9]{24}/g,
  /pk_[a-zA-Z0-9]+/g,
  /pk_live_[a-zA-Z0-9]{24}/g,
  /pk_test_[a-zA-Z0-9]{24}/g,
  /AKIA[0-9A-Z]{16}/g,
  /ASIA[0-9A-Z]{16}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
  /api_[a-zA-Z0-9]{32}/g,
  /[a-zA-Z0-9]{32,64}/g,
];

const PII_PATTERNS = [
  /1[3-9]\d{9}/g,
  /[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
];

const FINANCIAL_PATTERNS = [
  /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
  /\b\d{16,19}\b/g,
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

  for (const pattern of API_KEY_PATTERNS) {
    result = result.replace(pattern, opts.mode === 'mask' ? maskMatch(result, pattern, opts) : '[REDACTED]');
  }

  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, opts.mode === 'mask' ? maskMatch(result, pattern, opts) : '[REDACTED_PII]');
  }

  for (const pattern of FINANCIAL_PATTERNS) {
    result = result.replace(pattern, opts.mode === 'mask' ? maskMatch(result, pattern, opts) : '[REDACTED_FIN]');
  }

  for (const key of SENSITIVE_KEYS) {
    const regex = new RegExp(`(${key}\\s*[=:]\\s*)['"]?[a-zA-Z0-9_\\-]+['"]?`, 'gi');
    result = result.replace(regex, `$1${formatRedacted(key, opts)}`);
  }

  const jwtPattern = /[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;
  result = result.replace(jwtPattern, '[REDACTED_JWT]');

  return result;
}

function maskMatch(str: string, pattern: RegExp, options: RedactionOptions): string {
  const matches = str.match(pattern);
  if (!matches) return '[MASKED]';
  
  const match = matches[0];
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

  API_KEY_PATTERNS.forEach((pattern, index) => {
    const matches = str.match(pattern);
    if (matches) {
      matches.forEach(match => {
        detections.push({
          type: index === 0 ? 'openai_key' : index === 2 ? 'aws_key' : index === 4 ? 'github_key' : 'api_key',
          match,
          confidence: 0.95,
        });
      });
    }
  });

  PII_PATTERNS.forEach((pattern, index) => {
    const matches = str.match(pattern);
    if (matches) {
      matches.forEach(match => {
        detections.push({
          type: index === 0 ? 'phone' : index === 1 ? 'id_card' : 'email',
          match,
          confidence: 0.9,
        });
      });
    }
  });

  FINANCIAL_PATTERNS.forEach((pattern) => {
    const matches = str.match(pattern);
    if (matches) {
      matches.forEach(match => {
        detections.push({
          type: 'credit_card',
          match,
          confidence: 0.85,
        });
      });
    }
  });

  return detections;
}