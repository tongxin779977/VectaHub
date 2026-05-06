import pino from 'pino';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const VECTAHUB_DIR = join(homedir(), '.vectahub');
const LOG_DIR = join(VECTAHUB_DIR, 'logs');

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

let currentLogLevel: pino.Level = 'info';

export function setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
  currentLogLevel = level;
}

export function getLogLevel(): pino.Level {
  return currentLogLevel;
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
    level: currentLogLevel,
    transport: {
      targets: [
        { level: currentLogLevel, target: 'pino/file', options: { destination: 1 } },
        { level: currentLogLevel, target: 'pino/file', options: { destination: appLogFile } },
        { level: 'error', target: 'pino/file', options: { destination: errorLogFile } },
      ],
    },
  });
}

export function createConsoleLogger(prefix = ''): pino.Logger {
  const name = prefix || 'vectahub';
  return pino({
    name,
    level: currentLogLevel,
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

export type Logger = pino.Logger;