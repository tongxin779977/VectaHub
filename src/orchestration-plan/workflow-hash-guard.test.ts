import { describe, it, expect } from 'vitest';
import type { Workflow, ExecutionRecord } from '../types/workflow.js';
import { validateWorkflowHash, computeWorkflowHash } from './workflow-hash-guard.js';

const sampleWorkflow: Workflow = {
  id: 'test-wf',
  name: 'Test Workflow',
  mode: 'strict',
  steps: [
    { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] },
  ],
  createdAt: new Date(),
};

describe('workflow-hash-guard', () => {
  describe('computeWorkflowHash', () => {
    it('should return consistent hash for same workflow', () => {
      const hash1 = computeWorkflowHash(sampleWorkflow);
      const hash2 = computeWorkflowHash(sampleWorkflow);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different workflow', () => {
      const modifiedWorkflow: Workflow = {
        ...sampleWorkflow,
        steps: [...sampleWorkflow.steps, { id: 'step2', type: 'exec', cli: 'echo', args: ['world'] }],
      };
      const hash1 = computeWorkflowHash(sampleWorkflow);
      const hash2 = computeWorkflowHash(modifiedWorkflow);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateWorkflowHash', () => {
    it('should return valid when hashes match', () => {
      const executionRecord: ExecutionRecord = {
        executionId: 'test-exec',
        workflowId: sampleWorkflow.id,
        workflowName: sampleWorkflow.name,
        status: 'COMPLETED',
        mode: sampleWorkflow.mode,
        startedAt: new Date(),
        steps: [],
        warnings: [],
        logs: [],
        workflowHash: computeWorkflowHash(sampleWorkflow),
      };
      const result = validateWorkflowHash(sampleWorkflow, executionRecord);
      expect(result.valid).toBe(true);
    });

    it('should return invalid when hashes differ', () => {
      const modifiedWorkflow: Workflow = {
        ...sampleWorkflow,
        steps: [...sampleWorkflow.steps, { id: 'step2', type: 'exec', cli: 'echo', args: ['world'] }],
      };
      const executionRecord: ExecutionRecord = {
        executionId: 'test-exec',
        workflowId: sampleWorkflow.id,
        workflowName: sampleWorkflow.name,
        status: 'COMPLETED',
        mode: sampleWorkflow.mode,
        startedAt: new Date(),
        steps: [],
        warnings: [],
        logs: [],
        workflowHash: computeWorkflowHash(sampleWorkflow),
      };
      const result = validateWorkflowHash(modifiedWorkflow, executionRecord);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Workflow definition has changed');
    });

    it('should return invalid when no hash is stored', () => {
      const executionRecord: ExecutionRecord = {
        executionId: 'test-exec',
        workflowId: sampleWorkflow.id,
        workflowName: sampleWorkflow.name,
        status: 'COMPLETED',
        mode: sampleWorkflow.mode,
        startedAt: new Date(),
        steps: [],
        warnings: [],
        logs: [],
      };
      const result = validateWorkflowHash(sampleWorkflow, executionRecord);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No workflow hash stored in execution record');
    });
  });
});
