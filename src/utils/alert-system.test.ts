import { describe, it, expect, vi } from 'vitest';
import { createAlertSystem } from './alert-system.js';

describe('AlertSystem', () => {
  it('should trigger alerts for critical events', () => {
    const alertSystem = createAlertSystem();
    const handler = vi.fn();
    
    alertSystem.addListener('CRITICAL', handler);
    alertSystem.emit('CRITICAL', 'Test critical alert', { details: 'test' });
    
    expect(handler).toHaveBeenCalled();
  });

  it('should not trigger wrong level listeners', () => {
    const alertSystem = createAlertSystem();
    const criticalHandler = vi.fn();
    const warningHandler = vi.fn();
    
    alertSystem.addListener('CRITICAL', criticalHandler);
    alertSystem.addListener('WARNING', warningHandler);
    
    alertSystem.emit('WARNING', 'Test warning alert');
    
    expect(criticalHandler).not.toHaveBeenCalled();
    expect(warningHandler).toHaveBeenCalled();
  });

  it('should allow removing listeners', () => {
    const alertSystem = createAlertSystem();
    const handler = vi.fn();
    
    alertSystem.addListener('INFO', handler);
    alertSystem.emit('INFO', 'Test info alert');
    
    alertSystem.removeListener('INFO', handler);
    alertSystem.emit('INFO', 'Another test info alert');
    
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
