
import { describe, it, expect } from 'vitest';
import {
  applyConfirmationToPlan,
  applyConfirmationToDraft,
  applyNonInteractiveDenyToPlan,
  applyNonInteractiveDenyToDraft,
} from './confirmation-handler.js';
import { createEmptyPlan } from './planner.js';
import { applySafetyReviewToPlan } from './safety-reviewer.js';
import type { OrchestrationTask } from '../types/orchestration-plan.js';
import { convertPlanToDraft } from './workflow-draft-converter.js';

describe('confirmation-handler', () => {
  describe('applyConfirmationToPlan', () => {
    it('should mark plan as ready when all required tasks are confirmed', () => {
      const plan = createEmptyPlan();
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test Apply',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: true,
      };
      plan.tasks = [task];
      const reviewedPlan = applySafetyReviewToPlan(plan);
      
      const confirmedPlan = applyConfirmationToPlan(reviewedPlan, {
        confirmedTaskIds: ['task-1'],
        deniedTaskIds: [],
      });
      
      expect(confirmedPlan.status).toBe('ready');
    });
    
    it('should mark plan as blocked when any task is denied', () => {
      const plan = createEmptyPlan();
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test Apply',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: true,
      };
      plan.tasks = [task];
      const reviewedPlan = applySafetyReviewToPlan(plan);
      
      const confirmedPlan = applyConfirmationToPlan(reviewedPlan, {
        confirmedTaskIds: [],
        deniedTaskIds: ['task-1'],
      });
      
      expect(confirmedPlan.status).toBe('blocked');
    });
  });
  
  describe('applyNonInteractiveDenyToPlan', () => {
    it('should apply non-interactive deny policy and mark as blocked', () => {
      const plan = createEmptyPlan();
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test Apply',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: true,
      };
      plan.tasks = [task];
      const reviewedPlan = applySafetyReviewToPlan(plan);
      
      const deniedPlan = applyNonInteractiveDenyToPlan(reviewedPlan);
      
      expect(deniedPlan.status).toBe('blocked');
    });
  });
  
  describe('applyConfirmationToDraft', () => {
    it('should mark draft as confirmed when all tasks are confirmed', () => {
      const plan = createEmptyPlan();
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test Apply',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: true,
      };
      plan.tasks = [task];
      const reviewedPlan = applySafetyReviewToPlan(plan);
      const draft = convertPlanToDraft(reviewedPlan);
      
      const confirmedDraft = applyConfirmationToDraft(draft, {
        confirmedTaskIds: ['task-1'],
        deniedTaskIds: [],
      });
      
      expect(confirmedDraft.status).toBe('confirmed');
      expect(confirmedDraft.confirmation).toBeDefined();
    });
    
    it('should mark draft as cancelled when any task is denied', () => {
      const plan = createEmptyPlan();
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test Apply',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: true,
      };
      plan.tasks = [task];
      const reviewedPlan = applySafetyReviewToPlan(plan);
      const draft = convertPlanToDraft(reviewedPlan);
      
      const confirmedDraft = applyConfirmationToDraft(draft, {
        confirmedTaskIds: [],
        deniedTaskIds: ['task-1'],
      });
      
      expect(confirmedDraft.status).toBe('cancelled');
    });
  });
  
  describe('applyNonInteractiveDenyToDraft', () => {
    it('should apply non-interactive deny policy and mark as cancelled', () => {
      const plan = createEmptyPlan();
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test Apply',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: true,
      };
      plan.tasks = [task];
      const reviewedPlan = applySafetyReviewToPlan(plan);
      const draft = convertPlanToDraft(reviewedPlan);
      
      const deniedDraft = applyNonInteractiveDenyToDraft(draft);
      
      expect(deniedDraft.status).toBe('cancelled');
      expect(deniedDraft.confirmation?.confirmedBy).toBe('non_interactive_policy');
    });
  });
});
