/**
 * 工作流引擎链路审计集成适配器
 * Workflow Engine Trace Audit Integration Adapter
 * 
 * 将链路审计系统集成到现有工作流引擎中
 */

import { createTraceAuditSystem, type TraceAuditSystem, type ExecutionStatus, type TraceQueryOptions, type TraceMetrics, type AlertEvent } from '../infrastructure/trace-audit/index.js';
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

/**
 * 工作流链路审计适配器
 * Workflow Trace Audit Adapter
 */
export class WorkflowTraceAuditAdapter {
  private config: TraceAuditIntegrationConfig;
  private traceSystem: TraceAuditSystem | null = null;

  constructor(config?: Partial<TraceAuditIntegrationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enabled) {
      this.traceSystem = createTraceAuditSystem({
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
      this.config.recordInputOutput && output ? { output: output as Record<string, unknown> } : undefined,
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
    if (['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'].includes(s)) {
      return s as ExecutionStatus;
    }
    if (s === 'SUCCESS') return 'COMPLETED';
    if (s === 'ERROR') return 'FAILED';
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
  query(options: TraceQueryOptions = {}) {
    if (!this.traceSystem) {
      return { total: 0, traces: [], hasMore: false };
    }
    return this.traceSystem.query(options);
  }

  /** 获取统计指标 */
  getMetrics(options: TraceQueryOptions = {}) {
    if (!this.traceSystem) {
      return {
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
    }
    return this.traceSystem.getMetrics(options) as TraceMetrics;
  }

  /** 获取告警 */
  getAlerts(options: { limit?: number; offset?: number } = {}) {
    if (!this.traceSystem) {
      return [];
    }
    return this.traceSystem.getAlerts(options) as AlertEvent[];
  }

  /** 获取系统统计 */
  getSystemStats() {
    if (!this.traceSystem) {
      return null;
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
  config?: Partial<TraceAuditIntegrationConfig>
): WorkflowTraceAuditAdapter {
  return new WorkflowTraceAuditAdapter(config);
}
