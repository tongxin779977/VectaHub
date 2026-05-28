import { PerformanceObserver, PerformanceEntry } from 'node:perf_hooks';
import type { PerformanceMetric, MetricType, MetricRecord, AlertConfig, Alert } from './metrics.js';
import type { MetricSummary } from './metrics.js';
import type pino from 'pino';
import { AlertManager, DEFAULT_ALERT_CONFIG } from './alert-manager.js';
import { HealthChecker } from './health-checker.js';

const MAX_HISTORY_SIZE = 1000;
const BATCH_FLUSH_INTERVAL = 500;
const BATCH_MAX_SIZE = 100;

/**
 * Performance monitoring orchestrator that coordinates metric collection,
 * batch processing, health checks, and alert evaluation.
 *
 * Delegates alert/threshold logic to {@link AlertManager} and system
 * health monitoring to {@link HealthChecker}.
 */
export class PerformanceMonitor {
  private readonly logger: Pick<pino.Logger, 'info' | 'warn' | 'error'>;
  private readonly alertManager: AlertManager;
  private readonly healthChecker: HealthChecker;
  private metrics: MetricRecord[] = [];
  private isRunning = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private maxHistorySize = 100;
  private errorCount = 0;
  private successCount = 0;
  private batchBuffer: PerformanceMetric[] = [];
  private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: {
    logger: Pick<pino.Logger, 'info' | 'warn' | 'error'>;
    getLogDir: () => string;
  }) {
    this.logger = deps.logger;

    this.alertManager = new AlertManager({
      logger: deps.logger,
      getLogDir: deps.getLogDir,
      config: { ...DEFAULT_ALERT_CONFIG },
    });

    this.healthChecker = new HealthChecker({
      logger: deps.logger,
      getMetricsLength: () => this.metrics.length,
      trimMetrics: (targetSize: number) => {
        this.metrics = this.metrics.slice(-targetSize);
      },
      addMetricRecords: (metrics: PerformanceMetric[]) => this.recordMetrics(metrics),
      recordMetric: (type: MetricType, value: number, unit: string) => this.recordMetric(type, value, unit),
    });

    this.setupPerformanceObserver();
  }

  private setupPerformanceObserver(): void {
    try {
      const observer = new PerformanceObserver((entries) => {
        entries.getEntries().forEach((entry) => {
          try {
            this.recordPerformanceEntry(entry);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to record performance entry: ${errMsg}`);
          }
        });
      });

      observer.observe({
        entryTypes: ['measure', 'function', 'gc'],
        buffered: true,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`PerformanceObserver unavailable, skipping setup: ${errMsg}`);
    }
  }

  private recordPerformanceEntry(entry: PerformanceEntry): void {
    if (entry.entryType === 'measure') {
      this.recordMetric('execution_time', entry.duration, 'ms', {
        name: entry.name,
        category: 'performance',
      });
    }
  }

  /**
   * Starts the periodic monitoring loop.
   * @param intervalMs - Sampling interval in milliseconds (default: 5000).
   */
  start(intervalMs: number = 5000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.info('Performance monitor started');

    this.intervalId = setInterval(() => {
      this.healthChecker.collectSystemMetrics();
      this.alertManager.checkAlerts(this.getRecentMetrics());
      this.healthChecker.checkMemoryUsage();
    }, intervalMs);
  }

  /**
   * Stops the monitoring loop and flushes any buffered metrics.
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.flushBatch();
    this.logger.info('Performance monitor stopped');
  }

  /**
   * Records a single metric value. Metrics are batched and flushed periodically
   * or when the batch reaches {@link BATCH_MAX_SIZE}.
   * @param type - The metric type identifier.
   * @param value - The numeric value.
   * @param unit - The unit of measurement.
   * @param tags - Optional key-value tags for additional context.
   */
  recordMetric(type: MetricType, value: number, unit: string, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = { timestamp: Date.now(), type, value, unit, tags };
    this.batchBuffer.push(metric);

    if (this.batchBuffer.length >= BATCH_MAX_SIZE) {
      this.flushBatch();
    } else if (!this.flushTimeoutId) {
      this.flushTimeoutId = setTimeout(() => this.flushBatch(), BATCH_FLUSH_INTERVAL);
    }

    if (process.env.NODE_ENV === 'test') {
      this.flushBatch();
    }
  }

  /** Immediately flushes any buffered metrics. */
  flush(): void {
    this.flushBatch();
  }

  private flushBatch(): void {
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }

    if (this.batchBuffer.length === 0) {
      return;
    }

    const timestamp = Date.now();
    const metricsToAdd = [...this.batchBuffer];
    this.batchBuffer = [];

    const lastRecord = this.metrics[this.metrics.length - 1];
    if (lastRecord && timestamp - lastRecord.timestamp < 1000) {
      lastRecord.metrics.push(...metricsToAdd);
    } else {
      this.metrics.push({ timestamp, metrics: metricsToAdd });
    }

    while (this.metrics.length > MAX_HISTORY_SIZE) {
      this.metrics.shift();
    }
  }

  private recordMetrics(metrics: PerformanceMetric[]): void {
    const timestamp = Date.now();
    this.metrics.push({ timestamp, metrics });

    if (this.metrics.length > MAX_HISTORY_SIZE) {
      this.metrics.shift();
    }
  }

  /** Increments the error counter and records the running total as a metric. */
  incrementError(): void {
    this.errorCount++;
    this.recordMetric('error_count', this.errorCount, 'count');
  }

  /** Increments the success counter and records the computed success rate. */
  incrementSuccess(): void {
    this.successCount++;
    const successRate = this.successCount + this.errorCount > 0
      ? (this.successCount / (this.successCount + this.errorCount)) * 100
      : 100;
    this.recordMetric('success_rate', successRate, '%');
  }

  /**
   * Records a response time metric.
   * @param durationMs - The response duration in milliseconds.
   * @param operation - Optional operation name for tagging.
   */
  recordResponseTime(durationMs: number, operation?: string): void {
    this.recordMetric('response_time', durationMs, 'ms', operation ? { operation } : undefined);
  }

  /**
   * Records an execution time metric with a label tag.
   * @param label - A human-readable label for the timed operation.
   * @param durationMs - The execution duration in milliseconds.
   */
  recordExecutionTime(label: string, durationMs: number): void {
    this.recordMetric('execution_time', durationMs, 'ms', { label });
  }

  /** Returns a copy of all recorded metric batches. */
  getMetrics(): MetricRecord[] {
    return [...this.metrics];
  }

  /** Returns the metrics from the most recent batch, or an empty array if none exist. */
  getRecentMetrics(): PerformanceMetric[] {
    if (this.metrics.length === 0) return [];
    return [...this.metrics[this.metrics.length - 1].metrics];
  }

  /**
   * Returns aggregated summary statistics (avg, max, min, count) per metric type.
   * @returns A map of metric type to its aggregated statistics.
   */
  getSummary(): MetricSummary {
    const summary: MetricSummary = {};

    for (const record of this.metrics) {
      for (const metric of record.metrics) {
        if (!summary[metric.type]) {
          summary[metric.type] = { avg: 0, max: -Infinity, min: Infinity, count: 0 };
        }
        summary[metric.type].avg += metric.value;
        summary[metric.type].max = Math.max(summary[metric.type].max, metric.value);
        summary[metric.type].min = Math.min(summary[metric.type].min, metric.value);
        summary[metric.type].count++;
      }
    }

    for (const key of Object.keys(summary)) {
      if (summary[key].count > 0) {
        summary[key].avg = summary[key].avg / summary[key].count;
      }
    }

    return summary;
  }

  /**
   * Returns alerts filtered by resolved status.
   * @param resolved - If true, returns resolved alerts; otherwise returns active alerts.
   */
  getAlerts(resolved: boolean = false): Alert[] {
    return this.alertManager.getAlerts(resolved);
  }

  /** Resets all metrics, alerts, and counters to their initial state. */
  reset(): void {
    this.metrics = [];
    this.errorCount = 0;
    this.successCount = 0;
    this.alertManager.reset();
    this.logger.info('Performance monitor reset');
  }

  /**
   * Merges the given partial config into the current alert configuration.
   * @param config - Partial alert configuration to merge.
   */
  setConfig(config: Partial<AlertConfig>): void {
    const current = this.alertManager.getConfig();
    this.alertManager.updateConfig({ ...current, ...config });
  }

  /** Returns a shallow copy of the current alert configuration. */
  getConfig(): AlertConfig {
    return this.alertManager.getConfig();
  }

  /**
   * Returns current process memory usage information.
   * @returns Object containing usedMB, totalMB, and percent.
   */
  getMemoryUsage(): { usedMB: number; totalMB: number; percent: number } {
    return this.healthChecker.getMemoryUsage();
  }

  /** Returns the number of metric batches currently stored in history. */
  getHistorySize(): number {
    return this.metrics.length;
  }

  /**
   * Sets the maximum number of metric batches retained in history.
   * Trims older records if the current history exceeds the new limit.
   * @param size - Desired maximum history size, clamped to [10, 1000].
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = Math.max(10, Math.min(MAX_HISTORY_SIZE, size));
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics = this.metrics.slice(-this.maxHistorySize);
    }
  }
}
