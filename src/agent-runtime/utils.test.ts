import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSingleton, createSilentLogger, formatErrorMessage } from './utils';

describe('utils', () => {
  describe('createSingleton', () => {
    it('should create and reuse the same instance', () => {
      let instanceCount = 0;
      const createFn = () => {
        instanceCount++;
        return { id: instanceCount };
      };
      
      const { getInstance, reset } = createSingleton(createFn);
      
      const inst1 = getInstance();
      const inst2 = getInstance();
      
      expect(inst1).toBe(inst2);
      expect(instanceCount).toBe(1);
    });
    
    it('should reset the instance', () => {
      let instanceCount = 0;
      const createFn = () => {
        instanceCount++;
        return { id: instanceCount };
      };
      
      const { getInstance, reset } = createSingleton(createFn);
      
      const inst1 = getInstance();
      reset();
      const inst2 = getInstance();
      
      expect(inst1).not.toBe(inst2);
      expect(instanceCount).toBe(2);
    });
    
    it('should pass deps to create function', () => {
      const createFn = vi.fn((deps?: { value: number }) => ({ value: deps?.value || 0 }));
      const { getInstance } = createSingleton(createFn);
      
      getInstance({ value: 42 });
      
      expect(createFn).toHaveBeenCalledWith({ value: 42 });
    });
    
    it('should call resetInstance when reset is called', () => {
      const resetFn = vi.fn();
      const { reset } = createSingleton(() => ({}), resetFn);
      
      reset();
      
      expect(resetFn).toHaveBeenCalled();
    });
  });
  
  describe('createSilentLogger', () => {
    it('should create a logger with warn, error, info methods', () => {
      const logger = createSilentLogger();
      
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.info).toBe('function');
    });
    
    it('should not throw when methods are called', () => {
      const logger = createSilentLogger();
      
      expect(() => logger.warn('test')).not.toThrow();
      expect(() => logger.error('test')).not.toThrow();
      expect(() => logger.info('test')).not.toThrow();
    });
  });
  
  describe('formatErrorMessage', () => {
    it('should return error message from Error object', () => {
      const error = new Error('Test error');
      expect(formatErrorMessage(error)).toBe('Test error');
    });
    
    it('should stringify non-Error objects', () => {
      expect(formatErrorMessage('String error')).toBe('String error');
      expect(formatErrorMessage(42)).toBe('42');
      expect(formatErrorMessage(null)).toBe('null');
    });
  });
});
