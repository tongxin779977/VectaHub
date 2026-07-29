/**
 * VectaHub 工具函数集合（向后兼容层）
 *
 * 注意：大部分工具已迁移至 `infrastructure/` 模块，
 * 新代码建议从 `@vectahub/infrastructure` 导入。
 */
export { LogLevel, type Logger } from './logger.js';
export { type Config } from './config.js';
export { formatErrorMessage } from './errors.js';
export { createAudit } from './audit.js';

// 路径工具已迁移至 infrastructure/paths/
// 新代码请从 infrastructure/paths/facade.js 使用 *WithDeps 函数
export {
  djb2Hash,
} from '../infrastructure/paths/index.js';

// 安全相关已迁移至 infrastructure/security/
export { redactSensitiveData, detectSensitiveData, maskString, isSensitiveKey } from '../infrastructure/security/sensitive-data.js';
export { createConfigSecurity, type ConfigSecurity, type SecurityStatus, type SecurityIssue } from '../infrastructure/security/config-security.js';

// 数据管理已迁移至 infrastructure/data/
export { createDataCleanupService, type CleanupConfig, type DataCleanupService } from '../infrastructure/data/cleanup.js';
export { createOperationLog, type OperationLog, type OperationLogEntry } from '../infrastructure/data/operation-log.js';

// 事件系统已迁移至 infrastructure/event/
export { createEventManager, globalEventManager, type EventManager } from '../infrastructure/event/event-manager.js';

// 并发工具已迁移至 infrastructure/concurrency/
export { WorkerPool, type WorkerPoolOptions, type TaskResult } from '../infrastructure/concurrency/worker-pool.js';

// 加载器已迁移至 infrastructure/loaders/
export { LazyModuleLoader } from '../infrastructure/loaders/lazy-loader.js';
