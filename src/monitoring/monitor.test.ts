import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor } from './monitor.js';
import { AlertManager, DEFAULT_ALERT_CONFIG } from './alert-manager.js';
import type { PerformanceMetric, MetricThreshold } from './metrics.js';

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMonitor(overrides?: { getLogDir?: () => string }) {
  const logger = createLogger();
  const monitor = new PerformanceMonitor({
    logger,
    getLogDir: overrides?.getLogDir ?? (() => '.'),
  });
  return { monitor, logger };
}

function createAlertManager(overrides?: { config?: typeof DEFAULT_ALERT_CONFIG }) {
  const logger = createLogger();
  const manager = new AlertManager({
    logger,
    getLogDir: () => '.',
    config: overrides?.config ?? { ...DEFAULT_ALERT_CONFIG },
  });
  return { manager, logger };
}

function makeMetric(type: PerformanceMetric['type'], value: number, unit = '%'): PerformanceMetric {
  return { timestamp: Date.now(), type, value, unit };
}

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    ({ monitor, logger } = createMonitor());
  });

  afterEach(() => {
    monitor.stop();
    monitor.reset();
    vi.clearAllMocks();
  });

  it('should initialize with empty metrics', () => {
    expect(monitor.getMetrics()).toEqual([]);
  });

  it('should initialize with empty alerts', () => {
    expect(monitor.getAlerts()).toEqual([]);
  });

  it('should start and stop monitoring', () => {
    monitor.start(100);
    expect(monitor.getHistorySize()).toBe(0);
    monitor.stop();
  });

  it('should record metrics', () => {
    monitor.recordMetric('response_time', 100, 'ms', { operation: 'test' });
    const metrics = monitor.getMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0].metrics.length).toBe(1);
    expect(metrics[0].metrics[0].type).toBe('response_time');
  });

  it('should increment error and success counters', () => {
    monitor.incrementError();
    monitor.incrementSuccess();

    const summary = monitor.getSummary();
    expect(summary.error_count).toBeDefined();
    expect(summary.success_rate).toBeDefined();
  });

  it('should record response time', () => {
    monitor.recordResponseTime(500, 'test-operation');
    const summary = monitor.getSummary();
    expect(summary.response_time).toBeDefined();
  });

  it('should record execution time', () => {
    monitor.recordExecutionTime('test-label', 200);
    const summary = monitor.getSummary();
    expect(summary.execution_time).toBeDefined();
  });

  it('should get recent metrics', () => {
    monitor.recordMetric('memory_usage', 50, '%');
    const recent = monitor.getRecentMetrics();
    expect(recent.length).toBe(1);
    expect(recent[0].type).toBe('memory_usage');
  });

  it('should get summary statistics', () => {
    monitor.recordMetric('memory_usage', 50, '%');
    monitor.recordMetric('memory_usage', 60, '%');
    monitor.recordMetric('memory_usage', 70, '%');

    const summary = monitor.getSummary();
    expect(summary.memory_usage).toBeDefined();
    expect(summary.memory_usage!.avg).toBe(60);
    expect(summary.memory_usage!.min).toBe(50);
    expect(summary.memory_usage!.max).toBe(70);
    expect(summary.memory_usage!.count).toBe(3);
  });

  it('should reset metrics and alerts', () => {
    monitor.recordMetric('memory_usage', 50, '%');
    expect(monitor.getMetrics().length).toBeGreaterThan(0);

    monitor.reset();
    expect(monitor.getMetrics()).toEqual([]);
    expect(monitor.getAlerts()).toEqual([]);
  });

  it('should set configuration', () => {
    monitor.setConfig({ enabled: false });
    expect(monitor.getAlerts().length).toBe(0);
  });

  it('should handle multiple metric types', () => {
    monitor.recordMetric('cpu_usage', 40, '%');
    monitor.recordMetric('memory_usage', 50, '%');
    monitor.recordMetric('response_time', 100, 'ms');

    const summary = monitor.getSummary();
    expect(summary.cpu_usage).toBeDefined();
    expect(summary.memory_usage).toBeDefined();
    expect(summary.response_time).toBeDefined();
  });

  it('should return empty recent metrics when no data', () => {
    expect(monitor.getRecentMetrics()).toEqual([]);
  });

  it('should return memory usage info', () => {
    const usage = monitor.getMemoryUsage();
    expect(usage.usedMB).toBeGreaterThan(0);
    expect(usage.totalMB).toBeGreaterThan(0);
    expect(usage.percent).toBeGreaterThan(0);
    expect(usage.percent).toBeLessThanOrEqual(100);
  });

  it('should not start twice', () => {
    monitor.start(100);
    monitor.start(100);
    monitor.stop();
    expect(logger.info).toHaveBeenCalledWith('Performance monitor started');
    expect(logger.info).toHaveBeenCalledWith('Performance monitor stopped');
  });

  it('should not stop when not running', () => {
    monitor.stop();
    expect(logger.info).not.toHaveBeenCalledWith('Performance monitor stopped');
  });
});

