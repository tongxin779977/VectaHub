import { describe, it, expect, vi } from 'vitest';
import { MemoryMonitor } from './memory-monitor.js';

describe('MemoryMonitor', () => {
  it('should create a monitor with default settings', () => {
    const monitor = new MemoryMonitor();
    expect(monitor).toBeDefined();
  });

  it('should create a monitor with custom max memory', () => {
    const monitor = new MemoryMonitor(100); // 100MB
    expect(monitor).toBeDefined();
  });

  it('should start and stop the monitor', () => {
    const monitor = new MemoryMonitor();
    monitor.start();
    expect(() => monitor.stop()).not.toThrow();
  });

  it('should track memory usage', () => {
    const monitor = new MemoryMonitor(100);
    const usage = monitor.getCurrentUsage();
    
    expect(usage).toHaveProperty('rss');
    expect(usage).toHaveProperty('heapTotal');
    expect(usage).toHaveProperty('heapUsed');
    expect(usage).toHaveProperty('external');
  });

  it('should allow registering overflow handlers', () => {
    const monitor = new MemoryMonitor(1);
    const handler = vi.fn();
    
    monitor.registerOverflowHandler(handler);
    expect(() => monitor.registerOverflowHandler(handler)).not.toThrow();
  });

  it('should clear overflow handlers', () => {
    const monitor = new MemoryMonitor(1);
    const handler = vi.fn();
    
    monitor.registerOverflowHandler(handler);
    monitor.clearOverflowHandlers();
    expect(() => monitor.stop()).not.toThrow();
  });

  it('should get usage percentage', () => {
    const monitor = new MemoryMonitor(1000); // 1000MB
    const percentage = monitor.getUsagePercentage();
    
    expect(typeof percentage).toBe('number');
    expect(percentage).toBeGreaterThanOrEqual(0);
  });
});
