import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createExecutor } from './executor.js';
import { contextManager } from './context-manager.js';
import { createNoopAuditHelper } from '../infrastructure/audit/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';
import type { Step } from '../types/index.js';
import type { ExecutionContext } from './handlers/types.js';

const environment = createEnvironmentService();

describe('Executor Complex Conditions', () => {
  const executionId = 'test-exec-if';
  const executor = createExecutor({ audit: createNoopAuditHelper(), environment });

  beforeEach(() => {
    contextManager.clear();
    contextManager.createContext('wf-1', executionId, 'session-1');
  });

  it('should handle complex if condition using expression engine', async () => {
    contextManager.setStepOutput(executionId, 'step1', { status: 'ok', code: 200 }, { exitCode: 0 });
    
    const ifStep: any = {
      id: 'if_step',
      type: 'if',
      condition: 'steps.step1.output.code == 200',
      body: [
        { id: 'sub_step', type: 'exec', cli: 'echo', args: ['Matched'] }
      ]
    };

    const context = contextManager.toExecutorContext(executionId);
    const result = await executor.execute(ifStep, { mode: 'RELAXED' }, context);
    
    expect(result.status).toBe('COMPLETED');
    expect(result.output![0]).toContain('Matched');
  });

  it('should skip if condition does not match', async () => {
    contextManager.setStepOutput(executionId, 'step1', { status: 'error', code: 500 }, { exitCode: 1 });
    
    const ifStep: any = {
      id: 'if_step',
      type: 'if',
      condition: 'steps.step1.output.code == 200',
      body: [
        { id: 'sub_step', type: 'exec', cli: 'echo', args: ['Matched'] }
      ]
    };

    const context = contextManager.toExecutorContext(executionId);
    const result = await executor.execute(ifStep, { mode: 'RELAXED' }, context);
    
    expect(result.status).toBe('COMPLETED');
    expect(result.output).toEqual([]);
  });
});
