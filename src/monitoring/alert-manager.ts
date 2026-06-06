import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PerformanceMetric, MetricType, AlertConfig, Alert, MetricThreshold } from './metrics.js';
import type pino from 'pino';

const CPU_USAGE_WARNING_MAX = 80;
const CPU_USAGE_CRITICAL_MAX = 95;
const MEMORY_USAGE_WARNING_MAX = 85;
const MEMORY_USAGE_CRITICAL_MAX = 95;
const RESPONSE_TIME_WARNING_MAX = 1000;
const RESPONSE_TIME_CRITICAL_MAX = 5000;
const SUCCESS_RATE_WARNING_MIN = 95;
const SUCCESS_RATE_CRITICAL_MIN = 90;
const CACHE_HIT_RATE_WARNING_MIN = 50;
const ERROR_RATE_WARNING_MAX = 5;
const ALERT_FILE_PREFIX = 'alerts-';

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: true,
  thresholds: [
    { type: 'cpu_usage', warning: { max: CPU_USAGE_WARNING_MAX }, critical: { max: CPU_USAGE_CRITICAL_MAX } },
    { type: 'memory_usage', warning: { max: MEMORY_USAGE_WARNING_MAX }, critical: { max: MEMORY_USAGE_CRITICAL_MAX } },
    { type: 'response_time', warning: { max: RESPONSE_TIME_WARNING_MAX }, critical: { max: RESPONSE_TIME_CRITICAL_MAX } },
    { type: 'success_rate', warning: { min: SUCCESS_RATE_WARNING_MIN }, critical: { min: SUCCESS_RATE_CRITICAL_MIN } },
    { type: 'cache_hit_rate', warning: { min: CACHE_HIT_RATE_WARNING_MIN } },
    { type: 'error_rate', warning: { max: ERROR_RATE_WARNING_MAX } },
  ],
  notificationChannels: ['console'],
};

/**
 * Manages metric threshold evaluation, alert lifecycle, and notification dispatch.
 * Extracted from PerformanceMonitor to enforce single-responsibility.
 */
export class AlertManager {
  private readonly logger: Pick<pino.Logger, 'info' | 'warn' | 'error'>;
  private readonly getLogDir: () => string;
  private alerts: Alert[] = [];
  private config: AlertConfig;

  constructor(deps: {
    logger: Pick<pino.Logger, 'info' | 'warn' | 'error'>;
    getLogDir: () => string;
    config: AlertConfig;
  }) {
    this.logger = deps.logger;
    this.getLogDir = deps.getLogDir;
    this.config = deps.config;
  }

  /** Replaces the current alert configuration. */
  updateConfig(config: AlertConfig): void {
    this.config = config;
  }

  /** Returns a shallow copy of the current alert configuration. */
  getConfig(): AlertConfig {
    return { ...this.config };
  }

  /**
   * Evaluates recent metrics against configured thresholds and triggers or resolves alerts.
   * @param recentMetrics - The most recent set of performance metrics to evaluate.
   */
  checkAlerts(recentMetrics: PerformanceMetric[]): void {
    if (!this.config.enabled) return;

    for (const metric of recentMetrics) {
      const threshold = this.config.thresholds.find(t => t.type === metric.type);
      if (!threshold) continue;
      this.evaluateThreshold(metric, threshold);
    }
  }

  evaluateThreshold(metric: PerformanceMetric, threshold: MetricThreshold): void {
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

  triggerAlert(type: 'warning' | 'critical', metricType: MetricType, currentValue: number, threshold: number): void {
    const existingAlert = this.alerts.find(
      a => a.metricType === metricType && !a.resolved && a.type === type
    );

    if (!existingAlert) {
      const alert: Alert = {
        id: `${metricType}-${Date.now()}`,
        type,
        message: `${metricType} ${type}: ${currentValue} exceeds threshold ${threshold}`,
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

  resolveAlert(metricType: MetricType): void {
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
    const logDir = this.getLogDir();
    const logFile = join(logDir, `${ALERT_FILE_PREFIX}${new Date().toISOString().split('T')[0]}.log`);

    try {
      mkdirSync(logDir, { recursive: true });
      appendFileSync(logFile, `${new Date().toISOString()} [${alert.type.toUpperCase()}] ${alert.message}\n`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to write alert to file: ${logFile} - ${errMsg}`);
    }
  }

  private sendWebhook(alert: Alert): void {
    if (!this.config.webhookUrl) return;

    fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    }).catch((error) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send webhook alert to ${this.config.webhookUrl}: ${errMsg}`);
    });
  }

  /** Returns alerts filtered by resolved status. */
  getAlerts(resolved: boolean = false): Alert[] {
    return this.alerts.filter(a => a.resolved === resolved);
  }

  /** Clears all stored alerts. */
  reset(): void {
    this.alerts = [];
  }
}
