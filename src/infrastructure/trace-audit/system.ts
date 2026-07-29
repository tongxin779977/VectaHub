import type { IEnvironmentService, ILoggerService } from '../interfaces/index.js';
import type { Logger } from '../logger/index.js';
import { AsyncLogWriter } from './async-writer.js';
import { TraceCore } from './trace-core.js';
import { QueryEngine } from './query-engine.js';
import { LogRotationManager } from './log-rotation.js';
import { AlertSystem } from './alert-system.js';
import { VectaHubError, ErrorType } from '../errors/index.js';
import type {
  AlertEvent,
  AlertRule,
  ExecutionStatus,
  TraceAuditConfig,
  TraceMetrics,
  TraceQueryOptions,
  TraceQueryResult,
} from './types.js';

export interface TraceAuditSystemDeps {
  environment: IEnvironmentService;
  logger: ILoggerService;
}

function getDefaultLogDir(environment: IEnvironmentService): string {
  return environment.getPath('logs', 'traces');
}

function createModuleLoggers(loggerService: ILoggerService): {
  system: Logger;
  writer: Logger;
  traceCore: Logger;
  queryEngine: Logger;
  logRotation: Logger;
  alertSystem: Logger;
} {
  return {
    system: loggerService.getLogger('trace-audit-system'),
    writer: loggerService.getLogger('async-log-writer'),
    traceCore: loggerService.getLogger('trace-core'),
    queryEngine: loggerService.getLogger('query-engine'),
    logRotation: loggerService.getLogger('log-rotation'),
    alertSystem: loggerService.getLogger('alert-system'),
  };
}

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
  private logger: Logger;
  private logWriter: AsyncLogWriter;
  private traceCore: TraceCore;
  private queryEngine: QueryEngine;
  private logRotation: LogRotationManager;
  private alertSystem: AlertSystem;
  private rotationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    deps: TraceAuditSystemDeps,
    config: Partial<TraceAuditConfig> = {}
  ) {
    this.assertDeps(deps);
    const moduleLoggers = createModuleLoggers(deps.logger);
    const logDir = config.logDir || getDefaultLogDir(deps.environment);

    this.config = {
      enabled: true,
      logDir,
      asyncWrite: { ...DEFAULT_CONFIG.asyncWrite!, ...config.asyncWrite },
      logRotation: { ...DEFAULT_CONFIG.logRotation!, ...config.logRotation },
      alertRules: config.alertRules || DEFAULT_ALERT_RULES,
      notificationConfig: config.notificationConfig,
    };
    this.logger = moduleLoggers.system;

    // 初始化各模块
    this.logWriter = new AsyncLogWriter(this.config.logDir, this.config.asyncWrite, {
      logger: moduleLoggers.writer,
    });
    this.traceCore = new TraceCore(this.logWriter, {
      logger: moduleLoggers.traceCore,
    });
    this.queryEngine = new QueryEngine(this.config.logDir, {
      logger: moduleLoggers.queryEngine,
    });
    this.logRotation = new LogRotationManager(this.config.logDir, this.config.logRotation, {
      logger: moduleLoggers.logRotation,
    });
    this.alertSystem = new AlertSystem(this.config.alertRules, {
      logger: moduleLoggers.alertSystem,
    });

    // 设置告警回调
    this.alertSystem.onAlert((alert) => {
      this.logger.warn(`[告警] ${alert.level}: ${alert.message}`);
    });

    // 启动定时轮转（每天执行一次）
    this.startRotationTimer();

    this.logger.info('链路审计系统初始化完成');
  }

  /**
   * 显式依赖校验，缺失时直接失败
   */
  private assertDeps(deps: TraceAuditSystemDeps | undefined): asserts deps is TraceAuditSystemDeps {
    if (!deps?.environment || !deps.logger) {
      throw new VectaHubError('TraceAuditSystem requires explicit environment and logger dependencies', ErrorType.CONFIGURATION);
    }
  }

  /** 启动定时轮转 */
  private startRotationTimer(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
    this.rotationTimer = setInterval(async () => {
      try {
        const result = await this.logRotation.rotate();
        this.logger.info(`定时日志轮转完成: ${JSON.stringify(result)}`);
      } catch (error) {
        this.logger.error(`定时日志轮转失败: ${(error as Error).message}`);
      }
    }, 24 * 60 * 60 * 1000);
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
    status: ExecutionStatus,
    output?: Record<string, unknown>,
    error?: string
  ) {
    const span = this.traceCore.getSpan(spanId);
    if (span) {
      await this.traceCore.completeSpan(spanId, status, output, error);
      // 检查是否触发告警
      await this.alertSystem.checkSpan({ ...span, status, error });
    }
  }

  /** 获取链路追踪 */
  getTrace(traceId: string) {
    return this.traceCore.getTrace(traceId);
  }

  /** 执行查询 */
  query(options: TraceQueryOptions = {}): TraceQueryResult {
    return this.queryEngine.query(options);
  }

  /** 获取统计指标 */
  getMetrics(options: {
    moduleName?: string;
    startTimeFrom?: string;
    startTimeTo?: string;
  } = {}): TraceMetrics {
    return this.queryEngine.getMetrics(options);
  }

  /** 获取拓扑图 */
  getTopology(traceId: string) {
    return this.queryEngine.getTopology(traceId);
  }

  /** 获取告警列表 */
  getAlerts(options?: {
    level?: AlertEvent['level'];
    resolved?: boolean;
    limit?: number;
  }): AlertEvent[] {
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
    this.logger.info('链路审计系统已销毁');
  }
}

export function createTraceAuditSystemWithDeps(
  deps: TraceAuditSystemDeps,
  config?: Partial<TraceAuditConfig>
): TraceAuditSystem {
  return new TraceAuditSystem(deps, config);
}
