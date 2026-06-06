import {
  OperationLog as InfrastructureOperationLog,
  type OperationLogConfig,
  type OperationLogDeps,
} from '../infrastructure/data/operation-log.js';
import { getLogger } from '../infrastructure/logger/index.js';
import { getVectaHubPath } from '../infrastructure/paths/index.js';

function createCompatDeps(): OperationLogDeps {
  return {
    logger: getLogger('operation-log'),
    resolveStoragePath: getVectaHubPath,
  };
}

/**
 * 兼容桥接层：为历史构造签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/operation-log 中的显式依赖 API
 */
export class OperationLog extends InfrastructureOperationLog {
  constructor(config?: Partial<OperationLogConfig>) {
    super({ config, deps: createCompatDeps() });
  }
}

/**
 * 兼容桥接层：为历史工厂签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/operation-log 中的显式依赖 API
 */
export function createOperationLog(config?: Partial<OperationLogConfig>): OperationLog {
  return new OperationLog(config);
}

export type { OperationLogConfig, OperationLogDeps, OperationLogEntry, OperationLogOptions } from '../infrastructure/data/operation-log.js';
