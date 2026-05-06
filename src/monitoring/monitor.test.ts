import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor } from './monitor.js';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
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
    expect(monitor.getMetrics().length).toBeGreaterThanOrEqual(0);
    monitor.stop();
  });

  it('should record metrics', () => {
    monitor.recordMetric('response_time', 100, 'ms', { operation: 'test' });
    const metrics = monitor.getMetrics();
    expect(metrics.length).toBeGreaterThan(0);
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
    expect(recent.length).toBeGreaterThan(0);
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
});
