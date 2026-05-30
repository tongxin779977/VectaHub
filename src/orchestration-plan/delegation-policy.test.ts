/**
 * Tests for Delegation Policy
 */

import { describe, it, expect } from 'vitest';
import {
  makeDelegationDecision,
  applyDelegationDecision,
  delegatedTaskRequiresVerification,
} from './delegation-policy.js';
import type { OrchestrationTask } from '../types/orchestration-plan.js';

describe('delegation-policy', () => {
  describe('makeDelegationDecision', () => {
    it('should return canDelegate false for non-agent tasks', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      const decision = makeDelegationDecision(task);

      expect(decision.canDelegate).toBe(false);
      expect(decision.blockingReason).toContain('not set to agent');
    });

    it('should return suitable workers for agent tasks', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      const decision = makeDelegationDecision(task);

      expect(decision.canDelegate).toBe(true);
      expect(decision.suitableWorkers.length).toBeGreaterThan(0);
      expect(decision.requiresVerification).toBe(true);
    });

    it('should respect delegateTo if specified and valid', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        delegateTo: 'codex',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      const decision = makeDelegationDecision(task);

      expect(decision.canDelegate).toBe(true);
      expect(decision.recommendedWorker).toBe('codex');
    });

    it('should block invalid delegateTo', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        delegateTo: 'unknown-worker' as any,
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      const decision = makeDelegationDecision(task);

      expect(decision.canDelegate).toBe(false);
    });

    it('should respect preferredWorker option', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      const decision = makeDelegationDecision(task, { preferredWorker: 'claude' });

      expect(decision.canDelegate).toBe(true);
      expect(decision.recommendedWorker).toBe('claude');
    });
  });

  describe('applyDelegationDecision', () => {
    it('should apply recommended worker to task', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      const decision = makeDelegationDecision(task);
      const updatedTask = applyDelegationDecision(task, decision);

      expect(updatedTask.delegateTo).toBe(decision.recommendedWorker as any);
      expect(updatedTask.needsConfirmation).toBe(true);
    });

    it('should mark task as needing confirmation when cannot delegate', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'local',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      const decision = makeDelegationDecision(task);
      const updatedTask = applyDelegationDecision(task, decision);

      expect(updatedTask.needsConfirmation).toBe(true);
      expect(updatedTask.blockingReason).toBeDefined();
    });
  });

  describe('delegatedTaskRequiresVerification', () => {
    it('should return true for write side effects', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'write',
        confidence: 'high',
        needsConfirmation: false,
      };

      expect(delegatedTaskRequiresVerification(task)).toBe(true);
    });

    it('should return true for command side effects', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'command',
        confidence: 'high',
        needsConfirmation: false,
      };

      expect(delegatedTaskRequiresVerification(task)).toBe(true);
    });

    it('should return false for none side effects', () => {
      const task: OrchestrationTask = {
        id: 'task-1',
        kind: 'apply',
        title: 'Test task',
        executor: 'agent',
        dependsOn: [],
        inputs: [],
        outputs: [],
        sideEffect: 'none',
        confidence: 'high',
        needsConfirmation: false,
      };

      expect(delegatedTaskRequiresVerification(task)).toBe(false);
    });
  });
});
