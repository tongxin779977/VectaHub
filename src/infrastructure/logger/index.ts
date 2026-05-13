import pino from 'pino';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getVectaHubPath } from '../../utils/paths.js';
import { redactString } from '../../utils/sensitive-data.js';

const VECTAHUB_DIR = getVectaHubPath();
const LOG_DIR = getVectaHubPath('logs');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

type LogLevelType = pino.Level | 'silent';

let currentLogLevel: pino.Level = 'info';
let isMuted = false;

export function setMuted(muted: boolean): void {
  isMuted = muted;
}

export function isLoggerMuted(): boolean {
  return isMuted;
}

export function setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
  currentLogLevel = level;
}

export function getLogLevel(): pino.Level {
  return currentLogLevel;
}

function getEffectiveLevel(): LogLevelType {
  return isMuted ? 'silent' : currentLogLevel;
}

export function createLogger(prefix = ''): pino.Logger {
  const name = prefix || 'vectahub';
  const appLogDir = join(LOG_DIR, 'app');
  const errorLogDir = join(LOG_DIR, 'error');

  ensureDir(appLogDir);
  ensureDir(errorLogDir);

  const appLogFile = join(appLogDir, `${formatDate(new Date())}.log`);
  const errorLogFile = join(errorLogDir, `${formatDate(new Date())}.json`);

  return pino({
    name,
    level: getEffectiveLevel(),
    formatters: {
      log(obj: Record<string, unknown>) {
        // Redact sensitive data from log messages and values
        const redacted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string') {
            redacted[key] = redactString(value);
          } else {
            redacted[key] = value;
          }
        }
        return redacted;
      },
    },
    transport: {
      targets: [
        { level: getEffectiveLevel(), target: 'pino/file', options: { destination: 1 } },
        { level: getEffectiveLevel(), target: 'pino/file', options: { destination: appLogFile } },
        { level: 'error', target: 'pino/file', options: { destination: errorLogFile } },
      ],
    },
  });
}

export function createConsoleLogger(prefix = ''): pino.Logger {
  const name = prefix || 'vectahub';
  return pino({
    name,
    level: getEffectiveLevel(),
    formatters: {
      log(obj: Record<string, unknown>) {
        const redacted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string') {
            redacted[key] = redactString(value);
          } else {
            redacted[key] = value;
          }
        }
        return redacted;
      },
    },
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  });
}

const loggerCache = new Map<string, pino.Logger>();

export function getLogger(prefix = ''): pino.Logger {
  const key = prefix || 'vectahub';
  let cached = loggerCache.get(key);
  if (!cached) {
    cached = createConsoleLogger(prefix);
    loggerCache.set(key, cached);
  }
  return cached;
}

export type Logger = pino.Logger;