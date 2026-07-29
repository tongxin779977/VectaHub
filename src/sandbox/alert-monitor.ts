import { randomUUID } from 'node:crypto';
import type {
  AlertRule,
  AlertEvent,
  MetricSnapshot,
  MonitorAlertManager,
} from './types.js';

const OPERATORS: Record<string, (a: number, b: number) => boolean> = {
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

/**
 * 创建监控告警管理器实例
 *
 * 支持注册基于指标阈值的告警规则，在每次指标快照时评估规则，
 * 触发告警事件并执行自定义动作。支持冷却期防止告警风暴。
 *
 * @returns 监控告警管理器实例
 */
export function createMonitorAlertManager(): MonitorAlertManager {
  const rules = new Map<string, AlertRule>();
  const activeAlerts = new Map<string, AlertEvent>();
  const lastTriggeredAt = new Map<string, number>();
  const metricHistory = new Map<string, Array<{ value: number; timestamp: number }>>();

  function generateId(): string {
    return `alert_${randomUUID().slice(0, 8)}`;
  }

  function getMetricValue(snapshot: MetricSnapshot, metric: string): number | null {
    switch (metric) {
      case 'memoryUsageMB':
        return snapshot.memoryUsageMB;
      case 'memoryPercentage':
        return snapshot.memoryPercentage;
      case 'activeResources':
        return snapshot.activeResources;
      case 'activeSandboxes':
        return snapshot.activeSandboxes;
      default:
        return null;
    }
  }

  function isInCooldown(rule: AlertRule): boolean {
    const lastTime = lastTriggeredAt.get(rule.id);
    if (!lastTime) return false;
    return Date.now() - lastTime < rule.cooldownMs;
  }

  function updateMetricHistory(metric: string, value: number): void {
    const history = metricHistory.get(metric) ?? [];
    history.push({ value, timestamp: Date.now() });
    if (history.length > 100) {
      history.shift();
    }
    metricHistory.set(metric, history);
  }

  function checkDurationCondition(rule: AlertRule, _currentValue: number): boolean {
    if (!rule.condition.durationMs) return true;

    const history = metricHistory.get(rule.condition.metric) ?? [];
    const cutoff = Date.now() - rule.condition.durationMs;
    const recentEntries = history.filter((h) => h.timestamp >= cutoff);
    if (recentEntries.length === 0) return false;

    const op = OPERATORS[rule.condition.operator];
    return recentEntries.every((h) => op(h.value, rule.condition.threshold));
  }

  return {
    /**
     * 添加告警规则
     *
     * @param rule - 告警规则定义
     */
    addRule(rule: AlertRule): void {
      rules.set(rule.id, rule);
    },

    /**
     * 移除告警规则
     *
     * @param id - 规则标识符
     * @returns 是否成功移除
     */
    removeRule(id: string): boolean {
      return rules.delete(id);
    },

    /**
     * 启用告警规则
     *
     * @param id - 规则标识符
     * @returns 是否成功启用
     */
    enableRule(id: string): boolean {
      const rule = rules.get(id);
      if (!rule) return false;
      rule.enabled = true;
      return true;
    },

    /**
     * 禁用告警规则
     *
     * @param id - 规则标识符
     * @returns 是否成功禁用
     */
    disableRule(id: string): boolean {
      const rule = rules.get(id);
      if (!rule) return false;
      rule.enabled = false;
      return true;
    },

    /**
     * 根据指标快照评估所有已启用的告警规则
     *
     * 跳过冷却期内的规则，满足持续时间条件后触发告警事件。
     *
     * @param metrics - 当前指标快照
     * @returns 本次评估触发的告警事件列表
     */
    evaluate(metrics: MetricSnapshot): AlertEvent[] {
      const triggered: AlertEvent[] = [];

      for (const rule of rules.values()) {
        if (!rule.enabled) continue;
        if (isInCooldown(rule)) continue;

        const currentValue = getMetricValue(metrics, rule.condition.metric);
        if (currentValue === null) continue;

        updateMetricHistory(rule.condition.metric, currentValue);

        const op = OPERATORS[rule.condition.operator];
        if (!op || !op(currentValue, rule.condition.threshold)) continue;
        if (!checkDurationCondition(rule, currentValue)) continue;

        const alert: AlertEvent = {
          id: generateId(),
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `${rule.name}: ${rule.description} (${rule.condition.metric}=${currentValue}, threshold=${rule.condition.threshold})`,
          metric: rule.condition.metric,
          currentValue,
          threshold: rule.condition.threshold,
          triggeredAt: Date.now(),
        };

        activeAlerts.set(alert.id, alert);
        lastTriggeredAt.set(rule.id, Date.now());
        triggered.push(alert);

        if (rule.action) {
          try {
            const result = rule.action(alert);
            if (result instanceof Promise) {
              result.catch(e => console.warn({ alertId: alert.id, error: e instanceof Error ? e.message : String(e) }, 'Alert action failed'));
            }
          } catch {
            // 告警动作失败不阻断评估
          }
        }
      }

      return triggered;
    },

    /**
     * 获取当前所有活跃（未解决）的告警
     *
     * @returns 活跃告警事件列表
     */
    getActiveAlerts(): AlertEvent[] {
      return Array.from(activeAlerts.values()).filter((a) => !a.resolvedAt);
    },

    /**
     * 解决指定告警
     *
     * @param alertId - 告警事件标识符
     * @returns 是否成功解决
     */
    resolveAlert(alertId: string): boolean {
      const alert = activeAlerts.get(alertId);
      if (!alert || alert.resolvedAt) return false;
      alert.resolvedAt = Date.now();
      return true;
    },

    /**
     * 获取当前所有告警规则
     *
     * @returns 告警规则列表
     */
    getRules(): AlertRule[] {
      return Array.from(rules.values());
    },

    /**
     * 清除所有告警事件（含活跃和已解决的）
     */
    clearAlerts(): void {
      activeAlerts.clear();
      lastTriggeredAt.clear();
    },
  };
}
