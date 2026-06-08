import { describe, it, expect } from 'vitest';
import { stepsToWorkflowDraft, workflowToDraft } from './workflow-draft-adapter.js';
import type { Step } from '../types/workflow.js';

describe('workflow-draft-adapter', () => {
  describe('stepsToWorkflowDraft', () => {
    it('should convert simple steps to a valid WorkflowDraft', () => {
      const result = stepsToWorkflowDraft([
        { cli: 'echo', args: ['hello'] },
        { cli: 'git', args: ['status'] },
      ]);

      expect(result.validation.valid).toBe(true);
      expect(result.draft.schemaVersion).toBe('1.0');
      expect(result.draft.draftId).toMatch(/^draft-\d+$/);
      expect(result.draft.planId).toMatch(/^plan-dryrun-\d+$/);
      expect(result.draft.status).toBe('draft');
      expect(result.draft.name).toBe('nl-generated');
      expect(result.draft.mode).toBe('strict');
      expect(result.draft.steps).toHaveLength(2);
    });

    it('should map step data to WorkflowDraftStep fields', () => {
      const result = stepsToWorkflowDraft([
        { cli: 'echo', args: ['hello'] },
      ]);

      expect(result.draft.steps[0].id).toBe('step-1');
      expect(result.draft.steps[0].sourceTaskId).toBe('task-1');
      expect(result.draft.steps[0].type).toBe('exec');
      expect(result.draft.steps[0].label).toBe('echo hello');
      expect(result.draft.steps[0].dependsOn).toEqual([]);
      expect(result.draft.steps[0].command).toEqual({ cli: 'echo', args: ['hello'] });
      expect(result.draft.steps[0].sideEffect).toBe('command');
    });

    it('should create dependency chain between steps', () => {
      const result = stepsToWorkflowDraft([
        { cli: 'npm', args: ['install'] },
        { cli: 'npm', args: ['test'] },
        { cli: 'npm', args: ['build'] },
      ]);

      expect(result.draft.steps[0].dependsOn).toEqual([]);
      expect(result.draft.steps[1].dependsOn).toEqual(['step-1']);
      expect(result.draft.steps[2].dependsOn).toEqual(['step-2']);
    });

    it('should use provided options', () => {
      const result = stepsToWorkflowDraft(
        [{ cli: 'echo', args: ['hello'] }],
        { name: 'my-workflow', mode: 'relaxed', cwd: '/home/user', source: 'chat' },
      );

      expect(result.draft.name).toBe('my-workflow');
      expect(result.draft.mode).toBe('relaxed');
      expect(result.draft.snapshot.sourceCwd).toBe('/home/user');
      expect(result.draft.metadata.createdFrom).toBe('chat');
      expect(result.draft.metadata.cwd).toBe('/home/user');
    });

    it('should generate plan and workflow hashes', () => {
      const result = stepsToWorkflowDraft([
        { cli: 'echo', args: ['hello'] },
      ]);

      expect(result.draft.snapshot.planHash).toBeTruthy();
      expect(result.draft.snapshot.planHash.length).toBeGreaterThan(0);
      expect(result.draft.snapshot.workflowHash).toBeTruthy();
      expect(result.draft.snapshot.workflowHash.length).toBeGreaterThan(0);
      expect(result.draft.snapshot.generatedAt).toBeTruthy();
      expect(result.draft.snapshot.sourceCwd).toBeTruthy();
    });

    it('should produce different hashes for different steps', () => {
      const result1 = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);
      const result2 = stepsToWorkflowDraft([{ cli: 'ls', args: ['-la'] }]);

      expect(result1.draft.snapshot.workflowHash).not.toBe(result2.draft.snapshot.workflowHash);
    });

    it('should set default safetyReview to not_reviewed', () => {
      const result = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);

      expect(result.draft.safetyReview.status).toBe('not_reviewed');
      expect(result.draft.safetyReview.findings).toEqual([]);
    });

    it('should set verification to not required by default', () => {
      const result = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);

      expect(result.draft.verification.required).toBe(false);
      expect(result.draft.verification.commands).toEqual([]);
      expect(result.draft.verification.successCriteria).toEqual([]);
    });

    it('should set metadata correctly', () => {
      const result = stepsToWorkflowDraft([{ cli: 'echo', args: ['hello'] }]);

      expect(result.draft.metadata.createdAt).toBeTruthy();
      expect(result.draft.metadata.createdFrom).toBe('run');
      expect(result.draft.metadata.dryRunAvailable).toBe(true);
      expect(result.draft.metadata.persistRequested).toBe(false);
    });

    it('should handle empty steps list', () => {
      const result = stepsToWorkflowDraft([]);

      expect(result.draft.steps).toHaveLength(0);
      expect(result.draft.snapshot.workflowHash).toBeTruthy();
    });

    it('should produce a draft that passes Zod schema validation', () => {
      const result = stepsToWorkflowDraft([
        { cli: 'echo', args: ['hello'] },
        { cli: 'git', args: ['status'] },
      ]);

      expect(result.validation.valid).toBe(true);
      expect(result.validation.errors).toHaveLength(0);
    });
  });

  describe('workflowToDraft', () => {
    it('should convert a Workflow object to WorkflowDraft', () => {
      const workflow = {
        name: 'git-commit',
        steps: [
          { id: 'step_1', type: 'exec' as const, cli: 'git', args: ['add', '.'] },
          { id: 'step_2', type: 'exec' as const, cli: 'git', args: ['commit', '-m', 'msg'] },
        ],
      };

      const result = workflowToDraft(workflow, { mode: 'relaxed' });

      expect(result.validation.valid).toBe(true);
      expect(result.draft.name).toBe('git-commit');
      expect(result.draft.mode).toBe('relaxed');
      expect(result.draft.steps).toHaveLength(2);
      expect(result.draft.steps[0].command?.cli).toBe('git');
      expect(result.draft.steps[0].command?.args).toEqual(['add', '.']);
      expect(result.draft.steps[1].command?.args).toEqual(['commit', '-m', 'msg']);
    });

    it('should handle steps with missing cli by using type', () => {
      const workflow = {
        name: 'mixed-workflow',
        steps: [
          { id: 'step_1', type: 'exec' as const, cli: 'echo', args: ['hello'] },
          { id: 'step_2', type: 'if' as const, args: [] },
        ],
      };

      const result = workflowToDraft(workflow);

      expect(result.draft.steps[0].command?.cli).toBe('echo');
      expect(result.draft.steps[1].command?.cli).toBe('if');
    });

    it('should handle steps with missing args', () => {
      const workflow = {
        name: 'no-args-workflow',
        steps: [
          { id: 'step_1', type: 'exec' as const, cli: 'echo' },
        ],
      };

      const result = workflowToDraft(workflow);

      expect(result.draft.steps[0].command?.args).toEqual([]);
    });

    it('should pass provided options through', () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'step_1', type: 'exec' as const, cli: 'echo', args: ['hello'] }],
      };

      const result = workflowToDraft(workflow, { mode: 'consensus', cwd: '/custom' });

      expect(result.draft.mode).toBe('consensus');
      expect(result.draft.metadata.cwd).toBe('/custom');
    });
  });
});
