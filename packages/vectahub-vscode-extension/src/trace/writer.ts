import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { TraceSpanRecord } from './types.js';
import { getVectaHubHome } from '../cli/adapter.js';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SENSITIVE_KEY_PATTERN = /(?:(?:api[_-]?key|token|secret|password|passwd|authorization|auth|credential)[\s]*[=:]\s*["']?)([\w\-./+]{8,})/gi;
const KNOWN_ENV_SECRETS = /(?:(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|CODEX_API_KEY|GH_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET|GOOGLE_API_KEY|VECTAHUB_API_KEY)[\s]*[=:]\s*["']?)([\w\-./+]{8,})/gi;
const BEARER_TOKEN = /(Bearer\s+)([\w\-./+]{20,})/gi;
const HOME_PATH_PATTERN = new RegExp(escapeRegex(homedir()), 'g');
const REDACT_PATTERNS: RegExp[] = [SENSITIVE_KEY_PATTERN, KNOWN_ENV_SECRETS, BEARER_TOKEN, HOME_PATH_PATTERN];
const REPLACEMENT = '[REDACTED]';

function redactString(text: string): string {
  if (!text) return text;
  let result = text;
  for (const pattern of REDACT_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, REPLACEMENT);
  }
  return result;
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      redacted[key] = redactValue(val);
    }
    return redacted;
  }
  return value;
}

function getTraceFilePath(date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10);
  return path.join(getVectaHubHome(), 'logs', 'traces', `${datePart}.jsonl`);
}

export async function writeTraceSpan(record: TraceSpanRecord): Promise<void> {
  try {
    const filePath = getTraceFilePath(new Date(record.endTime));
    await mkdir(path.dirname(filePath), { recursive: true });
    const redacted = redactValue(record) as TraceSpanRecord;
    await appendFile(filePath, `${JSON.stringify(redacted)}\n`, 'utf8');
  } catch {
    // ignore write error
  }
}
