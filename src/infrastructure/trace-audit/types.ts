/**
 * 模块执行链路审计日志系统 - 核心类型定义
 * Module Execution Chain Audit Log System - Core Type Definitions
 */

/** 链路追踪 ID 类型 */
export type TraceId = string;

/** 跨度 ID 类型 */
export type SpanId = string;

/** 模块名称 */
export type ModuleName = string;

// 从统一类型定义导入并导出 ExecutionStatus
import type { ExecutionStatus } from '../../types/workflow.js';
export type { ExecutionStatus };

/** 告警级别 - 统一值集 */
export type AlertLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/** 通知渠道 */
export type NotificationChannel = 'console' | 'file' | 'webhook' | 'email';

/** 链路追踪跨度 - 记录单次模块调用 */
export interface TraceSpan {
  /** 跨度 ID */
  spanId: SpanId;
  /** 链路 ID */
  traceId: TraceId;
  /** 父跨度 ID（用于构建调用链） */
  parentSpanId?: SpanId;
  /** 调用方模块 */
  caller: ModuleName;
  /** 被调用方模块 */
  callee: ModuleName;
  /** 调用时间 */
  startTime: string;
  /** 结束时间 */
  endTime?: string;
  /** 执行时长（毫秒） */
  duration?: number;
  /** 执行状态 */
  status: ExecutionStatus;
  /** 返回状态码 */
  statusCode?: number;
  /** 错误信息 */
  error?: string;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 输出结果 */
  output?: Record<string, unknown>;
  /** 执行上下文 */
  context?: Record<string, unknown>;
  /** 标签（用于分类和过滤） */
  tags?: Record<string, string>;
  /** 会话 ID */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
}

/** 链路追踪 - 包含完整的调用链 */
export interface ExecutionTrace {
  /** 链路 ID */
  traceId: TraceId;
  /** 根跨度 ID */
  rootSpanId: SpanId;
  /** 所有跨度 */
  spans: TraceSpan[];
  /** 链路开始时间 */
  startTime: string;
  /** 链路结束时间 */
  endTime?: string;
  /** 总执行时长（毫秒） */
  totalDuration?: number;
  /** 链路状态 */
  status: ExecutionStatus;
  /** 错误信息 */
  error?: string;
  /** 标签 */
  tags?: Record<string, string>;
  /** 会话 ID */
  sessionId?: string;
}

/** 审计日志条目 - 扩展自现有 AuditEvent */
export interface AuditLogEntry extends TraceSpan {
  /** 事件类型 */
  eventType: string;
  /** 操作名称 */
  action: string;
  /** 是否成功 */
  success: boolean;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 告警规则 */
export interface AlertRule {
  /** 规则 ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 告警级别 */
  level: AlertLevel;
  /** 触发条件类型 */
  conditionType: 'timeout' | 'error_rate' | 'duration_threshold' | 'status';
  /** 触发条件值 */
  conditionValue: number | string;
  /** 通知渠道 */
  notificationChannels: NotificationChannel[];
  /** Webhook URL */
  webhookUrl?: string;
  /** 是否启用 */
  enabled: boolean;
}

/** 告警事件 */
export interface AlertEvent {
  /** 告警 ID */
  id: string;
  /** 规则 ID */
  ruleId: string;
  /** 告警级别 */
  level: AlertLevel;
  /** 告警消息 */
  message: string;
  /** 触发时间 */
  timestamp: string;
  /** 关联的链路 ID */
  traceId?: TraceId;
  /** 关联的跨度 ID */
  spanId?: SpanId;
  /** 当前值 */
  currentValue: number | string;
  /** 阈值 */
  threshold: number | string;
  /** 是否已解决 */
  resolved: boolean;
  /** 解决时间 */
  resolvedAt?: string;
}

/** 查询条件 */
export interface TraceQueryOptions {
  /** 链路 ID */
  traceId?: TraceId;
  /** 跨度 ID */
  spanId?: SpanId;
  /** 模块名称 */
  moduleName?: ModuleName;
  /** 执行状态 */
  status?: ExecutionStatus;
  /** 开始时间范围 */
  startTimeFrom?: string;
  startTimeTo?: string;
  /** 执行时长范围（毫秒） */
  durationMin?: number;
  durationMax?: number;
  /** 标签过滤 */
  tags?: Record<string, string>;
  /** 会话 ID */
  sessionId?: string;
  /** 错误关键字 */
  errorKeyword?: string;
  /** 分页 */
  limit?: number;
  offset?: number;
  /** 排序字段 */
  sortBy?: 'startTime' | 'duration' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/** 查询结果 */
export interface TraceQueryResult {
  /** 总记录数 */
  total: number;
  /** 当前页数据 */
  traces: ExecutionTrace[];
  /** 是否有更多 */
  hasMore: boolean;
}

/** 统计指标 */
export interface TraceMetrics {
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
  /** 超时次数 */
  timeoutCount: number;
  /** 成功率 */
  successRate: number;
  /** 平均执行时长（毫秒） */
  avgDuration: number;
  /** P50 执行时长（毫秒） */
  p50Duration: number;
  /** P95 执行时长（毫秒） */
  p95Duration: number;
  /** P99 执行时长（毫秒） */
  p99Duration: number;
  /** 最大执行时长（毫秒） */
  maxDuration: number;
  /** 最小执行时长（毫秒） */
  minDuration: number;
  /** 按模块统计 */
  byModule: Record<ModuleName, {
    calls: number;
    successRate: number;
    avgDuration: number;
  }>;
}

/** 日志轮转配置 */
export interface LogRotationConfig {
  /** 是否启用轮转 */
  enabled: boolean;
  /** 单个日志文件最大大小（MB） */
  maxFileSizeMB: number;
  /** 保留天数 */
  retentionDays: number;
  /** 归档目录 */
  archiveDir?: string;
  /** 是否压缩归档 */
  compressArchive: boolean;
}

/** 异步写入配置 */
export interface AsyncWriteConfig {
  /** 是否启用异步写入 */
  enabled: boolean;
  /** 缓冲区大小 */
  bufferSize: number;
  /** 刷盘间隔（毫秒） */
  flushIntervalMs: number;
  /** 最大队列长度 */
  maxQueueLength: number;
}

/** 系统配置 */
export interface TraceAuditConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 日志目录 */
  logDir: string;
  /** 异步写入配置 */
  asyncWrite: AsyncWriteConfig;
  /** 日志轮转配置 */
  logRotation: LogRotationConfig;
  /** 告警规则 */
  alertRules: AlertRule[];
  /** 通知渠道配置 */
  notificationConfig?: Record<string, unknown>;
}

/** 可视化拓扑节点 */
export interface TopologyNode {
  /** 节点 ID */
  id: SpanId;
  /** 模块名称 */
  name: ModuleName;
  /** 节点类型 */
  type: 'root' | 'service' | 'database' | 'external' | 'queue';
  /** 执行状态 */
  status: ExecutionStatus;
  /** 执行时长 */
  duration?: number;
  /** 错误信息 */
  error?: string;
}

/** 可视化拓扑边 */
export interface TopologyEdge {
  /** 源节点 ID */
  source: SpanId;
  /** 目标节点 ID */
  target: SpanId;
  /** 调用类型 */
  type: 'sync' | 'async' | 'callback';
  /** 调用次数 */
  callCount: number;
  /** 平均时长 */
  avgDuration: number;
}

/** 可视化拓扑图 */
export interface TopologyGraph {
  /** 节点列表 */
  nodes: TopologyNode[];
  /** 边列表 */
  edges: TopologyEdge[];
  /** 统计信息 */
  metrics: TraceMetrics;
}
