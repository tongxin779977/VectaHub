/**
 * Represents a single performance data point with a timestamp, type, value, and optional tags.
 */
export interface PerformanceMetric {
  timestamp: number;
  type: MetricType;
  value: number;
  unit: string;
  tags?: Record<string, string>;
}

/** Union of all recognized metric type identifiers. */
export type MetricType =
  | 'cpu_usage'
  | 'memory_usage'
  | 'memory_total'
  | 'memory_used'
  | 'response_time'
  | 'execution_time'
  | 'queue_length'
  | 'error_count'
  | 'error_rate'
  | 'success_rate'
  | 'cache_hit_rate'
  | 'external_memory'
  | 'rss_memory'
  | 'memory_cleanup';

/** Defines warning and critical threshold boundaries for a single metric type. */
export interface MetricThreshold {
  type: MetricType;
  min?: number;
  max?: number;
  warning?: { min?: number; max?: number };
  critical?: { min?: number; max?: number };
}

/** A timestamped batch of performance metrics recorded together. */
export interface MetricRecord {
  timestamp: number;
  metrics: PerformanceMetric[];
}

/** Configuration for the alerting subsystem including thresholds and notification channels. */
export interface AlertConfig {
  enabled: boolean;
  thresholds: MetricThreshold[];
  notificationChannels: ('console' | 'file' | 'webhook')[];
  webhookUrl?: string;
}

/** Represents an alert instance with its lifecycle state (active or resolved). */
export interface Alert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  timestamp: number;
  metricType: MetricType;
  currentValue: number;
  threshold: number;
  resolved: boolean;
}

/** Aggregated statistics for a single metric type across all recorded data points. */
export interface MetricSummaryEntry {
  avg: number;
  max: number;
  min: number;
  count: number;
}

/** Map of metric type identifiers to their aggregated summary statistics. */
export type MetricSummary = Record<string, MetricSummaryEntry>;
