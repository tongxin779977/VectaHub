import pino from 'pino';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { redactString } from '../../utils/sensitive-data.js';
import type { ILoggerService } from '../interfaces/index.js';
import type { IEnvironmentService } from '../interfaces/index.js';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 日志服务实现
 */
export class LoggerService implements ILoggerService {
  private env: IEnvironmentService;
  private logLevel: pino.Level | 'silent';
  private muted: boolean;
  private loggerCache: Map<string, pino.Logger>;

  constructor(env: IEnvironmentService) {
    this.env = env;
    this.logLevel = 'info';
    this.muted = false;
    this.loggerCache = new Map();
  }

  setLogLevel(level: pino.Level | 'silent'): void {
    this.logLevel = level;
  }

  getLogLevel(): pino.Level | 'silent' {
    return this.logLevel;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private getEffectiveLevel(): pino.Level | 'silent' {
    return this.muted ? 'silent' : this.logLevel;
  }

  createConsoleLogger(prefix = ''): pino.Logger {
    const name = prefix || 'vectahub';
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    
    const baseOptions: pino.LoggerOptions = {
      name,
      level: this.getEffectiveLevel(),
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
    };

    // 仅在开发环境尝试使用 pino-pretty
    if (isDevelopment) {
      try {
        return pino({
          ...baseOptions,
          transport: {
            target: 'pino-pretty',
            options: {
              destination: 2, // 写入 stderr
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        });
      } catch {
        // 如果 pino-pretty 加载失败，回退到普通日志（写入 stderr）
        return pino(baseOptions, pino.destination(2));
      }
    }

    // 生产环境直接写入 stderr
    return pino(baseOptions, pino.destination(2));
  }

  createFileLogger(prefix = ''): pino.Logger {
    const name = prefix || 'vectahub';
    const logDir = this.env.getPath('logs');
    const appLogDir = join(logDir, 'app');
    const errorLogDir = join(logDir, 'error');

    ensureDir(appLogDir);
    ensureDir(errorLogDir);

    const appLogFile = join(appLogDir, `${formatDate(new Date())}.log`);
    const errorLogFile = join(errorLogDir, `${formatDate(new Date())}.json`);
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    const baseOptions: pino.LoggerOptions = {
      name,
      level: this.getEffectiveLevel(),
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
    };

    const fileTargets: pino.TransportTargetOptions[] = [
      { level: this.getEffectiveLevel(), target: 'pino/file', options: { destination: appLogFile } },
      { level: 'error', target: 'pino/file', options: { destination: errorLogFile } },
    ];

    // 开发环境尝试使用 pino-pretty 输出到 stderr
    if (isDevelopment) {
      try {
        return pino({
          ...baseOptions,
          transport: {
            targets: [
              { level: this.getEffectiveLevel(), target: 'pino-pretty', options: { destination: 2, colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
              ...fileTargets,
            ],
          },
        });
      } catch {
        // pino-pretty 不可用时回退到 pino/file 输出到 stderr
        return pino({
          ...baseOptions,
          transport: {
            targets: [
              { level: this.getEffectiveLevel(), target: 'pino/file', options: { destination: 2 } },
              ...fileTargets,
            ],
          },
        });
      }
    }

    // 生产环境：pino/file 输出到 stderr + 文件
    return pino({
      ...baseOptions,
      transport: {
        targets: [
          { level: this.getEffectiveLevel(), target: 'pino/file', options: { destination: 2 } },
          ...fileTargets,
        ],
      },
    });
  }

  getLogger(prefix = ''): pino.Logger {
    const key = prefix || 'vectahub';
    let cached = this.loggerCache.get(key);
    if (!cached) {
      try {
        cached = this.createFileLogger(prefix);
      } catch {
        // 文件日志创建失败时回退到控制台日志
        cached = this.createConsoleLogger(prefix);
      }
      this.loggerCache.set(key, cached);
    }
    return cached;
  }
}
