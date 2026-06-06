/**
 * 异常检测和告警系统 - 检测异常链路并触发告警
 * Anomaly Detection and Alert System - Detects abnormal traces and triggers alerts
 */

import type { Logger } from '../logger/index.js';
import type {
  TraceSpan,
  AlertRule,
  AlertEvent,
  AlertLevel,
  NotificationChannel,
  TraceId,
  SpanId,
} from './types.js';
import { VectaHubError, ErrorType } from '../errors/index.js';

export interface AlertSystemDeps {
  logger: Logger;
  output?: AlertSystemOutput;
}

export interface AlertSystemOutput {
  log(message: string): void;
}

/** 默认告警规则 */
const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule_timeout',
    name: '执行超时检测',
    level: 'WARNING',
    conditionType: 'timeout',
    conditionValue: 30000, // 30 秒
    notificationChannels: ['console'],
    enabled: true,
  },
  {
    id: 'rule_error_rate',
    name: '错误率过高',
    level: 'CRITICAL',
    conditionType: 'error_rate',
    conditionValue: 50, // 50%
    notificationChannels: ['console'],
    enabled: true,
  },
  {
    id: 'rule_duration_threshold',
    name: '执行时长阈值',
    level: 'INFO',
    conditionType: 'duration_threshold',
    conditionValue: 10000, // 10 秒
    notificationChannels: ['console'],
    enabled: true,
  },
];

/** 告警回调函数类型 */
type AlertCallback = (alert: AlertEvent) => void;

