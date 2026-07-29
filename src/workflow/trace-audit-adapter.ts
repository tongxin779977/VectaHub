/**
 * 工作流引擎链路审计集成适配器
 * Workflow Engine Trace Audit Integration Adapter
 * 
 * 将链路审计系统集成到现有工作流引擎中
 */

import {
  createTraceAuditSystemWithDeps,
  type TraceAuditSystem,
  type TraceAuditSystemDeps,
  type ExecutionStatus,
  type TraceQueryOptions,
  type TraceQueryResult,
  type TraceMetrics,
  type AlertEvent,
} from '../infrastructure/trace-audit/index.js';
import type { Workflow, Step, ExecutionRecord } from '../types/index.js';
import type { ExecuteOptions } from './engine.js';

/** 集成配置 */
export interface TraceAuditIntegrationConfig {
  /** 是否启用链路追踪 */
  enabled: boolean;
  /** 日志目录 */
  logDir?: string;
  /** 是否记录详细输入输出 */
  recordInputOutput: boolean;
  /** 是否启用告警 */
  enableAlerts: boolean;
}

const DEFAULT_CONFIG: TraceAuditIntegrationConfig = {
  enabled: true,
  recordInputOutput: true,
  enableAlerts: true,
};

type AlertQueryOptions = {
  level?: AlertEvent['level'];
  resolved?: boolean;
  limit?: number;
};

type TraceMetricsQueryOptions = Pick<TraceQueryOptions, 'moduleName' | 'startTimeFrom' | 'startTimeTo'>;
type TraceSystemStats = ReturnType<TraceAuditSystem['getSystemStats']>;

const EMPTY_TRACE_QUERY_RESULT: TraceQueryResult = {
  total: 0,
  traces: [],
  hasMore: false,
};

const EMPTY_TRACE_METRICS: TraceMetrics = {
  totalCalls: 0,
  successCount: 0,
  failureCount: 0,
  timeoutCount: 0,
  successRate: 0,
  avgDuration: 0,
  p50Duration: 0,
  p95Duration: 0,
  p99Duration: 0,
  maxDuration: 0,
  minDuration: 0,
  byModule: {},
};

const EMPTY_TRACE_SYSTEM_STATS: TraceSystemStats = {
  activeTraces: 0,
  spanIndexSize: 0,
  queryIndex: {
    traceCount: 0,
    spanCount: 0,
    moduleCount: 0,
  },
  alerts: {
    totalAlerts: 0,
    unresolvedAlerts: 0,
    criticalAlerts: 0,
    warningAlerts: 0,
    infoAlerts: 0,
  },
  storage: {
    logDirSize: 0,
    archiveDirSize: 0,
    logFileCount: 0,
    archiveFileCount: 0,
  },
  writer: {
    queueLength: 0,
    isFlushing: false,
    isDestroyed: false,
    isPaused: false,
    bufferSize: 0,
  },
};

const EXECUTION_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'PAUSED',
  'ABORTED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStepOutput(output: unknown): Record<string, unknown> | undefined {
  if (output === undefined) {
    return undefined;
  }

  if (isRecord(output)) {
    return output;
  }

  return { value: output };
}

/**
 * 工作流链路审计适配器
 * Workflow Trace Audit Adapter
 */
export class WorkflowTraceAuditAdapter {
  private config: TraceAuditIntegrationConfig;
  private traceSystem: TraceAuditSystem | null = null;

