import type pino from 'pino';
import type { ILoggerService } from '../interfaces/index.js';

/**
 * 日志 facade 的显式依赖契约
 */
export interface LoggerFacadeDeps {
  logger: ILoggerService;
}

/**
 * 基于显式依赖设置静音状态
 */
export function setMutedWithDeps(deps: LoggerFacadeDeps, muted: boolean): void {
  deps.logger.setMuted(muted);
}

/**
 * 基于显式依赖读取静音状态
 */
export function isLoggerMutedWithDeps(deps: LoggerFacadeDeps): boolean {
  return deps.logger.isMuted();
}

/**
 * 基于显式依赖设置日志级别
 */
export function setLogLevelWithDeps(deps: LoggerFacadeDeps, level: pino.Level | 'silent'): void {
  deps.logger.setLogLevel(level);
}

/**
 * 基于显式依赖读取日志级别
 */
export function getLogLevelWithDeps(deps: LoggerFacadeDeps): pino.Level | 'silent' {
  return deps.logger.getLogLevel();
}

/**
 * 基于显式依赖创建文件 logger
 */
export function createFileLoggerWithDeps(deps: LoggerFacadeDeps, prefix = ''): pino.Logger {
  return deps.logger.createFileLogger(prefix);
}

/**
 * 基于显式依赖创建控制台 logger
 */
export function createConsoleLoggerWithDeps(deps: LoggerFacadeDeps, prefix = ''): pino.Logger {
  return deps.logger.createConsoleLogger(prefix);
}

/**
 * 基于显式依赖获取共享 logger
 */
export function getLoggerWithDeps(deps: LoggerFacadeDeps, prefix = ''): pino.Logger {
  return deps.logger.getLogger(prefix);
}
