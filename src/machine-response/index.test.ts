import { expect, test, describe } from 'vitest';
import {
  buildSuccessResponse,
  buildReplyResponse,
  buildClarifyResponse,
  buildBlockedResponse,
  buildValidationErrorResponse,
  buildSafetyErrorResponse,
  buildInternalErrorResponse,
  buildPlanResponse,
  buildWorkflowDraftResponse,
  buildMachineResponse,
  safeErrorSerialize,
} from './index.js';
import type { OrchestrationPlan } from '../types/orchestration-plan.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';

describe('machine-response', () => {
  describe('safeErrorSerialize', () => {
    test('should serialize Error without exposing stack traces', () => {
      const error = new Error('Test error message');
      const result = safeErrorSerialize(error);
      expect(result.reason).toBe('Test error message');
      expect(result.errorId).toBeDefined();
      expect(result.errorId?.startsWith('err_')).toBe(true);
    });

    test('should serialize string errors', () => {
      const result = safeErrorSerialize('String error');
      expect(result.reason).toBe('String error');
    });

    test('should handle unknown error types', () => {
      const result = safeErrorSerialize({ some: 'object' });
      expect(result.reason).toBe('An unexpected error occurred');
    });
  });

  describe('buildSuccessResponse', () => {
    test('should build success response', () => {
      const response = buildSuccessResponse('Operation completed');
      expect(response.schemaVersion).toBe('1.0');
      expect(response.ok).toBe(true);
      expect(response.result.kind).toBe('success');
      expect(response.result).toEqual({
        kind: 'success',
        message: 'Operation completed',
      });
      expect(response.timestamp).toBeDefined();
    });
  });

  describe('buildReplyResponse', () => {
    test('should build reply response', () => {
      const response = buildReplyResponse('Here is the information');
      expect(response.ok).toBe(true);
      expect(response.result.kind).toBe('reply');
      expect(response.result).toEqual({
        kind: 'reply',
        reply: 'Here is the information',
      });
    });
  });

  describe('buildClarifyResponse', () => {
    test('should build clarify response', () => {
      const response = buildClarifyResponse('Need more information', {
        suggestedAction: 'Please specify the file path',
      });
      expect(response.ok).toBe(true);
      expect(response.result.kind).toBe('clarify');
      expect(response.result).toEqual({
        kind: 'clarify',
        reason: 'Need more information',
        suggestedAction: 'Please specify the file path',
      });
    });
  });

  describe('buildBlockedResponse', () => {
    test('should build blocked response', () => {
      const response = buildBlockedResponse('Operation blocked for security reasons', {
        blockedBy: 'safety',
        suggestedAction: 'Please review the safety policy',
      });
      expect(response.ok).toBe(false);
      expect(response.result.kind).toBe('blocked');
      expect(response.result).toEqual({
        kind: 'blocked',
        reason: 'Operation blocked for security reasons',
        blockedBy: 'safety',
        suggestedAction: 'Please review the safety policy',
      });
    });
  });

  describe('buildValidationErrorResponse', () => {
    test('should build validation error response', () => {
      const response = buildValidationErrorResponse('Invalid input', ['Missing required field', 'Invalid format']);
      expect(response.ok).toBe(false);
      expect(response.result.kind).toBe('validation_error');
      expect(response.result).toEqual({
        kind: 'validation_error',
        reason: 'Invalid input',
        validationErrors: ['Missing required field', 'Invalid format'],
      });
    });
  });

  describe('buildSafetyErrorResponse', () => {
    test('should build safety error response', () => {
      const response = buildSafetyErrorResponse('High risk operation detected', {
        riskLevel: 'high',
      });
      expect(response.ok).toBe(false);
      expect(response.result.kind).toBe('safety_error');
      expect(response.result).toEqual({
        kind: 'safety_error',
        reason: 'High risk operation detected',
        riskLevel: 'high',
      });
    });
  });

  describe('buildInternalErrorResponse', () => {
    test('should build internal error response with safe serialization', () => {
      const error = new Error('Internal server error');
      const response = buildInternalErrorResponse(error);
      expect(response.ok).toBe(false);
      expect(response.result.kind).toBe('internal_error');
      expect(response.result.reason).toBe('Internal server error');
      expect(response.result.errorId).toBeDefined();
    });
  });

  describe('buildPlanResponse', () => {
    test('should build plan response', () => {
      const plan: OrchestrationPlan = {
        schemaVersion: '1.0',
        planId: 'test-plan',
        source: 'run',
        goal: 'Test goal',
        status: 'ready',
        assumptions: [],
        tasks: [],
        safetyReview: {
          status: 'safe',
          maxRiskLevel: 'safe',
          findings: [],
        },
        requiredConfirmations: [],
        verification: {
          required: false,
          commands: [],
          semanticChecks: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
          intentRecognitionMethod: 'capability',
        },
      };
      const response = buildPlanResponse(plan);
      expect(response.ok).toBe(true);
      expect(response.result.kind).toBe('plan');
      expect(response.result.plan).toEqual(plan);
    });
  });

  describe('buildWorkflowDraftResponse', () => {
    test('should build workflow draft response', () => {
      const draft: WorkflowDraft = {
        schemaVersion: '1.0',
        draftId: 'test-draft',
        planId: 'test-plan',
        status: 'draft',
        steps: [],
        snapshot: {
          planHash: 'hash',
          workflowHash: 'hash',
          generatedAt: new Date().toISOString(),
          sourceCwd: '/test',
        },
        safetyReview: {
          status: 'safe',
          maxRiskLevel: 'safe',
          findings: [],
        },
        confirmations: [],
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
        },
      };
      const response = buildWorkflowDraftResponse(draft);
      expect(response.ok).toBe(true);
      expect(response.result.kind).toBe('workflow_draft');
      expect(response.result.workflowDraft).toEqual(draft);
    });
  });

  describe('JSON output contract', () => {
    test('should output valid single JSON object', () => {
      const response = buildSuccessResponse('Test');
      const jsonString = JSON.stringify(response);
      // Verify it's a single valid JSON object
      expect(() => JSON.parse(jsonString)).not.toThrow();
      const parsed = JSON.parse(jsonString);
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
      expect(Array.isArray(parsed)).toBe(false);
    });

    test('should not include undefined fields that pollute JSON', () => {
      const response = buildReplyResponse('Hello');
      // When stringified, optional undefined fields should not be present
      const str = JSON.stringify(response);
      expect(str).not.toContain('undefined');
    });
  });
});
