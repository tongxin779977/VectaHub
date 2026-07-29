import type pino from 'pino';

// 保持类型导出
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}
export type Logger = pino.Logger;

export { LoggerService } from './service.js';
export {
  createConsoleLoggerWithDeps,
  createFileLoggerWithDeps,
  getLoggerWithDeps,
  getLogLevelWithDeps,
  isLoggerMutedWithDeps,
  setLogLevelWithDeps,
  setMutedWithDeps,
  type LoggerFacadeDeps,
} from './facade.js';