function createDefaultAlertOutput(): AlertSystemOutput {
  return {
    log: (message: string) => {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * 异常检测和告警系统类
 * Anomaly Detection and Alert System Class
 */
export class AlertSystem {
  private rules: Map<string, AlertRule> = new Map();
  private alerts: AlertEvent[] = [];
  private callbacks: AlertCallback[] = [];
  private errorWindow: Map<string, number[]> = new Map();
  private windowSizeMs: number = 300000; // 5 分钟窗口
  private logger: Logger;
  private output: AlertSystemOutput;

  constructor(rules: AlertRule[] | undefined, deps: AlertSystemDeps) {
    if (!deps.logger) {
      throw new VectaHubError('AlertSystem requires a logger dependency', ErrorType.CONFIGURATION);
    }

    const defaultRules = rules ?? DEFAULT_ALERT_RULES;
    this.logger = deps.logger;
    this.output = deps.output ?? createDefaultAlertOutput();
    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /** 注册告警回调 */
  onAlert(callback: AlertCallback): void {
    this.callbacks.push(callback);
  }

  /** 添加告警规则 */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info(`添加告警规则: ${rule.name}`);
  }

  /** 删除告警规则 */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /** 获取所有规则 */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /** 检查跨度是否触发告警 */
  async checkSpan(span: TraceSpan): Promise<AlertEvent[]> {
    const triggeredAlerts: AlertEvent[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const alert = this.evaluateRule(rule, span);
      if (alert) {
        triggeredAlerts.push(alert);
        this.alerts.push(alert);
        this.notifyAlert(alert);
      }
    }

    return triggeredAlerts;
  }

  /** 评估规则 */
  private evaluateRule(rule: AlertRule, span: TraceSpan): AlertEvent | null {
    switch (rule.conditionType) {
      case 'timeout':
        return this.checkTimeout(rule, span);
      case 'error_rate':
        return this.checkErrorRate(rule, span);
      case 'duration_threshold':
        return this.checkDurationThreshold(rule, span);
      case 'status':
        return this.checkStatus(rule, span);
      default:
        return null;
    }
  }

  /** 检查超时 */
  private checkTimeout(rule: AlertRule, span: TraceSpan): AlertEvent | null {
    const timeoutMs = typeof rule.conditionValue === 'number' ? rule.conditionValue : 0;

    if (span.duration && span.duration > timeoutMs) {
      return this.createAlert(
        rule,
        `模块 ${span.callee} 执行超时: ${span.duration}ms > ${timeoutMs}ms`,
        span.traceId,
        span.spanId,
        span.duration,
        timeoutMs
      );
    }

    return null;
  }

  /** 检查错误率 */
  private checkErrorRate(rule: AlertRule, span: TraceSpan): AlertEvent | null {
    if (span.status !== 'FAILED') {
      return null;
    }

    const moduleName = span.callee;
    const now = Date.now();

    if (!this.errorWindow.has(moduleName)) {
      this.errorWindow.set(moduleName, []);
    }

    const window = this.errorWindow.get(moduleName)!;
    window.push(now);

    // 清理过期数据
    const cutoff = now - this.windowSizeMs;
    const validErrors = window.filter((t) => t > cutoff);
    this.errorWindow.set(moduleName, validErrors);

    // 计算错误率（简化版：基于窗口内错误数量）
    const errorCount = validErrors.length;
    const threshold = typeof rule.conditionValue === 'number' ? rule.conditionValue : 0;

    if (errorCount > threshold) {
      return this.createAlert(
        rule,
        `模块 ${moduleName} 错误率过高: ${errorCount} 次错误 / ${this.windowSizeMs / 1000}秒`,
        span.traceId,
        span.spanId,
        errorCount,
        threshold
      );
    }

    return null;
  }

  /** 检查执行时长阈值 */
  private checkDurationThreshold(rule: AlertRule, span: TraceSpan): AlertEvent | null {
    const thresholdMs = typeof rule.conditionValue === 'number' ? rule.conditionValue : 0;

    if (span.duration && span.duration > thresholdMs) {
      return this.createAlert(
        rule,
        `模块 ${span.callee} 执行时长超过阈值: ${span.duration}ms > ${thresholdMs}ms`,
        span.traceId,
        span.spanId,
        span.duration,
        thresholdMs
      );
    }

    return null;
  }

  /** 检查状态 */
  private checkStatus(rule: AlertRule, span: TraceSpan): AlertEvent | null {
    const expectedStatus = rule.conditionValue as string;

    if (span.status === expectedStatus) {
      return this.createAlert(
        rule,
        `模块 ${span.callee} 状态异常: ${span.status}`,
        span.traceId,
        span.spanId,
        span.status,
        expectedStatus
      );
    }

    return null;
  }

  /** 创建告警事件 */
  private createAlert(
    rule: AlertRule,
    message: string,
    traceId: TraceId,
    spanId: SpanId,
    currentValue: number | string,
    threshold: number | string
  ): AlertEvent {
    const alert: AlertEvent = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      ruleId: rule.id,
      level: rule.level,
      message,
      timestamp: new Date().toISOString(),
      traceId,
      spanId,
      currentValue,
      threshold,
      resolved: false,
    };

    return alert;
  }

  /** 通知告警 */
  private notifyAlert(alert: AlertEvent): void {
    // 调用注册的回调
    for (const callback of this.callbacks) {
      try {
        callback(alert);
      } catch (error) {
        this.logger.error(`告警回调执行失败: ${(error as Error).message}`);
      }
    }

    // 根据通知渠道发送
    const rule = this.rules.get(alert.ruleId);
    if (rule) {
      for (const channel of rule.notificationChannels) {
        this.sendNotification(channel, alert);
      }
    }

    this.logger.warn(`[告警] ${alert.level}: ${alert.message}`);
  }

  /** 发送通知 */
  private sendNotification(channel: NotificationChannel, alert: AlertEvent): void {
    switch (channel) {
      case 'console':
        this.sendConsoleNotification(alert);
        break;
      case 'file':
        this.sendFileNotification(alert);
        break;
      case 'webhook':
        this.sendWebhookNotification(alert);
        break;
      case 'email':
        this.sendEmailNotification(alert);
        break;
    }
  }

  /** 控制台通知 */
  private sendConsoleNotification(alert: AlertEvent): void {
    const levelColors: Record<AlertLevel, string> = {
      DEBUG: '\x1b[90m',    // 灰色
      INFO: '\x1b[36m',     // 青色
      WARNING: '\x1b[33m',   // 黄色
      ERROR: '\x1b[35m',    // 紫色
      CRITICAL: '\x1b[31m', // 红色
    };
    const reset = '\x1b[0m';
    const color = levelColors[alert.level] || '';
    this.output.log(`${color}[${alert.level}] ${alert.message}${reset}`);
  }

  /** 文件通知 */
  private sendFileNotification(alert: AlertEvent): void {
    // 实际实现中会写入告警日志文件
    this.logger.info(`告警已记录到文件: ${alert.message}`);
  }

  /** Webhook 通知 */
  private sendWebhookNotification(alert: AlertEvent): void {
    const rule = this.rules.get(alert.ruleId);
    if (rule?.webhookUrl) {
      // 实际实现中会发送 HTTP 请求
      this.logger.info(`Webhook 通知已发送: ${rule.webhookUrl}`);
    }
  }

  /** 邮件通知 */
  private sendEmailNotification(alert: AlertEvent): void {
    // 实际实现中会发送邮件
    this.logger.info(`邮件通知已发送: ${alert.message}`);
  }

  /** 解决告警 */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /** 获取告警列表 */
  getAlerts(options?: {
    level?: AlertLevel;
    resolved?: boolean;
    limit?: number;
  }): AlertEvent[] {
    let alerts = [...this.alerts];

    if (options?.level) {
      alerts = alerts.filter((a) => a.level === options.level);
    }

    if (options?.resolved !== undefined) {
      alerts = alerts.filter((a) => a.resolved === options.resolved);
    }

    if (options?.limit) {
      alerts = alerts.slice(0, options.limit);
    }

    return alerts.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /** 获取统计信息 */
  getStats(): {
    totalAlerts: number;
    unresolvedAlerts: number;
    criticalAlerts: number;
    warningAlerts: number;
    infoAlerts: number;
  } {
    return {
      totalAlerts: this.alerts.length,
      unresolvedAlerts: this.alerts.filter((a) => !a.resolved).length,
      criticalAlerts: this.alerts.filter((a) => a.level === 'CRITICAL').length,
      warningAlerts: this.alerts.filter((a) => a.level === 'WARNING').length,
      infoAlerts: this.alerts.filter((a) => a.level === 'INFO').length,
    };
  }

  /** 清理过期数据 */
  cleanup(maxAgeMs: number = 86400000): number {
    const now = Date.now();
    const initialCount = this.alerts.length;

    this.alerts = this.alerts.filter((alert) => {
      const age = now - new Date(alert.timestamp).getTime();
      return age < maxAgeMs;
    });

    return initialCount - this.alerts.length;
  }
}

/**
 * 创建告警系统工厂函数
 * Create Alert System Factory Function
 */
export function createAlertSystem(rules: AlertRule[] | undefined, deps: AlertSystemDeps): AlertSystem {
  return new AlertSystem(rules, deps);
}
