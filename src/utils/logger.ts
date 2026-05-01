export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  setLevel(level: LogLevel): void;
}

export function createLogger(prefix = ''): Logger {
  let level = LogLevel.INFO;

  return {
    debug(message: string, ...args: unknown[]): void {
      if (level <= LogLevel.DEBUG) {
        console.debug(`[DEBUG]${prefix ? ` [${prefix}]` : ''}`, message, ...args);
      }
    },

    info(message: string, ...args: unknown[]): void {
      if (level <= LogLevel.INFO) {
        console.info(`[INFO]${prefix ? ` [${prefix}]` : ''}`, message, ...args);
      }
    },

    warn(message: string, ...args: unknown[]): void {
      if (level <= LogLevel.WARN) {
        console.warn(`[WARN]${prefix ? ` [${prefix}]` : ''}`, message, ...args);
      }
    },

    error(message: string, ...args: unknown[]): void {
      if (level <= LogLevel.ERROR) {
        console.error(`[ERROR]${prefix ? ` [${prefix}]` : ''}`, message, ...args);
      }
    },

    setLevel(newLevel: LogLevel): void {
      level = newLevel;
    },
  };
}