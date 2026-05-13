import { homedir } from 'node:os';

export interface RedactionConfig {
  patterns: RegExp[];
  replacement: string;
  sensitivePaths?: RegExp[];
}

// ── Key-value patterns (API keys, tokens, secrets) ──
const SENSITIVE_KEY_PATTERN = /(?:(?:api[_-]?key|token|secret|password|passwd|authorization|auth|credential)[\s]*[=:]\s*["']?)([\w\-./+]{8,})/gi;

const KNOWN_ENV_SECRETS = /(?:(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|CODEX_API_KEY|GH_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET|GOOGLE_API_KEY|VECTAHUB_API_KEY)[\s]*[=:]\s*["']?)([\w\-./+]{8,})/gi;

const BEARER_TOKEN = /(Bearer\s+)([\w\-./+]{20,})/gi;

// ── API Key patterns (from sensitive-data.ts) ──
const API_KEY_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{48}/g,                          // OpenAI
  /sk_prod_[a-zA-Z0-9]{24}/g,                      // Generic prod
  /pk_[a-zA-Z0-9]+/g,                              // Stripe/similar
  /pk_live_[a-zA-Z0-9]{24}/g,                      // Stripe live
  /pk_test_[a-zA-Z0-9]{24}/g,                      // Stripe test
  /AKIA[0-9A-Z]{16}/g,                             // AWS Access Key
  /ASIA[0-9A-Z]{16}/g,                             // AWS STS Key
  /ghp_[a-zA-Z0-9]{36}/g,                          // GitHub PAT
  /gho_[a-zA-Z0-9]{36}/g,                          // GitHub OAuth
  /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,  // GitHub fine-grained PAT
  /api_[a-zA-Z0-9]{32}/g,                          // Generic API key
];

// ── JWT pattern ──
const JWT_PATTERN = /[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g;

// ── PII patterns ──
const PHONE_PATTERN = /1[3-9]\d{9}/g;               // Chinese mobile
const ID_CARD_PATTERN = /[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// ── Financial patterns ──
const CREDIT_CARD_PATTERN = /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g;

// ── Sensitive file paths ──
const DEFAULT_SENSITIVE_PATHS: RegExp[] = [
  /\.ssh[\/\\]/,
  /\.gnupg[\/\\]/,
  /\.env\b/,
  /\.aws[\/\\]/,
  /\.kube[\/\\]/,
  /\.docker[\/\\]/,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDefaultPatterns(): RegExp[] {
  const homePath = homedir();
  const homePattern = new RegExp(escapeRegex(homePath), 'g');
  return [
    SENSITIVE_KEY_PATTERN,
    KNOWN_ENV_SECRETS,
    BEARER_TOKEN,
    homePattern,
    ...API_KEY_PATTERNS,
    JWT_PATTERN,
    PHONE_PATTERN,
    ID_CARD_PATTERN,
    EMAIL_PATTERN,
    CREDIT_CARD_PATTERN,
  ];
}

function buildReplacementFn(replacement: string) {
  return (_match: string, ...args: unknown[]): string => {
    // If the regex has a capture group (secret value), replace the whole match
    // The last two args are `offset` and `string` from String.prototype.replace
    const hasCapture = args.length > 2 && typeof args[0] === 'string' && args[0].length > 0;
    if (hasCapture) {
      return replacement;
    }
    return replacement;
  };
}

const MAX_REDACT_INPUT_LENGTH = 100_000; // 100KB threshold

export class Redactor {
  private readonly patterns: RegExp[];
  private readonly replacement: string;
  private readonly replaceFn: (match: string, ...args: unknown[]) => string;
  private readonly sensitivePaths: RegExp[];

  constructor(config?: Partial<RedactionConfig>) {
    this.patterns = config?.patterns ?? buildDefaultPatterns();
    this.replacement = config?.replacement ?? '[REDACTED]';
    this.replaceFn = buildReplacementFn(this.replacement);
    this.sensitivePaths = config?.sensitivePaths ?? DEFAULT_SENSITIVE_PATHS;
  }

  /**
   * Redact sensitive information from a string.
   * O(n) string scan through all configured patterns.
   * For inputs exceeding 100KB, only head/tail 50KB are scanned to prevent main-thread blocking.
   */
  redact(text: string): string {
    if (!text) return text;
    if (text.length > MAX_REDACT_INPUT_LENGTH) {
      const half = MAX_REDACT_INPUT_LENGTH / 2;
      const head = this.redactPatterns(text.slice(0, half));
      const tail = this.redactPatterns(text.slice(-half));
      return `${head}\n...[truncated ${text.length - MAX_REDACT_INPUT_LENGTH} chars]...\n${tail}`;
    }
    return this.redactPatterns(text);
  }

  private redactPatterns(text: string): string {
    let result = text;
    for (const pattern of this.patterns) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, this.replaceFn);
    }
    // Apply sensitive path redaction
    for (const pathPattern of this.sensitivePaths) {
      pathPattern.lastIndex = 0;
      if (pathPattern.test(result)) {
        pathPattern.lastIndex = 0;
        result = result.replace(pathPattern, this.replacement);
      }
    }
    return result;
  }

  /**
   * Redact sensitive information from all string values in a record.
   * Performs recursive traversal for nested objects/arrays.
   */
  redactObject<T extends Record<string, unknown>>(obj: T): T {
    return this.redactValue(obj) as T;
  }

  private redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.redact(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.redactValue(item));
    }
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      const redacted: Record<string, unknown> = {};
      for (const [key, val] of entries) {
        redacted[key] = this.redactValue(val);
      }
      return redacted;
    }
    return value;
  }
}

/**
 * Create a Redactor instance with default configuration.
 * Each call returns a new instance (stateless, lightweight).
 */
export function createRedactor(config?: Partial<RedactionConfig>): Redactor {
  return new Redactor(config);
}