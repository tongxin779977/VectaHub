/**
 * 多维度查询引擎 - 支持按多种条件查询审计日志
 * Multi-dimensional Query Engine - Supports querying audit logs by various conditions
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../logger/index.js';
import type {
  ExecutionTrace,
  TraceSpan,
  TraceQueryOptions,
  TraceQueryResult,
  TraceMetrics,
  TraceId,
  SpanId,
  ModuleName,
  ExecutionStatus,
} from './types.js';

export interface QueryEngineDeps {
  logger: Logger;
}

/**
 * 多维度查询引擎类
 * Multi-dimensional Query Engine Class
 */
export class QueryEngine {
  private logDir: string;
  private logger: Logger;
  private traceCache: Map<TraceId, ExecutionTrace> = new Map();
  private spanIndex: Map<SpanId, TraceSpan> = new Map();
  private moduleIndex: Map<ModuleName, TraceSpan[]> = new Map();
  private statusIndex: Map<ExecutionStatus, TraceSpan[]> = new Map();

  constructor(logDir: string, deps: QueryEngineDeps) {
    if (!deps.logger) {
      throw new Error('QueryEngine requires a logger dependency');
    }

    this.logDir = logDir;
    this.logger = deps.logger;
  }

  /** 加载日志文件到内存索引 */
  loadLogs(): void {
    const files = this.getLogFiles();
    
    for (const file of files) {
      this.loadLogFile(file);
    }

    this.logger.info(`加载日志完成: ${files.length} 个文件, ${this.spanIndex.size} 个跨度`);
  }

  /** 获取日志文件列表 */
  private getLogFiles(): string[] {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    return fs.readdirSync(this.logDir)
      .filter((f) => f.endsWith('-traces.jsonl'))
      .map((f) => path.join(this.logDir, f))
      .sort();
  }

