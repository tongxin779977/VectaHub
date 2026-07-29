/**
 * 模块执行链路审计日志系统 - 主入口
 * Module Execution Chain Audit Log System - Main Entry
 * 
 * 统一导出所有模块，提供便捷的系统初始化函数
 */

export { AsyncLogWriter, createAsyncLogWriter } from './async-writer.js';
export { TraceCore, createTraceCore, withTrace } from './trace-core.js';
export { QueryEngine, createQueryEngine } from './query-engine.js';
export { LogRotationManager, createLogRotationManager } from './log-rotation.js';
export { AlertSystem, createAlertSystem } from './alert-system.js';
export { TraceAuditSystem, createTraceAuditSystemWithDeps, type TraceAuditSystemDeps } from './system.js';

export type {
  TraceId,
  SpanId,
  ModuleName,
  ExecutionStatus,
  AlertLevel,
  NotificationChannel,
  TraceSpan,
  ExecutionTrace,
  AuditLogEntry,
  AlertRule,
  AlertEvent,
  TraceQueryOptions,
  TraceQueryResult,
  TraceMetrics,
  LogRotationConfig,
  AsyncWriteConfig,
  TraceAuditConfig,
  TopologyNode,
  TopologyEdge,
  TopologyGraph,
} from './types.js';
