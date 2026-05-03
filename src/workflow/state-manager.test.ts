import { describe, it, expect, beforeEach } from 'vitest';
import { createExecutionStateManager } from './state-manager.js';
import type { ExecutionRecord } from '../types/index.js';

function createMockExecution(overrides?: Partial<ExecutionRecord>): ExecutionRecord {
  return {
    executionId: 'exec_1',
    workflowId: 'wf_1',
    workflowName: 'test',
    status: 'RUNNING',
    mode: 'relaxed',
    startedAt: new Date(),
    steps: [],
    warnings: [],
    logs: [],
    ...overrides,
  };
}

describe('ExecutionStateManager', () => {
  let sm: ReturnType<typeof createExecutionStateManager>;

  beforeEach(() => {
    sm = createExecutionStateManager();
  });

  describe('initial state', () => {
    it('should start with IDLE state', () => {
      expect(sm.state).toBe('IDLE');
    });

    it('should have no current execution', () => {
      expect(sm.currentExecution).toBeUndefined();
    });

    it('should have no pause resolver', () => {
      expect(sm.pauseResolver).toBeNull();
    });

    it('should have no completion promise', () => {
      expect(sm.completionPromise).toBeNull();
    });

    it('should have no completion resolver', () => {
      expect(sm.completionResolver).toBeNull();
    });

    it('should start step index at 0', () => {
      expect(sm.currentStepIndex).toBe(0);
    });
  });

  describe('setState', () => {
    it('should set state to RUNNING and update execution status', () => {
      sm.currentExecution = createMockExecution();
      sm.setState('RUNNING');
      expect(sm.state).toBe('RUNNING');
      expect(sm.currentExecution.status).toBe('RUNNING');
    });

    it('should set state to PAUSED and update execution status', () => {
      sm.currentExecution = createMockExecution();
      sm.setState('PAUSED');
      expect(sm.state).toBe('PAUSED');
      expect(sm.currentExecution.status).toBe('PAUSED');
    });

    it('should set state to COMPLETED and update execution status', () => {
      sm.currentExecution = createMockExecution();
      sm.setState('COMPLETED');
      expect(sm.state).toBe('COMPLETED');
      expect(sm.currentExecution.status).toBe('COMPLETED');
    });

    it('should set state to FAILED and update execution status', () => {
      sm.currentExecution = createMockExecution();
      sm.setState('FAILED');
      expect(sm.state).toBe('FAILED');
      expect(sm.currentExecution.status).toBe('FAILED');
    });

    it('should map ABORTING to ABORTED status', () => {
      sm.currentExecution = createMockExecution();
      sm.setState('ABORTING');
      expect(sm.state).toBe('ABORTING');
      expect(sm.currentExecution.status).toBe('ABORTED');
    });

    it('should map ABORTED to ABORTED status', () => {
      sm.currentExecution = createMockExecution();
      sm.setState('ABORTED');
      expect(sm.state).toBe('ABORTED');
      expect(sm.currentExecution.status).toBe('ABORTED');
    });

    it('should not throw when no current execution', () => {
      expect(() => sm.setState('RUNNING')).not.toThrow();
      expect(sm.state).toBe('RUNNING');
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      sm.currentExecution = createMockExecution();
      sm.setState('RUNNING');
      sm.currentStepIndex = 5;
      sm.pauseResolver = () => {};
      sm.completionResolver = () => {};

      sm.reset();

      expect(sm.state).toBe('IDLE');
      expect(sm.currentExecution).toBeUndefined();
      expect(sm.currentStepIndex).toBe(0);
      expect(sm.pauseResolver).toBeNull();
      expect(sm.completionResolver).toBeNull();
      expect(sm.completionPromise).toBeNull();
    });
  });

  describe('property access', () => {
    it('should allow setting and getting currentExecution', () => {
      const exec = createMockExecution();
      sm.currentExecution = exec;
      expect(sm.currentExecution).toBe(exec);
    });

    it('should allow setting and getting currentStepIndex', () => {
      sm.currentStepIndex = 42;
      expect(sm.currentStepIndex).toBe(42);
    });

    it('should allow setting pauseResolver', () => {
      const resolver = () => {};
      sm.pauseResolver = resolver;
      expect(sm.pauseResolver).toBe(resolver);
    });

    it('should allow setting completionPromise', () => {
      const promise = Promise.resolve(createMockExecution());
      sm.completionPromise = promise;
      expect(sm.completionPromise).toBe(promise);
    });

    it('should allow setting completionResolver', () => {
      const resolver = (_record: ExecutionRecord) => {};
      sm.completionResolver = resolver;
      expect(sm.completionResolver).toBe(resolver);
    });
  });
});
