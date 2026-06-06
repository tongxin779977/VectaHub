import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildWorkerCapabilityMatrix,
  getWorkerCapability,
  workerSupportsFeature,
  workerIsSuitableForTask,
  workerAllowInExecutablePlans,
} from './worker-capability-matrix.js';
import { getAgentRegistry, resetAgentRegistry } from '../agent-runtime/registry.js';
import { initializeBuiltInAgents } from '../agent-runtime/factory.js';

describe('Worker Capability Matrix', () => {
  beforeEach(() => {
    resetAgentRegistry();
    initializeBuiltInAgents();
  });

  describe('buildWorkerCapabilityMatrix', () => {
    it('should build a matrix with all built-in workers', () => {
      const matrix = buildWorkerCapabilityMatrix();

      expect(matrix.workers).toBeDefined();
      expect(matrix.workers.codex).toBeDefined();
      expect(matrix.workers.claude).toBeDefined();
      expect(matrix.workers.gemini).toBeDefined();
      expect(matrix.workers.aider).toBeDefined();
      expect(matrix.updatedAt).toBeGreaterThan(0);
    });

    it('should include all worker summary fields', () => {
      const matrix = buildWorkerCapabilityMatrix();
      const codex = matrix.workers.codex;

      expect(codex.id).toBe('codex');
      expect(codex.displayName).toBeDefined();
      expect(codex.suitableTasks).toBeDefined();
      expect(codex.nativeFeatures).toBeDefined();
      expect(codex.constraints).toBeDefined();
      expect(codex.allowInExecutablePlans).toBe(true);
      expect(codex.llmSummary).toBeDefined();
    });
  });

  describe('getWorkerCapability', () => {
    it('should return capability summary for existing worker', () => {
      const capability = getWorkerCapability('codex');

      expect(capability).not.toBeNull();
      expect(capability?.id).toBe('codex');
    });

    it('should return default summary for unknown worker', () => {
      const capability = getWorkerCapability('unknown-worker');

      expect(capability).not.toBeNull();
      expect(capability?.id).toBe('unknown-worker');
      expect(capability?.allowInExecutablePlans).toBe(false);
    });

    it('should be case-insensitive', () => {
      const capability1 = getWorkerCapability('Codex');
      const capability2 = getWorkerCapability('CODEX');

      expect(capability1?.id).toBe('codex');
      expect(capability2?.id).toBe('codex');
    });
  });

  describe('workerSupportsFeature', () => {
    it('should return supported for supported features', () => {
      const result = workerSupportsFeature('codex', 'json_output');

      expect(result).toBe('supported');
    });

    it('should return unsupported for unsupported features', () => {
      const result = workerSupportsFeature('codex', 'subagent');

      expect(result).toBe('unsupported');
    });

    it('should return partial for partially supported features', () => {
      const result = workerSupportsFeature('codex', 'mcp');

      expect(result).toBe('partial');
    });

    it('should return unsupported for unknown workers', () => {
      const result = workerSupportsFeature('unknown-worker', 'json_output');

      expect(result).toBe('unsupported');
    });
  });

  describe('workerIsSuitableForTask', () => {
    it('should return true for suitable tasks', () => {
      const result = workerIsSuitableForTask('codex', 'codegen');

      expect(result).toBe(true);
    });

    it('should return false for unsuitable tasks', () => {
      // Aider doesn't have semantic_test in its suitable tasks
      const result = workerIsSuitableForTask('aider', 'semantic_test');

      expect(result).toBe(false);
    });

    it('should return false for unknown workers', () => {
      const result = workerIsSuitableForTask('unknown-worker', 'codegen');

      expect(result).toBe(false);
    });
  });

  describe('workerAllowInExecutablePlans', () => {
    it('should return true for registered workers', () => {
      const result = workerAllowInExecutablePlans('codex');

      expect(result).toBe(true);
    });

    it('should return false for unknown workers', () => {
      // Clear registry to test
      resetAgentRegistry();
      // Default workers (codex, claude, gemini, aider) should still return true
      expect(workerAllowInExecutablePlans('codex')).toBe(true);
      expect(workerAllowInExecutablePlans('claude')).toBe(true);
      expect(workerAllowInExecutablePlans('gemini')).toBe(true);
      expect(workerAllowInExecutablePlans('aider')).toBe(true);
      // Truly unknown workers should return false
      expect(workerAllowInExecutablePlans('unknown-worker')).toBe(false);
    });
  });

  describe('native feature support', () => {
    it('should have correct feature support for codex', () => {
      const capability = getWorkerCapability('codex');

      expect(capability?.nativeFeatures.json_output).toBe('supported');
      expect(capability?.nativeFeatures.headless).toBe('supported');
      expect(capability?.nativeFeatures.approval).toBe('supported');
      expect(capability?.nativeFeatures.sandbox).toBe('supported');
      expect(capability?.nativeFeatures.mcp).toBe('partial');
      expect(capability?.nativeFeatures.subagent).toBe('unsupported');
    });

    it('should have correct feature support for aider', () => {
      const capability = getWorkerCapability('aider');

      expect(capability?.nativeFeatures.checkpoint).toBe('supported');
      expect(capability?.nativeFeatures.resume).toBe('supported');
    });

    it('should have correct feature support for claude', () => {
      const capability = getWorkerCapability('claude');

      expect(capability?.nativeFeatures.mcp).toBe('supported');
    });
  });

  describe('suitable tasks', () => {
    it('should have correct suitable tasks for codex', () => {
      const capability = getWorkerCapability('codex');

      expect(capability?.suitableTasks).toContain('codegen');
      expect(capability?.suitableTasks).toContain('refactor');
      expect(capability?.suitableTasks).toContain('review');
      expect(capability?.suitableTasks).toContain('test');
      expect(capability?.suitableTasks).toContain('debug');
      expect(capability?.suitableTasks).toContain('docs');
      expect(capability?.suitableTasks).toContain('semantic_test');
    });

    it('should have correct suitable tasks for aider', () => {
      const capability = getWorkerCapability('aider');

      expect(capability?.suitableTasks).toContain('codegen');
      expect(capability?.suitableTasks).toContain('refactor');
      expect(capability?.suitableTasks).not.toContain('semantic_test');
    });
  });

  describe('constraints', () => {
    it('should include constraints for each worker', () => {
      const codex = getWorkerCapability('codex');
      const claude = getWorkerCapability('claude');
      const gemini = getWorkerCapability('gemini');
      const aider = getWorkerCapability('aider');

      expect(codex?.constraints.length).toBeGreaterThan(0);
      expect(claude?.constraints.length).toBeGreaterThan(0);
      expect(gemini?.constraints.length).toBeGreaterThan(0);
      expect(aider?.constraints.length).toBeGreaterThan(0);
    });
  });

  describe('llmSummary', () => {
    it('should provide a readable summary for LLM context', () => {
      const codex = getWorkerCapability('codex');

      expect(codex?.llmSummary).toContain('code generation');
      expect(codex?.llmSummary).toContain('JSON output');
    });
  });
});
