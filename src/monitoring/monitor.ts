import { performance, PerformanceObserver, PerformanceEntry } from 'perf_hooks';
import { createConsoleLogger } from '../utils/logger.js';
import { type PerformanceMetric, type MetricType, type MetricRecord, type AlertConfig, type Alert, type MetricThreshold } from './metrics.js';

const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  thresholds: [
    { type: 'cpu_usage', warning: { max: 80 }, critical: { max: 95 } },
    { type: 'memory_usage', warning: { max: 85 }, critical: { max: 95 } },
    { type: 'response_time', warning: { max: 1000 }, critical: { max: 5000 } },
    { type: 'success_rate', warning: { min: 95 }, critical: { min: 90 } },
  ],
  notificationChannels: ['console'],
};

export class PerformanceMonitor {
  private logger = createConsoleLogger('monitor');
  private config: AlertConfig = DEFAULT_CONFIG;
  private metrics: MetricRecord[] = [];
  private alerts: Alert[] = [];
  private isRunning = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private maxHistorySize = 100;
  private errorCount = 0;
  private successCount = 0;

  constructor() {
    this.setupPerformanceObserver();
  }

  private setupPerformanceObserver(): void {
    const observer = new PerformanceObserver((entries) => {
      entries.getEntries().forEach((entry) => {
        this.recordPerformanceEntry(entry);
      });
    });

    observer.observe({ 
      entryTypes: ['measure', 'function', 'gc'],
      buffered: true 
    });
  }

  private recordPerformanceEntry(entry: PerformanceEntry): void {
    if (entry.entryType === 'measure') {
      this.recordMetric('execution_time', entry.duration, 'ms', { 
        name: entry.name,
        category: 'performance'
      });
    }
  }

