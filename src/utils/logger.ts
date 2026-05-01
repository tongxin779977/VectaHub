import pino from 'pino';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_DIR = join(homedir(), '.vectahub', 'logs');

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
    level: 'info',
    transport: {
      targets: [
        { level: 'info', target: 'pino/file', options: { destination: 1 } },
        { level: 'info', target: 'pino/file', options: { destination: appLogFile } },
        { level: 'error', target: 'pino/file', options: { destination: errorLogFile } },
      ],
    },
  });
}

export function createConsoleLogger(prefix = ''): pino.Logger {
  const name = prefix || 'vectahub';
  // 简单的 console logger，只输出到控制台，不写文件
  return pino({
    name,
    level: 'info',
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
