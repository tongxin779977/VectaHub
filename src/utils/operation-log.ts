import {
  OperationLog as InfrastructureOperationLog,
  type OperationLogConfig,
  type OperationLogDeps,
} from '../infrastructure/data/operation-log.js';
import { LoggerService } from '../infrastructure/logger/service.js';
import { getLoggerWithDeps } from '../infrastructure/logger/facade.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

function createCompatDeps(environment: IEnvironmentService): OperationLogDeps {
  const loggerService = new LoggerService(environment);
  return {
    logger: getLoggerWithDeps({ logger: loggerService }, 'operation-log'),
    resolveStoragePath: (...segments: string[]) => environment.getPath(...segments),
  };
}

/**
 * 兼容桥接层：为历史构造签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/operation-log 中的显式依赖 API
 */
export class OperationLog extends InfrastructureOperationLog {
  constructor(environment: IEnvironmentService, config?: Partial<OperationLogConfig>) {
    super({ config, deps: createCompatDeps(environment) });
  }
}

/**
 * 兼容桥接层：为历史工厂签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/operation-log 中的显式依赖 API
 */
export function createOperationLog(environment: IEnvironmentService, config?: Partial<OperationLogConfig>): OperationLog {
  return new OperationLog(environment, config);
}

export type { OperationLogConfig, OperationLogDeps, OperationLogEntry, OperationLogOptions } from '../infrastructure/data/operation-log.js';
