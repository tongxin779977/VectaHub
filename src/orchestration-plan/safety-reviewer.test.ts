
import { describe, it, expect } from 'vitest';
import { reviewPlanSafety, applySafetyReviewToPlan } from './safety-reviewer.js';
import { createEmptyPlan } from './planner.js';

describe('safety-reviewer', () => {
  describe('reviewPlanSafety', () => {
    it('should return safe review for empty plan', () => {
      const plan = createEmptyPlan();
      const review = reviewPlanSafety(plan);

      expect(review.status).toBe('safe');
      expect(review.maxRiskLevel).toBe('safe');
      expect(review.findings).toHaveLength(0);
    });

    it('should identify safe task with no side effects', () => {
      const plan = createEmptyPlan();
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'reply',
          title: 'Reply to user',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const review = reviewPlanSafety(plan);

      expect(review.status).toBe('safe');
      expect(review.maxRiskLevel).toBe('safe');
      expect(review.findings).toHaveLength(1);
      expect(review.findings[0].level).toBe('safe');
    });

    it('should identify high risk for apply tasks', () => {
      const plan = createEmptyPlan();
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Apply changes',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'write',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const review = reviewPlanSafety(plan);

      expect(review.status).toBe('needs_confirmation');
      expect(review.maxRiskLevel).toBe('high');
      expect(review.findings).toHaveLength(1);
      expect(review.findings[0].level).toBe('high');
      expect(review.findings[0].requiredAction).toBe('confirm');
    });

    it('should block dangerous commands', () => {
      const plan = createEmptyPlan();
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Remove files',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'write',
          confidence: 'high',
          needsConfirmation: false,
          command: {
            cli: 'rm',
            args: ['-rf', '/'],
          },
        },
      ];

      const review = reviewPlanSafety(plan);

      expect(review.status).toBe('blocked');
      expect(review.maxRiskLevel).toBe('critical');
    });

    it('should identify medium risk for network tasks', () => {
      const plan = createEmptyPlan();
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'inspect',
          title: 'Fetch data',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'network',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const review = reviewPlanSafety(plan);

      expect(review.status).toBe('needs_confirmation');
      expect(review.maxRiskLevel).toBe('medium');
    });
  });

  describe('applySafetyReviewToPlan', () => {
    it('should update plan with safety review', () => {
      const plan = createEmptyPlan();
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Apply changes',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'write',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const reviewedPlan = applySafetyReviewToPlan(plan);

      expect(reviewedPlan.safetyReview.status).toBe('needs_confirmation');
      expect(reviewedPlan.status).toBe('needs_confirmation');
    });

    it('should set status to blocked for dangerous plans', () => {
      const plan = createEmptyPlan();
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'apply',
          title: 'Dangerous command',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'command',
          confidence: 'high',
          needsConfirmation: false,
          command: {
            cli: 'rm',
            args: ['-rf', '/'],
          },
        },
      ];

      const reviewedPlan = applySafetyReviewToPlan(plan);

      expect(reviewedPlan.safetyReview.status).toBe('blocked');
      expect(reviewedPlan.status).toBe('blocked');
    });

    it('should set status to ready for safe plans', () => {
      const plan = createEmptyPlan();
      plan.tasks = [
        {
          id: 'task-1',
          kind: 'reply',
          title: 'Safe task',
          executor: 'local',
          dependsOn: [],
          inputs: [],
          outputs: [],
          sideEffect: 'none',
          confidence: 'high',
          needsConfirmation: false,
        },
      ];

      const reviewedPlan = applySafetyReviewToPlan(plan);

      expect(reviewedPlan.safetyReview.status).toBe('safe');
      expect(reviewedPlan.status).toBe('ready');
    });
  });
});