describe('AlertManager - threshold evaluation', () => {
  let manager: AlertManager;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    ({ manager, logger } = createAlertManager());
  });

  afterEach(() => {
    manager.reset();
    vi.clearAllMocks();
  });

  it('should trigger warning when cache_hit_rate drops below 50%', () => {
    manager.checkAlerts([makeMetric('cache_hit_rate', 30)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('warning');
    expect(active[0].metricType).toBe('cache_hit_rate');
    expect(active[0].currentValue).toBe(30);
    expect(active[0].threshold).toBe(50);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should not trigger alert when cache_hit_rate is above 50%', () => {
    manager.checkAlerts([makeMetric('cache_hit_rate', 75)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(0);
  });

  it('should trigger warning when error_rate exceeds 5%', () => {
    manager.checkAlerts([makeMetric('error_rate', 8)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('warning');
    expect(active[0].metricType).toBe('error_rate');
    expect(active[0].currentValue).toBe(8);
    expect(active[0].threshold).toBe(5);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should not trigger alert when error_rate is at or below 5%', () => {
    manager.checkAlerts([makeMetric('error_rate', 3)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(0);
  });

  it('should trigger critical before warning when both thresholds exceeded', () => {
    manager.checkAlerts([makeMetric('cpu_usage', 96)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('critical');
    expect(active[0].metricType).toBe('cpu_usage');
  });

  it('should trigger warning for response_time exceeding warning max', () => {
    manager.checkAlerts([makeMetric('response_time', 2000, 'ms')]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('warning');
    expect(active[0].metricType).toBe('response_time');
  });

  it('should trigger critical for response_time exceeding critical max', () => {
    manager.checkAlerts([makeMetric('response_time', 6000, 'ms')]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('critical');
    expect(active[0].metricType).toBe('response_time');
  });

  it('should trigger warning for success_rate below warning min', () => {
    manager.checkAlerts([makeMetric('success_rate', 93)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('warning');
    expect(active[0].metricType).toBe('success_rate');
  });

  it('should trigger critical for success_rate below critical min', () => {
    manager.checkAlerts([makeMetric('success_rate', 85)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('critical');
    expect(active[0].metricType).toBe('success_rate');
  });
});

describe('AlertManager - alert lifecycle', () => {
  let manager: AlertManager;

  beforeEach(() => {
    ({ manager } = createAlertManager());
  });

  afterEach(() => {
    manager.reset();
    vi.clearAllMocks();
  });

  it('should deduplicate alerts for the same metric and severity', () => {
    manager.checkAlerts([makeMetric('cpu_usage', 96)]);
    manager.checkAlerts([makeMetric('cpu_usage', 97)]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
  });

  it('should resolve alert when metric returns to normal', () => {
    manager.checkAlerts([makeMetric('cpu_usage', 96)]);
    expect(manager.getAlerts(false).length).toBe(1);

    manager.checkAlerts([makeMetric('cpu_usage', 50)]);
    expect(manager.getAlerts(false).length).toBe(0);

    const resolved = manager.getAlerts(true);
    expect(resolved.length).toBe(2);
    const infoAlert = resolved.find(a => a.type === 'info');
    expect(infoAlert).toBeDefined();
    expect(infoAlert!.metricType).toBe('cpu_usage');
  });

  it('should not create duplicate resolved alerts', () => {
    manager.checkAlerts([makeMetric('cpu_usage', 96)]);
    manager.checkAlerts([makeMetric('cpu_usage', 50)]);
    const afterFirstResolve = manager.getAlerts(true).length;

    manager.checkAlerts([makeMetric('cpu_usage', 50)]);
    expect(manager.getAlerts(true).length).toBe(afterFirstResolve);
  });

  it('should skip evaluation when alerts are disabled', () => {
    manager.updateConfig({ ...DEFAULT_ALERT_CONFIG, enabled: false });
    manager.checkAlerts([makeMetric('cpu_usage', 96)]);

    expect(manager.getAlerts(false).length).toBe(0);
  });

  it('should ignore metrics without matching thresholds', () => {
    manager.checkAlerts([makeMetric('memory_cleanup', 999, 'records')]);

    expect(manager.getAlerts(false).length).toBe(0);
  });

  it('should handle multiple different metric alerts simultaneously', () => {
    manager.checkAlerts([
      makeMetric('cpu_usage', 96),
      makeMetric('memory_usage', 90),
      makeMetric('response_time', 6000, 'ms'),
    ]);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(3);
    const types = active.map(a => a.metricType).sort();
    expect(types).toEqual(['cpu_usage', 'memory_usage', 'response_time']);
  });

  it('should clear all alerts on reset', () => {
    manager.checkAlerts([makeMetric('cpu_usage', 96)]);
    expect(manager.getAlerts(false).length).toBe(1);

    manager.reset();
    expect(manager.getAlerts(false).length).toBe(0);
    expect(manager.getAlerts(true).length).toBe(0);
  });
});

describe('AlertManager - evaluateThreshold', () => {
  let manager: AlertManager;

  beforeEach(() => {
    ({ manager } = createAlertManager());
  });

  afterEach(() => {
    manager.reset();
    vi.clearAllMocks();
  });

  it('should trigger alert for max-type threshold when value exceeds limit', () => {
    const threshold: MetricThreshold = {
      type: 'cpu_usage',
      warning: { max: 80 },
      critical: { max: 95 },
    };

    manager.evaluateThreshold(makeMetric('cpu_usage', 85), threshold);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('warning');
    expect(active[0].currentValue).toBe(85);
  });

  it('should trigger alert for min-type threshold when value drops below limit', () => {
    const threshold: MetricThreshold = {
      type: 'success_rate',
      warning: { min: 95 },
      critical: { min: 90 },
    };

    manager.evaluateThreshold(makeMetric('success_rate', 88), threshold);

    const active = manager.getAlerts(false);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe('critical');
    expect(active[0].currentValue).toBe(88);
  });

  it('should resolve alert when value is within normal range', () => {
    const threshold: MetricThreshold = {
      type: 'cpu_usage',
      warning: { max: 80 },
      critical: { max: 95 },
    };

    manager.evaluateThreshold(makeMetric('cpu_usage', 96), threshold);
    expect(manager.getAlerts(false).length).toBe(1);

    manager.evaluateThreshold(makeMetric('cpu_usage', 50), threshold);
    expect(manager.getAlerts(false).length).toBe(0);
    expect(manager.getAlerts(true).length).toBeGreaterThan(0);
  });
});
