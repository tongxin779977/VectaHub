import os from 'node:os';
import type { PerformanceMetric, MetricType } from './metrics.js';
import type pino from 'pino';

const MAX_MEMORY_USAGE_PERCENT = 80;
const MIN_HISTORY_SIZE = 10;
const CLEANUP_FACTOR = 0.5;

/**
 * Monitors system health metrics (heap memory, RSS, external memory)
 * and triggers metric-history cleanup when memory usage exceeds safe thresholds.
 */
export class HealthChecker {
  private readonly logger: Pick<pino.Logger, 'info' | 'warn' | 'error'>;
  private readonly getMetricsLength: () => number;
  private readonly trimMetrics: (targetSize: number) => void;
  private readonly addMetricRecords: (metrics: PerformanceMetric[]) => void;
  private readonly recordMetric: (type: MetricType, value: number, unit: string) => void;

  constructor(deps: {
    logger: Pick<pino.Logger, 'info' | 'warn' | 'error'>;
    getMetricsLength: () => number;
    trimMetrics: (targetSize: number) => void;
    addMetricRecords: (metrics: PerformanceMetric[]) => void;
    recordMetric: (type: MetricType, value: number, unit: string) => void;
  }) {
    this.logger = deps.logger;
    this.getMetricsLength = deps.getMetricsLength;
    this.trimMetrics = deps.trimMetrics;
    this.addMetricRecords = deps.addMetricRecords;
    this.recordMetric = deps.recordMetric;
  }

  /**
   * Collects system-level metrics (heap memory, total memory, external memory, RSS)
   * and records them into the metric store.
   */
  collectSystemMetrics(): void {
    const timestamp = Date.now();
    const metrics: PerformanceMetric[] = [];

    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const memUsedPercent = (memUsage.heapUsed / totalMem) * 100;

    metrics.push(
      { timestamp, type: 'memory_used', value: memUsage.heapUsed / 1024 / 1024, unit: 'MB' },
      { timestamp, type: 'memory_total', value: totalMem / 1024 / 1024, unit: 'MB' },
      { timestamp, type: 'memory_usage', value: memUsedPercent, unit: '%' },
      { timestamp, type: 'external_memory', value: memUsage.external / 1024 / 1024, unit: 'MB' },
      { timestamp, type: 'rss_memory', value: memUsage.rss / 1024 / 1024, unit: 'MB' },
    );

    this.addMetricRecords(metrics);
  }

  /**
   * Checks current memory usage and triggers cleanup of old metric records
   * when usage exceeds the configured threshold.
   */
  checkMemoryUsage(): void {
    const memUsedPercent = this.getMemoryUsagePercent();

    if (memUsedPercent > MAX_MEMORY_USAGE_PERCENT && this.getMetricsLength() > MIN_HISTORY_SIZE) {
      this.logger.warn(`Memory usage high (${memUsedPercent.toFixed(1)}%), cleaning up history`);
      this.cleanupOldMetrics();
    }
  }

  private cleanupOldMetrics(): void {
    const currentLength = this.getMetricsLength();
    const targetSize = Math.max(MIN_HISTORY_SIZE, Math.floor(currentLength * CLEANUP_FACTOR));
    const removedCount = currentLength - targetSize;

    this.trimMetrics(targetSize);

    this.logger.info(`Cleaned up ${removedCount} old metric records`);
    this.recordMetric('memory_cleanup', removedCount, 'records');
  }

  /**
   * Returns current process memory usage information.
   * @returns Object containing usedMB, totalMB, and percent.
   */
  getMemoryUsage(): { usedMB: number; totalMB: number; percent: number } {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    return {
      usedMB: memUsage.heapUsed / 1024 / 1024,
      totalMB: totalMem / 1024 / 1024,
      percent: (memUsage.heapUsed / totalMem) * 100,
    };
  }

  private getMemoryUsagePercent(): number {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    return (memUsage.heapUsed / totalMem) * 100;
  }
}
