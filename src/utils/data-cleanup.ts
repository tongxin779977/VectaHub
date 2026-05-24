import {
  DataCleanupService as InfrastructureDataCleanupService,
  type CleanupConfig,
  type DataCleanupDeps,
} from '../infrastructure/data/cleanup.js';
import { getLogger } from '../infrastructure/logger/index.js';
import { getVectaHubPath } from '../infrastructure/paths/index.js';

function createCompatDeps(): DataCleanupDeps {
  return {
    logger: getLogger('data-cleanup'),
    resolveStoragePath: getVectaHubPath,
  };
}

/**
 * 兼容桥接层：为历史构造签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/cleanup 中的显式依赖 API
 */
export class DataCleanupService extends InfrastructureDataCleanupService {
  constructor(config?: Partial<CleanupConfig>) {
    super({ config, deps: createCompatDeps() });
  }
}

/**
 * 兼容桥接层：为历史工厂签名注入默认基础设施依赖
 * @deprecated 建议直接使用 infrastructure/data/cleanup 中的显式依赖 API
 */
export function createDataCleanupService(config?: Partial<CleanupConfig>): DataCleanupService {
  return new DataCleanupService(config);
}

export type { CleanupConfig, DataCleanupDeps, DataCleanupServiceOptions } from '../infrastructure/data/cleanup.js';
