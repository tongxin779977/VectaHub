/**
 * Tests for native feature passthrough policy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildNativeFeaturePassthroughPolicy,
  getNativeFeaturePolicy,
  evaluateFeaturePassthroughRequest,
  isFeaturePassthroughAllowed,
  doesFeaturePassthroughRequireConfirmation,
  isFeaturePassthroughBlocked,
} from './native-feature-passthrough-policy.js';
import type { FeaturePassthroughRequest } from '../types/native-feature-passthrough.js';
import { resetAgentRegistry } from '../agent-runtime/registry.js';
import { initializeBuiltInAgents } from '../agent-runtime/factory.js';

describe('native-feature-passthrough-policy', () => {
  beforeEach(() => {
    resetAgentRegistry();
    initializeBuiltInAgents();
  });
  describe('buildNativeFeaturePassthroughPolicy', () => {
    it('should build a complete policy with all features', () => {
      const policy = buildNativeFeaturePassthroughPolicy();
      expect(policy.policies).toHaveProperty('json_output');
      expect(policy.policies).toHaveProperty('headless');
      expect(policy.policies).toHaveProperty('approval');
      expect(policy.policies).toHaveProperty('sandbox');
      expect(policy.policies).toHaveProperty('mcp');
      expect(policy.policies).toHaveProperty('subagent');
      expect(policy.policies).toHaveProperty('memory');
      expect(policy.policies).toHaveProperty('checkpoint');
      expect(policy.policies).toHaveProperty('resume');
      expect(policy.updatedAt).toBeGreaterThan(0);
    });
  });

  describe('getNativeFeaturePolicy', () => {
    it('should return the policy for an existing feature', () => {
      const policy = getNativeFeaturePolicy('json_output');
      expect(policy.feature).toBe('json_output');
      expect(policy.defaultDecision).toBe('allow');
    });
  });

  describe('evaluateFeaturePassthroughRequest', () => {
    it('should allow json_output for codex', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'codex',
        feature: 'json_output',
        context: {},
        isExecutablePlan: true,
      };
      const result = evaluateFeaturePassthroughRequest(request);
      expect(result.decision).toBe('allow');
      expect(result.workerSupportsFeature).toBe(true);
    });

    it('should block mcp by default', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'claude',
        feature: 'mcp',
        context: {},
        isExecutablePlan: true,
      };
      const result = evaluateFeaturePassthroughRequest(request);
      expect(result.decision).toBe('block');
    });

    it('should confirm approval feature', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'gemini',
        feature: 'approval',
        context: {},
        isExecutablePlan: true,
      };
      const result = evaluateFeaturePassthroughRequest(request);
      expect(result.decision).toBe('confirm');
    });

    it('should return unsupported if worker does not support the feature', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'aider',
        feature: 'mcp',
        context: {},
        isExecutablePlan: true,
      };
      const result = evaluateFeaturePassthroughRequest(request);
      expect(result.decision).toBe('unsupported');
    });

    it('should block mcp even when worker supports it', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'claude',
        feature: 'mcp',
        context: {},
        isExecutablePlan: false,
      };
      const result = evaluateFeaturePassthroughRequest(request);
      expect(result.decision).toBe('block');
    });
  });

  describe('helper functions', () => {
    it('isFeaturePassthroughAllowed should return true for allowed features', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'codex',
        feature: 'json_output',
        context: {},
        isExecutablePlan: true,
      };
      expect(isFeaturePassthroughAllowed(request)).toBe(true);
    });

    it('doesFeaturePassthroughRequireConfirmation should return true for confirm features', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'claude',
        feature: 'approval',
        context: {},
        isExecutablePlan: true,
      };
      expect(doesFeaturePassthroughRequireConfirmation(request)).toBe(true);
    });

    it('isFeaturePassthroughBlocked should return true for blocked features', () => {
      const request: FeaturePassthroughRequest = {
        workerId: 'gemini',
        feature: 'mcp',
        context: {},
        isExecutablePlan: true,
      };
      expect(isFeaturePassthroughBlocked(request)).toBe(true);
    });
  });
});
