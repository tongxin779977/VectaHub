/**
 * 链路追踪核心 - Trace 和 Span 管理
 * Trace Core - Trace and Span Management
 */

import { getLogger } from '../../utils/logger.js';
import { redactSensitiveData } from '../../utils/sensitive-data.js';
import type {
  TraceSpan,
  ExecutionTrace,
  TraceId,
  SpanId,
  ModuleName,
  ExecutionStatus,
} from './types.js';
import { AsyncLogWriter } from './async-writer.js';

const logger = getLogger('trace-core');

/** 生成唯一 ID */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** 当前活跃的 Trace 上下文 */
interface ActiveTraceContext {
  traceId: TraceId;
  currentSpanId: SpanId;
}

/** 线程本地存储（模拟） */
const activeTraceContexts = new Map<string, ActiveTraceContext>();

/**
 * 链路追踪核心类
 * Trace Core Class
 */
export class TraceCore {
  private writer: AsyncLogWriter;
  private activeTraces: Map<TraceId, ExecutionTrace> = new Map();
  private spanIndex: Map<SpanId, TraceSpan> = new Map();
  private traceIndex: Map<TraceId, ExecutionTrace> = new Map();

  constructor(writer: AsyncLogWriter) {
    this.writer = writer;
  }

  /** 创建新的链路追踪 */
  async createTrace(
    rootModule: ModuleName,
    sessionId?: string,
    tags?: Record<string, string>
  ): Promise<ExecutionTrace> {
    const traceId = generateId('trace');
    const rootSpanId = generateId('span');
    const now = new Date().toISOString();

    const rootSpan: TraceSpan = {
      spanId: rootSpanId,
      traceId,
      caller: 'system',
      callee: rootModule,
      startTime: now,
      status: 'RUNNING',
      sessionId,
      tags,
    };

    const trace: ExecutionTrace = {
      traceId,
      rootSpanId,
      spans: [rootSpan],
      startTime: now,
      status: 'RUNNING',
      sessionId,
      tags,
    };

    this.activeTraces.set(traceId, trace);
    this.traceIndex.set(traceId, trace);
    this.spanIndex.set(rootSpanId, rootSpan);

    // 写入根跨度
    await this.writer.write(rootSpan);

    logger.debug(`创建链路追踪: traceId=${traceId}, rootSpanId=${rootSpanId}`);

    return trace;
  }

  /** 创建子跨度 */
  async createSpan(
    traceId: TraceId,
    parentSpanId: SpanId,
    caller: ModuleName,
    callee: ModuleName,
    input?: Record<string, unknown>,
    tags?: Record<string, string>
  ): Promise<TraceSpan> {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      throw new Error(`链路追踪不存在: ${traceId}`);
    }

    const spanId = generateId('span');
    const now = new Date().toISOString();

    const span: TraceSpan = {
      spanId,
      traceId,
      parentSpanId,
      caller,
      callee,
      startTime: now,
      status: 'RUNNING',
      input: input ? redactSensitiveData(input) as Record<string, unknown> : undefined,
      sessionId: trace.sessionId,
      tags: { ...trace.tags, ...tags },
    };

    trace.spans.push(span);
    this.spanIndex.set(spanId, span);

    // 写入跨度
    await this.writer.write(span);

    return span;
  }

  /** 完成跨度 */
  async completeSpan(
    spanId: SpanId,
    status: ExecutionStatus,
    output?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    const span = this.spanIndex.get(spanId);
    if (!span) {
      throw new Error(`跨度不存在: ${spanId}`);
    }

    const endTime = new Date().toISOString();
    const startTime = new Date(span.startTime).getTime();
    const endTimeMs = new Date(endTime).getTime();
    const duration = endTimeMs - startTime;

    span.endTime = endTime;
    span.duration = duration;
    span.status = status;
    span.output = output ? redactSensitiveData(output) as Record<string, unknown> : undefined;
    span.error = error;

    // 更新链路状态
    const trace = this.activeTraces.get(span.traceId);
    if (trace) {
      if (status === 'FAILED' || status === 'TIMEOUT') {
        trace.status = status;
        trace.error = error;
      }

      // 检查是否所有跨度都已完成
      const allCompleted = trace.spans.every(
        (s) => s.endTime !== undefined
      );

      if (allCompleted) {
        this.completeTrace(trace.traceId);
      }
    }

    // 更新跨度
    await this.writer.write(span);

    logger.debug(`完成跨度: spanId=${spanId}, status=${status}, duration=${duration}ms`);
  }

  /** 完成链路追踪 */
  private completeTrace(traceId: TraceId): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      return;
    }

    const endTime = new Date().toISOString();
    const startTimeMs = new Date(trace.startTime).getTime();
    const endTimeMs = new Date(endTime).getTime();

    trace.endTime = endTime;
    trace.totalDuration = endTimeMs - startTimeMs;

    if (trace.status === 'RUNNING') {
      trace.status = 'COMPLETED';
    }

    this.activeTraces.delete(traceId);

    logger.debug(`完成链路追踪: traceId=${traceId}, duration=${trace.totalDuration}ms`);
  }

  /** 获取链路追踪 */
  getTrace(traceId: TraceId): ExecutionTrace | undefined {
    return this.traceIndex.get(traceId);
  }

  /** 获取跨度 */
  getSpan(spanId: SpanId): TraceSpan | undefined {
    return this.spanIndex.get(spanId);
  }

  /** 获取活跃链路数量 */
  getActiveTraceCount(): number {
    return this.activeTraces.size;
  }

  /** 获取跨度索引大小 */
  getSpanIndexSize(): number {
    return this.spanIndex.size;
  }

  /** 获取所有链路追踪 */
  getAllTraces(): ExecutionTrace[] {
    return Array.from(this.traceIndex.values());
  }

  /** 清理已完成的链路追踪 */
  cleanupCompletedTraces(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [traceId, trace] of this.traceIndex.entries()) {
      if (trace.endTime) {
        const ageMs = now - new Date(trace.endTime).getTime();
        if (ageMs > maxAgeMs && !this.activeTraces.has(traceId)) {
          this.traceIndex.delete(traceId);
          cleanedCount++;
        }
      }
    }

    logger.debug(`清理已完成链路追踪: ${cleanedCount} 个`);
    return cleanedCount;
  }

  /** 销毁追踪核心 */
  async destroy(): Promise<void> {
    // 完成所有活跃链路
    for (const traceId of this.activeTraces.keys()) {
      this.completeTrace(traceId);
    }

    this.activeTraces.clear();
    this.spanIndex.clear();
    this.traceIndex.clear();
  }
}

/**
 * 创建链路追踪核心工厂函数
 * Create Trace Core Factory Function
 */
export function createTraceCore(writer: AsyncLogWriter): TraceCore {
  return new TraceCore(writer);
}

/**
 * 便捷函数：在链路追踪上下文中执行操作
 * Utility: Execute operation within trace context
 */
export async function withTrace<T>(
  traceCore: TraceCore,
  traceId: TraceId,
  parentSpanId: SpanId,
  caller: ModuleName,
  callee: ModuleName,
  operation: () => Promise<T>,
  input?: Record<string, unknown>,
  tags?: Record<string, string>
): Promise<T> {
  const span = await traceCore.createSpan(
    traceId,
    parentSpanId,
    caller,
    callee,
    input,
    tags
  );

  try {
    const result = await operation();
    await traceCore.completeSpan(span.spanId, 'COMPLETED', { result });
    return result;
  } catch (error) {
    const err = error as Error;
    await traceCore.completeSpan(span.spanId, 'FAILED', undefined, err.message);
    throw error;
  }
}
