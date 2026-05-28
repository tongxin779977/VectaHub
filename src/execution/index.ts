/**
 * Execution module public API.
 *
 * Provides execution record management, output storage, queue management,
 * lifecycle operations (rerun/resume), archival, and ID generation.
 *
 * @module execution
 */

/** Generate unique execution IDs and parse timestamps from them. */
export { generateId, parseTimestamp } from './id-generator.js';

/** Factory for step-level stdout/stderr output storage. */
export { createOutputStore, type OutputStore } from './output-store.js';

/** Factory for JSONL-based execution record persistence. */
export { createRecordManager, type RecordManager } from './record-manager.js';

/** Singleton queue manager for diagnostic task queues. */
export { getQueueManager, type QueueManager } from './queue-manager.js';

/** Factory for rerun/resume lifecycle coordination. */
export { createLifecycleManager, type LifecycleManager, type RerunOptions, type ResumeOptions } from './lifecycle.js';

/** Factory for gzip-based execution record archival. */
export { createArchiver, type Archiver } from './archiver.js';

/** Shared execution types (records, filters, metadata, archival). */
export type {
  ExecutionStatus,
  ExecutionRecord,
  StepExecution,
  ExecutionFilter,
  ExecutionSource,
  ExecutionMetadata,
  OutputReference,
  ExecutionSearchResult,
  ArchiveInfo,
  ArchiveResult,
} from './types.js';