  /** 加载单个日志文件 */
  private loadLogFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const span = JSON.parse(line) as TraceSpan;
          this.indexSpan(span);
        } catch {
          continue;
        }
      }
    } catch (error) {
      this.logger.warn(`加载日志文件失败: ${filePath}, ${(error as Error).message}`);
    }
  }

  /** 索引跨度 */
  private indexSpan(span: TraceSpan): void {
    // 添加到跨度索引
    this.spanIndex.set(span.spanId, span);

    // 添加到模块索引
    if (!this.moduleIndex.has(span.callee)) {
      this.moduleIndex.set(span.callee, []);
    }
    this.moduleIndex.get(span.callee)!.push(span);

    // 添加到状态索引
    if (!this.statusIndex.has(span.status)) {
      this.statusIndex.set(span.status, []);
    }
    this.statusIndex.get(span.status)!.push(span);

    // 添加到链路缓存
    if (!this.traceCache.has(span.traceId)) {
      this.traceCache.set(span.traceId, {
        traceId: span.traceId,
        rootSpanId: span.traceId.includes('span') ? span.spanId : '',
        spans: [],
        startTime: span.startTime,
        status: span.status,
        sessionId: span.sessionId,
        tags: span.tags,
      });
    }

    const trace = this.traceCache.get(span.traceId)!;
    trace.spans.push(span);

    if (!span.parentSpanId) {
      trace.rootSpanId = span.spanId;
    }

    // 更新链路状态和时间
    if (span.endTime) {
      trace.endTime = span.endTime;
      trace.totalDuration = span.duration;
    }

    if (span.status === 'FAILED' || span.status === 'TIMEOUT') {
      trace.status = span.status;
    }
  }

  /** 执行查询 */
  query(options: TraceQueryOptions = {}): TraceQueryResult {
    let spans = Array.from(this.spanIndex.values());

    // 按链路 ID 过滤
    if (options.traceId) {
      spans = spans.filter((s) => s.traceId === options.traceId);
    }

    // 按跨度 ID 过滤
    if (options.spanId) {
      spans = spans.filter((s) => s.spanId === options.spanId);
    }

    // 按模块名称过滤
    if (options.moduleName) {
      spans = spans.filter((s) => s.callee === options.moduleName);
    }

    // 按执行状态过滤
    if (options.status) {
      spans = spans.filter((s) => s.status === options.status);
    }

    // 按时间范围过滤
    if (options.startTimeFrom) {
      spans = spans.filter((s) => s.startTime >= options.startTimeFrom!);
    }
    if (options.startTimeTo) {
      spans = spans.filter((s) => s.startTime <= options.startTimeTo!);
    }

    // 按执行时长过滤
    if (options.durationMin !== undefined) {
      spans = spans.filter((s) => (s.duration ?? 0) >= options.durationMin!);
    }
    if (options.durationMax !== undefined) {
      spans = spans.filter((s) => (s.duration ?? 0) <= options.durationMax!);
    }

    // 按标签过滤
    if (options.tags) {
      spans = spans.filter((s) => {
        if (!s.tags) return false;
        return Object.entries(options.tags!).every(
          ([key, value]) => s.tags![key] === value
        );
      });
    }

    // 按会话 ID 过滤
    if (options.sessionId) {
      spans = spans.filter((s) => s.sessionId === options.sessionId);
    }

    // 按错误关键字过滤
    if (options.errorKeyword) {
      spans = spans.filter(
        (s) => s.error?.includes(options.errorKeyword!) ?? false
      );
    }

    // 排序
    const sortBy = options.sortBy ?? 'startTime';
    const sortOrder = options.sortOrder ?? 'desc';

    spans.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'startTime':
          comparison = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
          break;
        case 'duration':
          comparison = (a.duration ?? 0) - (b.duration ?? 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // 分页
    const total = spans.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    const paginatedSpans = spans.slice(offset, offset + limit);

    // 按链路 ID 分组
    const traceMap = new Map<TraceId, ExecutionTrace>();
    for (const span of paginatedSpans) {
      if (!traceMap.has(span.traceId)) {
        const trace = this.traceCache.get(span.traceId);
        if (trace) {
          traceMap.set(span.traceId, trace);
        }
      }
    }

    const traces = Array.from(traceMap.values());

    return {
      total,
      traces,
      hasMore: offset + limit < total,
    };
  }

  /** 获取统计指标 */
  getMetrics(options: {
    moduleName?: ModuleName;
    startTimeFrom?: string;
    startTimeTo?: string;
  } = {}): TraceMetrics {
    let spans = Array.from(this.spanIndex.values());

    // 按模块过滤
    if (options.moduleName) {
      spans = spans.filter((s) => s.callee === options.moduleName);
    }

    // 按时间范围过滤
    if (options.startTimeFrom) {
      spans = spans.filter((s) => s.startTime >= options.startTimeFrom!);
    }
    if (options.startTimeTo) {
      spans = spans.filter((s) => s.startTime <= options.startTimeTo!);
    }

    const durations = spans
      .map((s) => s.duration ?? 0)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);

    const totalCalls = spans.length;
    const successCount = spans.filter((s) => s.status === 'COMPLETED').length;
    const failureCount = spans.filter((s) => s.status === 'FAILED').length;
    const timeoutCount = spans.filter((s) => s.status === 'TIMEOUT').length;
    const successRate = totalCalls > 0 ? (successCount / totalCalls) * 100 : 0;

    const avgDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const p50Duration = this.getPercentile(durations, 50);
    const p95Duration = this.getPercentile(durations, 95);
    const p99Duration = this.getPercentile(durations, 99);
    const maxDuration = durations.length > 0 ? durations[durations.length - 1] : 0;
    const minDuration = durations.length > 0 ? durations[0] : 0;

    // 按模块统计
    const byModule: Record<ModuleName, { calls: number; successRate: number; avgDuration: number }> = {};
    for (const [moduleName, moduleSpans] of this.moduleIndex.entries()) {
      const moduleDurations = moduleSpans
        .map((s) => s.duration ?? 0)
        .filter((d) => d > 0);
      
      const moduleSuccessCount = moduleSpans.filter((s) => s.status === 'COMPLETED').length;
      const moduleTotal = moduleSpans.length;

      byModule[moduleName] = {
        calls: moduleTotal,
        successRate: moduleTotal > 0 ? (moduleSuccessCount / moduleTotal) * 100 : 0,
        avgDuration: moduleDurations.length > 0
          ? moduleDurations.reduce((sum, d) => sum + d, 0) / moduleDurations.length
          : 0,
      };
    }

    return {
      totalCalls,
      successCount,
      failureCount,
      timeoutCount,
      successRate,
      avgDuration,
      p50Duration,
      p95Duration,
      p99Duration,
      maxDuration,
      minDuration,
      byModule,
    };
  }

  /** 计算百分位数 */
  private getPercentile(sortedData: number[], percentile: number): number {
    if (sortedData.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedData.length) - 1;
    return sortedData[Math.max(0, index)];
  }

  /** 获取链路拓扑图数据 */
  getTopology(traceId: TraceId): {
    nodes: Array<{ id: string; name: string; status: string; duration?: number }>;
    edges: Array<{ source: string; target: string }>;
  } {
    const trace = this.traceCache.get(traceId);
    if (!trace) {
      return { nodes: [], edges: [] };
    }

    const nodes = trace.spans.map((span) => ({
      id: span.spanId,
      name: span.callee,
      status: span.status,
      duration: span.duration,
    }));

    const edges = trace.spans
      .filter((span) => span.parentSpanId)
      .map((span) => ({
        source: span.parentSpanId!,
        target: span.spanId,
      }));

    return { nodes, edges };
  }

  /** 刷新索引（重新加载日志） */
  refresh(): void {
    this.traceCache.clear();
    this.spanIndex.clear();
    this.moduleIndex.clear();
    this.statusIndex.clear();
    this.loadLogs();
  }

  /** 获取索引统计 */
  getIndexStats(): {
    traceCount: number;
    spanCount: number;
    moduleCount: number;
  } {
    return {
      traceCount: this.traceCache.size,
      spanCount: this.spanIndex.size,
      moduleCount: this.moduleIndex.size,
    };
  }
}

/**
 * 创建查询引擎工厂函数
 * Create Query Engine Factory Function
 */
export function createQueryEngine(logDir: string, deps: QueryEngineDeps): QueryEngine {
  return new QueryEngine(logDir, deps);
}
