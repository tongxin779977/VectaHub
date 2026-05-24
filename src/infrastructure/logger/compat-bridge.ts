import type pino from 'pino';
import { getDefaultContext } from '../context.js';
import {
  createConsoleLoggerWithDeps,
  createFileLoggerWithDeps,
  getLoggerWithDeps,
  getLogLevelWithDeps,
  isLoggerMutedWithDeps,
  setLogLevelWithDeps,
  setMutedWithDeps,
  type LoggerFacadeDeps,
} from './facade.js';

function createLoggerBridgeDeps(): LoggerFacadeDeps {
  const context = getDefaultContext();
  return {
    logger: context.logger,
  };
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 logger facade 或 InfrastructureContext.logger
 */
export function setMuted(muted: boolean): void {
  setMutedWithDeps(createLoggerBridgeDeps(), muted);
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 logger facade 或 InfrastructureContext.logger
 */
export function isLoggerMuted(): boolean {
  return isLoggerMutedWithDeps(createLoggerBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 logger facade 或 InfrastructureContext.logger
 */
export function setLogLevel(level: pino.Level | 'silent'): void {
  setLogLevelWithDeps(createLoggerBridgeDeps(), level);
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 logger facade 或 InfrastructureContext.logger
 */
export function getLogLevel(): pino.Level | 'silent' {
  return getLogLevelWithDeps(createLoggerBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 logger facade 或 InfrastructureContext.logger
 */
export function createLogger(prefix = ''): pino.Logger {
  return createFileLoggerWithDeps(createLoggerBridgeDeps(), prefix);
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 logger facade 或 InfrastructureContext.logger
 */
export function createConsoleLogger(prefix = ''): pino.Logger {
  return createConsoleLoggerWithDeps(createLoggerBridgeDeps(), prefix);
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用显式注入的 logger facade 或 InfrastructureContext.logger
 */
export function getLogger(prefix = ''): pino.Logger {
  return getLoggerWithDeps(createLoggerBridgeDeps(), prefix);
}