  constructor(deps: TraceAuditSystemDeps, config?: Partial<TraceAuditIntegrationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enabled) {
      this.traceSystem = createTraceAuditSystemWithDeps(deps, {
        logDir: this.config.logDir,
      });
    }
  }

  /** 工作流开始追踪 */
  async onWorkflowStart(
    workflow: Workflow,
    executionId: string,
    sessionId: string,
    options?: ExecuteOptions
  ): Promise<{ traceId: string; spanId: string }> {
    if (!this.traceSystem || !this.config.enabled) {
      return { traceId: '', spanId: '' };
    }

    // 创建链路追踪
    const trace = await this.traceSystem.createTrace(
      'WorkflowEngine',
      sessionId,
      {
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId,
        mode: workflow.mode,
        dryRun: String(options?.dryRun ?? false),
      }
    );

    return {
      traceId: trace.traceId,
      spanId: trace.rootSpanId,
    };
  }

  /** 步骤开始追踪 */
  async onStepStart(
    traceId: string,
    parentSpanId: string,
    step: Step,
    _sessionId: string
  ): Promise<string> {
    if (!this.traceSystem || !this.config.enabled || !traceId) {
      return '';
    }

    const span = await this.traceSystem.createSpan(
      traceId,
      parentSpanId,
      'WorkflowEngine',
      `Step:${step.type}`,
      this.config.recordInputOutput ? {
        stepId: step.id,
        cli: step.cli,
        args: step.args,
        dependsOn: step.dependsOn,
      } : undefined,
      { stepId: step.id, stepType: step.type }
    );

    return span.spanId;
  }

  /** 步骤完成追踪 */
  async onStepComplete(
    spanId: string,
    status: string,
    output?: unknown,
    error?: string
  ): Promise<void> {
    if (!this.traceSystem || !this.config.enabled || !spanId) {
      return;
    }

    await this.traceSystem.completeSpan(
      spanId,
      this.mapStatus(status),
      this.config.recordInputOutput ? normalizeStepOutput(output) : undefined,
      error
    );
  }

  /** 工作流完成追踪 */
  async onWorkflowComplete(
    traceId: string,
    execution: ExecutionRecord
  ): Promise<void> {
    if (!this.traceSystem || !this.config.enabled || !traceId) {
      return;
    }

    // 完成根跨度
    await this.traceSystem.completeSpan(
      traceId,
      this.mapStatus(execution.status),
      {
        executionId: execution.executionId,
        stepCount: execution.steps.length,
        duration: execution.duration,
      },
      execution.steps.find((s) => s.status === 'FAILED')?.error
    );

    // 刷新查询索引
    this.traceSystem.refreshIndex();
  }

  private mapStatus(status: string): ExecutionStatus {
    const s = status.toUpperCase();
    if (EXECUTION_STATUSES.has(s as ExecutionStatus)) {
      return s as ExecutionStatus;
    }
    if (s === 'SUCCESS') return 'COMPLETED';
    if (s === 'ERROR') return 'FAILED';
    if (s === 'CANCELLED') return 'ABORTED';
    return 'FAILED'; // Default to FAILED for unknown statuses
  }

  /** 获取链路追踪详情 */
  getTrace(traceId: string) {
    if (!this.traceSystem) {
      return undefined;
    }
    return this.traceSystem.getTrace(traceId);
  }

  /** 查询链路 */
  query(options: TraceQueryOptions = {}): TraceQueryResult {
    if (!this.traceSystem) {
      return EMPTY_TRACE_QUERY_RESULT;
    }
    return this.traceSystem.query(options);
  }

  /** 获取统计指标 */
  getMetrics(options: TraceMetricsQueryOptions = {}): TraceMetrics {
    if (!this.traceSystem) {
      return EMPTY_TRACE_METRICS;
    }
    return this.traceSystem.getMetrics(options);
  }

  /** 获取告警 */
  getAlerts(options: AlertQueryOptions = {}): AlertEvent[] {
    if (!this.traceSystem) {
      return [];
    }
    return this.traceSystem.getAlerts(options);
  }

  /** 获取系统统计 */
  getSystemStats(): TraceSystemStats {
    if (!this.traceSystem) {
      return EMPTY_TRACE_SYSTEM_STATS;
    }
    return this.traceSystem.getSystemStats();
  }

  /** 销毁适配器 */
  async destroy(): Promise<void> {
    if (this.traceSystem) {
      await this.traceSystem.destroy();
    }
  }
}

/**
 * 创建工作流链路审计适配器工厂函数
 * Create Workflow Trace Audit Adapter Factory Function
 */
export function createWorkflowTraceAuditAdapter(
  deps: TraceAuditSystemDeps,
  config?: Partial<TraceAuditIntegrationConfig>
): WorkflowTraceAuditAdapter {
  return new WorkflowTraceAuditAdapter(deps, config);
}
