import { describe, it, expect } from 'vitest';
import { BehaviorAnalyzer, BehaviorContext } from './behavior-analyzer.js';

describe('BehaviorAnalyzer', () => {
  it('should detect high frequency commands', () => {
    const analyzer = new BehaviorAnalyzer();
    const now = Date.now();
    const context: BehaviorContext = {
      sessionHistory: Array.from({ length: 60 }, (_, i) => ({
        timestamp: new Date(now - i * 10),
        eventType: 'COMMAND',
        severity: 'INFO',
        module: 'test',
        action: 'command',
        success: true
      })),
      currentCommand: 'test',
      timeWindow: 1000
    };
    
    const result = analyzer.analyze(context);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.rule === 'High Frequency Commands')).toBe(true);
  });

  it('should detect consecutive dangerous commands', () => {
    const analyzer = new BehaviorAnalyzer();
    const now = Date.now();
    const context: BehaviorContext = {
      sessionHistory: [
        { timestamp: new Date(now - 100), eventType: 'COMMAND', severity: 'CRITICAL', module: 'test', action: 'command', success: true, riskLevel: 'HIGH' },
        { timestamp: new Date(now - 200), eventType: 'COMMAND', severity: 'CRITICAL', module: 'test', action: 'command', success: true, riskLevel: 'CRITICAL' },
        { timestamp: new Date(now - 300), eventType: 'COMMAND', severity: 'CRITICAL', module: 'test', action: 'command', success: true, riskLevel: 'CRITICAL' },
      ],
      currentCommand: 'test',
      timeWindow: 10000
    };
    
    const result = analyzer.analyze(context);
    expect(result.violated).toBe(true);
    expect(result.violations.some(v => v.rule === 'Consecutive Dangerous Commands')).toBe(true);
  });

  it('should not flag normal behavior', () => {
    const analyzer = new BehaviorAnalyzer();
    const now = Date.now();
    const context: BehaviorContext = {
      sessionHistory: [
        { timestamp: new Date(now - 100), eventType: 'COMMAND', severity: 'INFO', module: 'test', action: 'command', success: true },
        { timestamp: new Date(now - 200), eventType: 'COMMAND', severity: 'INFO', module: 'test', action: 'command', success: true },
      ],
      currentCommand: 'test',
      timeWindow: 10000
    };
    
    const result = analyzer.analyze(context);
    expect(result.violated).toBe(false);
  });
});
