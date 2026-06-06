/**
 * Execution 模块接口定义
 * 遵循 Interface-first 原则，不包含实现代码
 */

import type { ExecutionRecord, ExecutionFilter, ExecutionSearchResult } from './types.js';

/**
 * 记录管理器接口
 */
export interface IRecordManager {
  save(record: ExecutionRecord): Promise<void>;
  get(id: string): Promise<ExecutionRecord | undefined>;
  list(filter?: ExecutionFilter): Promise<ExecutionSearchResult>;
  update(id: string, updates: Partial<ExecutionRecord>): Promise<void>;
  delete(id: string): Promise<void>;
  archive(id: string): Promise<string>;
}

/**
 * 输出存储接口
 */
export interface IOutputStore {
  save(executionId: string, output: unknown): Promise<void>;
  get(executionId: string): Promise<unknown>;
  delete(executionId: string): Promise<void>;
}

/**
 * 队列管理器接口
 */
export interface IQueueManager {
  enqueue(task: unknown): Promise<string>;
  dequeue(): Promise<unknown | null>;
  getStatus(taskId: string): Promise<unknown>;
  cancel(taskId: string): Promise<void>;
}

/**
 * 生命周期管理器接口
 */
export interface ILifecycleManager {
  start(executionId: string): Promise<void>;
  complete(executionId: string, result: unknown): Promise<void>;
  fail(executionId: string, error: unknown): Promise<void>;
  pause(executionId: string): Promise<void>;
  resume(executionId: string): Promise<void>;
  abort(executionId: string): Promise<void>;
}

/**
 * 归档器接口
 */
export interface IArchiver {
  archive(executionId: string): Promise<string>;
  restore(archiveId: string): Promise<ExecutionRecord>;
  list(): Promise<string[]>;
  delete(archiveId: string): Promise<void>;
}
