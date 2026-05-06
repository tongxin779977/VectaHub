export interface PerformanceMetric {
  timestamp: number;
  type: MetricType;
  value: number;
  unit: string;
  tags?: Record<string, string>;
}

export type MetricType = 
  | 'cpu_usage'
  | 'memory_usage'
  | 'memory_total'
  | 'memory_used'
  | 'response_time'
  | 'execution_time'
  | 'queue_length'
  | 'error_count'
  | 'success_rate'
  | 'external_memory'
  | 'rss_memory'
  | 'memory_cleanup';

export interface MetricThreshold {
  type: MetricType;
  min?: number;
  max?: number;
  warning?: { min?: number; max?: number };
  critical?: { min?: number; max?: number };
}

export interface MetricRecord {
  timestamp: number;
  metrics: PerformanceMetric[];
}

export interface AlertConfig {
  enabled: boolean;
  thresholds: MetricThreshold[];
  notificationChannels: ('console' | 'file' | 'webhook')[];
  webhookUrl?: string;
}

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
