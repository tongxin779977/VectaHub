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

import path from 'node:path';
import { getVectaHubPath } from '../../utils/paths.js';
import { createConsoleLogger } from '../../utils/logger.js';
import { AsyncLogWriter } from './async-writer.js';
import { TraceCore } from './trace-core.js';
import { QueryEngine } from './query-engine.js';
import { LogRotationManager } from './log-rotation.js';
import { AlertSystem } from './alert-system.js';
import type { TraceAuditConfig, AlertRule } from './types.js';

const logger = createConsoleLogger('trace-audit-system');

/** 默认配置 */
const DEFAULT_CONFIG: Partial<TraceAuditConfig> = {
  enabled: true,
  asyncWrite: {
    enabled: true,
    bufferSize: 100,
    flushIntervalMs: 1000,
    maxQueueLength: 10000,
  },
  logRotation: {
    enabled: true,
    maxFileSizeMB: 50,
    retentionDays: 30,
    compressArchive: true,
  },
};

/** 默认告警规则 */
const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule_timeout',
    name: '执行超时检测',
    level: 'WARNING',
    conditionType: 'timeout',
    conditionValue: 30000,
    notificationChannels: ['console'],
    enabled: true,
  },
  {
    id: 'rule_error_rate',
    name: '错误率过高',
    level: 'CRITICAL',
    conditionType: 'error_rate',
    conditionValue: 50,
    notificationChannels: ['console'],
    enabled: true,
  },
  {
    id: 'rule_duration_threshold',
    name: '执行时长阈值',
    level: 'INFO',
    conditionType: 'duration_threshold',
    conditionValue: 10000,
    notificationChannels: ['console'],
    enabled: true,
  },
];

/**
 * 链路审计系统实例
 * Trace Audit System Instance
 */
export class TraceAuditSystem {
  private config: TraceAuditConfig;
  private logWriter: AsyncLogWriter;
  private traceCore: TraceCore;
  private queryEngine: QueryEngine;
  private logRotation: LogRotationManager;
  private alertSystem: AlertSystem;
  private rotationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<TraceAuditConfig>) {
    const logDir = config?.logDir || getVectaHubPath('logs', 'traces');
    
    this.config = {
      enabled: true,
      logDir,
      asyncWrite: { ...DEFAULT_CONFIG.asyncWrite!, ...config?.asyncWrite },
      logRotation: { ...DEFAULT_CONFIG.logRotation!, ...config?.logRotation },
      alertRules: config?.alertRules || DEFAULT_ALERT_RULES,
      notificationConfig: config?.notificationConfig,
    };

    // 初始化各模块
    this.logWriter = new AsyncLogWriter(this.config.logDir, this.config.asyncWrite);
    this.traceCore = new TraceCore(this.logWriter);
    this.queryEngine = new QueryEngine(this.config.logDir);
    this.logRotation = new LogRotationManager(this.config.logDir, this.config.logRotation);
    this.alertSystem = new AlertSystem(this.config.alertRules);

    // 设置告警回调
    this.alertSystem.onAlert((alert) => {
      logger.warn(`[告警] ${alert.level}: ${alert.message}`);
    });

    // 启动定时轮转（每天执行一次）
    this.startRotationTimer();

    logger.info('链路审计系统初始化完成');
  }

  /** 启动定时轮转 */
  private startRotationTimer(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
    this.rotationTimer = setInterval(async () => {
      try {
        const result = await this.logRotation.rotate();
        logger.info(`定时日志轮转完成: ${JSON.stringify(result)}`);
      } catch (error) {
        logger.error(`定时日志轮转失败: ${(error as Error).message}`);
      }
    }, 24 * 60 * 60 * 1000); // 24 小时
  }

  /** 创建链路追踪 */
  async createTrace(
    rootModule: string,
    sessionId?: string,
    tags?: Record<string, string>
  ) {
    return this.traceCore.createTrace(rootModule, sessionId, tags);
  }

  /** 创建子跨度 */
  async createSpan(
    traceId: string,
    parentSpanId: string,
    caller: string,
    callee: string,
    input?: Record<string, unknown>,
    tags?: Record<string, string>
  ) {
    return this.traceCore.createSpan(traceId, parentSpanId, caller, callee, input, tags);
  }

  /** 完成跨度 */
  async completeSpan(
    spanId: string,
    status: string,
    output?: Record<string, unknown>,
    error?: string
  ) {
    const span = this.traceCore.getSpan(spanId);
    if (span) {
      await this.traceCore.completeSpan(spanId, status as any, output, error);
      // 检查是否触发告警
      await this.alertSystem.checkSpan({ ...span, status: status as any, error });
    }
  }

  /** 获取链路追踪 */
  getTrace(traceId: string) {
    return this.traceCore.getTrace(traceId);
  }

  /** 执行查询 */
  query(options: any = {}) {
    return this.queryEngine.query(options);
  }

  /** 获取统计指标 */
  getMetrics(options: any = {}) {
    return this.queryEngine.getMetrics(options);
  }

  /** 获取拓扑图 */
  getTopology(traceId: string) {
    return this.queryEngine.getTopology(traceId);
  }

  /** 获取告警列表 */
  getAlerts(options: any = {}) {
    return this.alertSystem.getAlerts(options);
  }

  /** 解决告警 */
  resolveAlert(alertId: string) {
    return this.alertSystem.resolveAlert(alertId);
  }

  /** 刷新查询索引 */
  refreshIndex() {
    this.queryEngine.refresh();
  }

  /** 获取存储统计 */
  getStorageStats() {
    return this.logRotation.getStorageStats();
  }

  /** 获取系统统计 */
  getSystemStats() {
    return {
      activeTraces: this.traceCore.getActiveTraceCount(),
      spanIndexSize: this.traceCore.getSpanIndexSize(),
      queryIndex: this.queryEngine.getIndexStats(),
      alerts: this.alertSystem.getStats(),
      storage: this.logRotation.getStorageStats(),
      writer: this.logWriter.getStats(),
    };
  }

  /** 手动触发日志轮转 */
  async rotateLogs() {
    return this.logRotation.rotate();
  }

  /** 手动触发清理 */
  async forceCleanup() {
    return this.logRotation.forceCleanup();
  }

  /** 销毁系统 */
  async destroy(): Promise<void> {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    await this.traceCore.destroy();
    await this.logWriter.destroy();
    logger.info('链路审计系统已销毁');
  }
}

/**
 * 创建链路审计系统工厂函数
 * Create Trace Audit System Factory Function
 */
export function createTraceAuditSystem(config?: Partial<TraceAuditConfig>): TraceAuditSystem {
  return new TraceAuditSystem(config);
}
