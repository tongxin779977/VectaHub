import {
  DataCleanupService as InfrastructureDataCleanupService,
  type CleanupConfig,
  type DataCleanupDeps,
} from '../infrastructure/data/cleanup.js';
import { LoggerService } from '../infrastructure/logger/service.js';
import { getLoggerWithDeps } from '../infrastructure/logger/facade.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

function createCompatDeps(environment: IEnvironmentService): DataCleanupDeps {
  const loggerService = new LoggerService(environment);
  return {
    logger: getLoggerWithDeps({ logger: loggerService }, 'data-cleanup'),
    resolveStoragePath: (...segments: string[]) => environment.getPath(...segments),
  };
}

/**
 * 兼容桥接层：为历史构造签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/cleanup 中的显式依赖 API
 */
export class DataCleanupService extends InfrastructureDataCleanupService {
  constructor(environment: IEnvironmentService, config?: Partial<CleanupConfig>) {
    super({ config, deps: createCompatDeps(environment) });
  }
}

/**
 * 兼容桥接层：为历史工厂签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/cleanup 中的显式依赖 API
 */
export function createDataCleanupService(environment: IEnvironmentService, config?: Partial<CleanupConfig>): DataCleanupService {
  return new DataCleanupService(environment, config);
}

export type { CleanupConfig, DataCleanupDeps, DataCleanupServiceOptions } from '../infrastructure/data/cleanup.js';
