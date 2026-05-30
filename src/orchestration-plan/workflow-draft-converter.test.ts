import { describe, it, expect } from 'vitest';
import { convertPlanToDraft, convertAndValidatePlanToDraft } from './workflow-draft-converter.js';
import { createEmptyPlan } from './planner.js';
import { applySafetyReviewToPlan } from './safety-reviewer.js';

describe('workflow-draft-converter', function() {
  describe('convertPlanToDraft', function() {
    it('should convert a basic plan to draft', function() {
      const plan = createEmptyPlan();
      plan.goal = 'Test plan';
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'First task',
          executor: 'local',
          command: {
            cli: 'echo',
            args: ['hello'],
          },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const draft = convertPlanToDraft(plan);

      expect(draft.schemaVersion).toBe('1.0');
      expect(draft.planId).toBe(plan.planId);
      expect(draft.name).toBe('Test plan');
      expect(draft.steps.length).toBe(1);
      expect(draft.steps[0].id).toBe('task-1');
      expect(draft.steps[0].type).toBe('exec');
      expect(draft.steps[0].command).toEqual({
        cli: 'echo',
        args: ['hello'],
      });
    });

    it('should skip reply tasks', function() {
      const plan = createEmptyPlan();
      plan.goal = 'Test plan';
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'reply',
          title: 'Reply task',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
        {
          id: 'task-2',
          kind: 'apply',
          title: 'Actual task',
          executor: 'local',
          command: {
            cli: 'echo',
            args: ['world'],
          },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const draft = convertPlanToDraft(plan);

      expect(draft.steps.length).toBe(1);
      expect(draft.steps[0].id).toBe('task-2');
    });

    it('should convert delegate tasks correctly', function() {
      const plan = createEmptyPlan();
      plan.goal = 'Delegate test';
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'transform',
          title: 'Delegate to codex',
          executor: 'agent',
          delegateTo: 'codex',
          description: 'Fix some code',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'write',
          confidence: 'medium',
          needsConfirmation: true,
        },
      ];

      const draft = convertPlanToDraft(plan);

      expect(draft.steps.length).toBe(1);
      expect(draft.steps[0].type).toBe('delegate');
      expect(draft.steps[0].delegate?.to).toBe('codex');
    });

    it('should generate plan and workflow hashes', function() {
      const plan = createEmptyPlan();
      plan.goal = 'Hash test';
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'First task',
          executor: 'local',
          command: {
            cli: 'echo',
            args: ['hello'],
          },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const draft = convertPlanToDraft(plan);

      expect(draft.snapshot.planHash).toBeTruthy();
      expect(draft.snapshot.planHash.length).toBeGreaterThan(0);
      expect(draft.snapshot.workflowHash).toBeTruthy();
      expect(draft.snapshot.workflowHash.length).toBeGreaterThan(0);
      expect(draft.snapshot.generatedAt).toBeTruthy();
      expect(draft.snapshot.sourceCwd).toBeTruthy();
    });

    it('should convert safety review correctly', function() {
      const plan = createEmptyPlan();
      plan.goal = 'Safety test';
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Risky task',
          executor: 'local',
          command: {
            cli: 'rm',
            args: ['-rf', '/'],
          },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'command',
          confidence: 'high',
          needsConfirmation: true,
        },
      ];

      const reviewedPlan = applySafetyReviewToPlan(plan);
      const draft = convertPlanToDraft(reviewedPlan);

      expect(draft.safetyReview.status).toBeTruthy();
      expect(draft.safetyReview.findings).toBeTruthy();
    });
  });

  describe('convertAndValidatePlanToDraft', function() {
    it('should convert and validate a valid plan successfully', function() {
      const plan = createEmptyPlan();
      plan.goal = 'Valid plan';
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Valid task',
          executor: 'local',
          command: {
            cli: 'echo',
            args: ['hello'],
          },
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const result = convertAndValidatePlanToDraft(plan);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.draft.steps.length).toBe(1);
      }
    });

    it('should detect invalid drafts with validation errors', function() {
      const plan = createEmptyPlan();
      plan.goal = 'Invalid plan';
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Task 1',
          executor: 'local',
          command: {
            cli: 'echo',
            args: ['hello'],
          },
          dependsOn: ['task-2'],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
        {
          id: 'task-2',
          kind: 'apply',
          title: 'Task 2',
          executor: 'local',
          command: {
            cli: 'echo',
            args: ['world'],
          },
          dependsOn: ['task-1'],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const result = convertAndValidatePlanToDraft(plan);

      expect(result.valid).toBe(false);
    });
  });
});
