import pino from 'pino';
import { getDefaultContext } from '../context.js';

// 保持类型导出
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}
export type Logger = pino.Logger;

// 导出 LoggerService
export { LoggerService } from './service.js';

// 向后兼容的函数（内部使用默认 context）
/**
 * @deprecated 建议使用 InfrastructureContext.logger.setMuted()
 */
export function setMuted(muted: boolean): void {
  getDefaultContext().logger.setMuted(muted);
}

/**
 * @deprecated 建议使用 InfrastructureContext.logger.isMuted()
 */
export function isLoggerMuted(): boolean {
  return getDefaultContext().logger.isMuted();
}

/**
 * @deprecated 建议使用 InfrastructureContext.logger.setLogLevel()
 */
export function setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
  getDefaultContext().logger.setLogLevel(level);
}

/**
 * @deprecated 建议使用 InfrastructureContext.logger.getLogLevel()
 */
export function getLogLevel(): pino.Level | 'silent' {
  return getDefaultContext().logger.getLogLevel();
}

/**
 * @deprecated 建议使用 InfrastructureContext.logger.createFileLogger()
 */
export function createLogger(prefix = ''): pino.Logger {
  return getDefaultContext().logger.createFileLogger(prefix);
}

/**
 * @deprecated 建议使用 InfrastructureContext.logger.createConsoleLogger()
 */
export function createConsoleLogger(prefix = ''): pino.Logger {
  return getDefaultContext().logger.createConsoleLogger(prefix);
}

/**
 * @deprecated 建议使用 InfrastructureContext.logger.getLogger()
 */
export function getLogger(prefix = ''): pino.Logger {
  return getDefaultContext().logger.getLogger(prefix);
}