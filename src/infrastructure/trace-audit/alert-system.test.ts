/**
 * 告警系统测试
 * Alert System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { AlertSystem, createAlertSystem } from './alert-system.js';
import type { AlertRule, TraceSpan, AlertEvent } from './types.js';

const TEST_LOGGER = pino({ level: 'silent' });

describe('AlertSystem', () => {
  let alertSystem: AlertSystem;

  beforeEach(() => {
    alertSystem = createAlertSystem(undefined, { logger: TEST_LOGGER });
  });

  afterEach(() => {
    alertSystem = undefined as unknown as AlertSystem;
  });

  describe('createAlertSystem', () => {
    it('should create an instance with default rules', () => {
      expect(alertSystem).toBeInstanceOf(AlertSystem);
      const rules = alertSystem.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should create an instance with custom rules', () => {
      const customRules: AlertRule[] = [
        {
          id: 'custom_rule',
          name: 'Custom Rule',
          level: 'WARNING',
          conditionType: 'timeout',
          conditionValue: 5000,
          notificationChannels: ['console'],
          enabled: true,
        },
      ];

      const system = createAlertSystem(customRules, { logger: TEST_LOGGER });
      const rules = system.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('custom_rule');
    });
  });

  describe('addRule', () => {
    it('should add a new rule', () => {
      const newRule: AlertRule = {
        id: 'new_rule',
        name: 'New Rule',
        level: 'CRITICAL',
        conditionType: 'error_rate',
        conditionValue: 10,
        notificationChannels: ['console'],
        enabled: true,
      };

      alertSystem.addRule(newRule);
      const rules = alertSystem.getRules();
      expect(rules.some((r) => r.id === 'new_rule')).toBe(true);
    });
  });

  describe('removeRule', () => {
    it('should remove an existing rule', () => {
      const result = alertSystem.removeRule('rule_timeout');
      expect(result).toBe(true);

      const rules = alertSystem.getRules();
      expect(rules.some((r) => r.id === 'rule_timeout')).toBe(false);
    });

    it('should return false for nonexistent rule', () => {
      const result = alertSystem.removeRule('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('onAlert', () => {
    it('should register callback and trigger on alert', async () => {
      const triggeredAlerts: AlertEvent[] = [];

      alertSystem.onAlert((alert) => {
        triggeredAlerts.push(alert);
      });

      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      expect(triggeredAlerts.length).toBeGreaterThan(0);
      expect(triggeredAlerts.some((a) => a.level === 'WARNING' || a.level === 'INFO')).toBe(true);
    });
  });

  describe('checkSpan', () => {
    it('should detect timeout', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      const alerts = await alertSystem.checkSpan(span);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((a) => a.ruleId === 'rule_timeout')).toBe(true);
    });

    it('should detect duration threshold', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 15000,
      };

      const alerts = await alertSystem.checkSpan(span);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((a) => a.ruleId === 'rule_duration_threshold')).toBe(true);
    });

    it('should not trigger alert for normal span', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 100,
      };

      const alerts = await alertSystem.checkSpan(span);
      expect(alerts).toHaveLength(0);
    });

    it('should detect error rate', async () => {
      const errorRule: AlertRule = {
        id: 'test_error_rate',
        name: 'Test Error Rate',
        level: 'CRITICAL',
        conditionType: 'error_rate',
        conditionValue: 3,
        notificationChannels: ['console'],
        enabled: true,
      };

      alertSystem.addRule(errorRule);

      const spans: TraceSpan[] = Array.from({ length: 5 }, (_, i) => ({
        spanId: `span_${i}`,
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'FAILED',
        duration: 100,
      }));

      let triggered = false;
      for (const span of spans) {
        const alerts = await alertSystem.checkSpan(span);
        if (alerts.length > 0) {
          triggered = true;
        }
      }

      expect(triggered).toBe(true);
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an existing alert', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      const alerts = alertSystem.getAlerts({ resolved: false });
      expect(alerts.length).toBeGreaterThan(0);

      const resolved = alertSystem.resolveAlert(alerts[0].id);
      expect(resolved).toBe(true);

      const resolvedAlerts = alertSystem.getAlerts({ resolved: true });
      expect(resolvedAlerts.length).toBeGreaterThan(0);
      expect(resolvedAlerts[0].resolved).toBe(true);
      expect(resolvedAlerts[0].resolvedAt).toBeDefined();
    });

    it('should return false for nonexistent alert', () => {
      const result = alertSystem.resolveAlert('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getAlerts', () => {
    it('should return all alerts', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      const alerts = alertSystem.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should filter by level', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      const warningAlerts = alertSystem.getAlerts({ level: 'WARNING' });
      expect(warningAlerts.length).toBeGreaterThan(0);
    });

    it('should filter by resolved status', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      const unresolved = alertSystem.getAlerts({ resolved: false });
      expect(unresolved.length).toBeGreaterThan(0);
    });

    it('should limit results', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      const limited = alertSystem.getAlerts({ limit: 1 });
      expect(limited.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      const stats = alertSystem.getStats();

      expect(stats.totalAlerts).toBeGreaterThan(0);
      expect(stats.unresolvedAlerts).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should cleanup old alerts', async () => {
      const span: TraceSpan = {
        spanId: 'span_001',
        traceId: 'trace_001',
        caller: 'CLI',
        callee: 'Workflow',
        startTime: new Date().toISOString(),
        status: 'COMPLETED',
        duration: 50000,
      };

      await alertSystem.checkSpan(span);
      const initialCount = alertSystem.getAlerts().length;

      const cleaned = alertSystem.cleanup(0);
      expect(cleaned).toBe(initialCount);
      expect(alertSystem.getAlerts()).toHaveLength(0);
    });
  });
});