  start(intervalMs: number = 5000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.info('Performance monitor started');

    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
      this.checkAlerts();
    }, intervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger.info('Performance monitor stopped');
  }

  private collectSystemMetrics(): void {
    const timestamp = Date.now();
    const metrics: PerformanceMetric[] = [];

    const memUsage = process.memoryUsage();
    const totalMem = this.getTotalMemory();
    const memUsedPercent = (memUsage.heapUsed / totalMem) * 100;

    metrics.push(
      { timestamp, type: 'memory_used', value: memUsage.heapUsed / 1024 / 1024, unit: 'MB' },
      { timestamp, type: 'memory_total', value: totalMem / 1024 / 1024, unit: 'MB' },
      { timestamp, type: 'memory_usage', value: memUsedPercent, unit: '%' }
    );

    this.recordMetrics(metrics);
  }

  private getTotalMemory(): number {
    const os = require('os');
    return os.totalmem();
  }

  recordMetric(type: MetricType, value: number, unit: string, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = { timestamp: Date.now(), type, value, unit, tags };
    
    const lastRecord = this.metrics[this.metrics.length - 1];
    if (lastRecord && Date.now() - lastRecord.timestamp < 1000) {
      lastRecord.metrics.push(metric);
    } else {
      this.metrics.push({ timestamp: Date.now(), metrics: [metric] });
    }

    if (this.metrics.length > this.maxHistorySize) {
      this.metrics.shift();
    }
  }

  private recordMetrics(metrics: PerformanceMetric[]): void {
    const timestamp = Date.now();
    this.metrics.push({ timestamp, metrics });

    if (this.metrics.length > this.maxHistorySize) {
      this.metrics.shift();
    }
  }

  incrementError(): void {
    this.errorCount++;
    this.recordMetric('error_count', this.errorCount, 'count');
  }

  incrementSuccess(): void {
    this.successCount++;
    const successRate = this.successCount + this.errorCount > 0
      ? (this.successCount / (this.successCount + this.errorCount)) * 100
      : 100;
    this.recordMetric('success_rate', successRate, '%');
  }

  recordResponseTime(durationMs: number, operation?: string): void {
    this.recordMetric('response_time', durationMs, 'ms', { operation });
  }

  recordExecutionTime(label: string, durationMs: number): void {
    this.recordMetric('execution_time', durationMs, 'ms', { label });
  }

  private checkAlerts(): void {
    if (!this.config.enabled) return;

    const recentMetrics = this.getRecentMetrics();
    
    for (const metric of recentMetrics) {
      const threshold = this.config.thresholds.find(t => t.type === metric.type);
      if (!threshold) continue;

      this.evaluateThreshold(metric, threshold);
    }
  }

  private evaluateThreshold(metric: PerformanceMetric, threshold: MetricThreshold): void {
    const value = metric.value;
    let alertType: 'warning' | 'critical' | null = null;
    let thresholdValue = 0;

    if (threshold.critical?.max && value > threshold.critical.max) {
      alertType = 'critical';
      thresholdValue = threshold.critical.max;
    } else if (threshold.critical?.min && value < threshold.critical.min) {
      alertType = 'critical';
      thresholdValue = threshold.critical.min;
    } else if (threshold.warning?.max && value > threshold.warning.max) {
      alertType = 'warning';
      thresholdValue = threshold.warning.max;
    } else if (threshold.warning?.min && value < threshold.warning.min) {
      alertType = 'warning';
      thresholdValue = threshold.warning.min;
    }

    if (alertType) {
      this.triggerAlert(alertType, metric.type, value, thresholdValue);
    } else {
      this.resolveAlert(metric.type);
    }
  }

  private triggerAlert(type: 'warning' | 'critical', metricType: MetricType, currentValue: number, threshold: number): void {
    const existingAlert = this.alerts.find(
      a => a.metricType === metricType && !a.resolved && a.type === type
    );

    if (!existingAlert) {
      const alert: Alert = {
        id: `${metricType}-${Date.now()}`,
        type,
        message: `${metricType} ${type === 'critical' ? 'critical' : 'warning'}: ${currentValue} exceeds threshold ${threshold}`,
        timestamp: Date.now(),
        metricType,
        currentValue,
        threshold,
        resolved: false,
      };

      this.alerts.push(alert);
      this.notifyAlert(alert);
    }
  }

  private resolveAlert(metricType: MetricType): void {
    const unresolvedAlert = this.alerts.find(
      a => a.metricType === metricType && !a.resolved
    );

    if (unresolvedAlert) {
      unresolvedAlert.resolved = true;
      const resolvedAlert: Alert = {
        ...unresolvedAlert,
        id: `${metricType}-resolved-${Date.now()}`,
        type: 'info',
        message: `${metricType} has returned to normal levels`,
        timestamp: Date.now(),
      };
      this.alerts.push(resolvedAlert);
      this.notifyAlert(resolvedAlert);
    }
  }

  private notifyAlert(alert: Alert): void {
    for (const channel of this.config.notificationChannels) {
      switch (channel) {
        case 'console':
          this.logger[alert.type === 'critical' ? 'error' : alert.type === 'warning' ? 'warn' : 'info'](alert.message);
          break;
        case 'file':
          this.logToFile(alert);
          break;
        case 'webhook':
          this.sendWebhook(alert);
          break;
      }
    }
  }

  private logToFile(alert: Alert): void {
    const fs = require('fs');
    const path = require('path');
    const logDir = path.join(require('os').homedir(), '.vectahub', 'logs');
    const logFile = path.join(logDir, `alerts-${new Date().toISOString().split('T')[0]}.log`);

    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logFile, `${new Date().toISOString()} [${alert.type.toUpperCase()}] ${alert.message}\n`);
    } catch {
      this.logger.error('Failed to write alert to file');
    }
  }

  private sendWebhook(alert: Alert): void {
    if (!this.config.webhookUrl) return;

    try {
      require('node-fetch')(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      });
    } catch {
      this.logger.error('Failed to send webhook alert');
    }
  }

  getMetrics(): MetricRecord[] {
    return [...this.metrics];
  }

  getRecentMetrics(): PerformanceMetric[] {
    if (this.metrics.length === 0) return [];
    return [...this.metrics[this.metrics.length - 1].metrics];
  }

  getAlerts(resolved: boolean = false): Alert[] {
    return this.alerts.filter(a => a.resolved === resolved);
  }

  getSummary(): Record<string, { avg: number; max: number; min: number; count: number }> {
    const summary: Record<string, { avg: number; max: number; min: number; count: number }> = {};

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

  setConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.metrics = [];
    this.alerts = [];
    this.errorCount = 0;
    this.successCount = 0;
  }
}

export const performanceMonitor = new PerformanceMonitor();
