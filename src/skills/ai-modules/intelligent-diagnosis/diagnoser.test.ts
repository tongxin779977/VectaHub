import { describe, it, expect, vi } from 'vitest';
import { createIntelligentDiagnosisModule, type DiagnosisLLMClient } from './diagnoser.js';
import { createAIModuleRegistry } from '../registry.js';
import type { DiagnosisInput } from './types.js';
import type { AIModule, AIModuleContext } from '../types.js';
import type { Detector } from '../../../sandbox/detector.js';

function createMockLLMClient(response: string): DiagnosisLLMClient {
  return {
    complete: vi.fn().mockResolvedValue(response),
  };
}

function createMockDetector(isDangerous: boolean, reason?: string): Detector {
  return {
    detect: vi.fn().mockReturnValue({
      isDangerous,
      level: isDangerous ? 'high' as const : 'none' as const,
      reason: reason ?? 'dangerous command detected',
    }),
    isDangerous: vi.fn().mockReturnValue(isDangerous),
    getDangerLevel: vi.fn().mockReturnValue({
      level: isDangerous ? 'high' : 'none',
    }),
  };
}

function createMockModule(id: string): AIModule {
  return {
    id,
    name: `Module ${id}`,
    version: '1.0.0',
    type: 'ai-enhancement',
    canHandle: async () => true,
    execute: async () => ({ success: true }),
  };
}

const mockContext: AIModuleContext = { userInput: 'test' };

describe('IntelligentDiagnosisModule', () => {
  describe('module registration', () => {
    it('should register in AIModuleRegistry', () => {
      const registry = createAIModuleRegistry();
      const module = createIntelligentDiagnosisModule({
        llmClient: createMockLLMClient('{}'),
      });
      registry.register(module);
      expect(registry.get('vectahub.intelligent-diagnosis')).toBe(module);
    });
  });

  describe('canHandle', () => {
    it('returns false when no LLM client', async () => {
      const module = createIntelligentDiagnosisModule();
      expect(await module.canHandle(mockContext)).toBe(false);
    });

    it('returns true when LLM available', async () => {
      const module = createIntelligentDiagnosisModule({
        llmClient: createMockLLMClient('{}'),
      });
      expect(await module.canHandle(mockContext)).toBe(true);
    });
  });

  describe('execute - basic diagnosis', () => {
    it('parses LLM JSON response correctly', async () => {
      const diagnosisResponse = JSON.stringify({
        rootCause: 'Missing dependency',
        category: 'dependency',
        fixSuggestions: [
          { description: 'Install missing package', command: 'npm install lodash', risk: 'low' },
        ],
        confidence: 0.85,
        needsHumanReview: false,
      });
      const module = createIntelligentDiagnosisModule({
        llmClient: createMockLLMClient(diagnosisResponse),
      });

      const input: DiagnosisInput = {
        error: 'Module not found: lodash',
        stepId: 'step-1',
      };
      const result = await module.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.rootCause).toBe('Missing dependency');
      expect(result.data?.category).toBe('dependency');
      expect(result.data?.fixSuggestions).toHaveLength(1);
      expect(result.data?.fixSuggestions[0].description).toBe('Install missing package');
      expect(result.data?.fixSuggestions[0].command).toBe('npm install lodash');
      expect(result.data?.fixSuggestions[0].risk).toBe('low');
      expect(result.data?.confidence).toBe(0.85);
      expect(result.data?.needsHumanReview).toBe(false);
    });
  });

  describe('execute - fix suggestion security', () => {
    it('upgrades risk to high when detector flags command as dangerous', async () => {
      const diagnosisResponse = JSON.stringify({
        rootCause: 'Permission denied',
        category: 'permission',
        fixSuggestions: [
          { description: 'Fix permissions', command: 'chmod 777 /etc/passwd', risk: 'low' },
        ],
        confidence: 0.7,
        needsHumanReview: true,
      });
      const module = createIntelligentDiagnosisModule({
        llmClient: createMockLLMClient(diagnosisResponse),
        detector: createMockDetector(true, 'dangerous command detected'),
      });

      const input: DiagnosisInput = { error: 'EACCES: permission denied' };
      const result = await module.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.fixSuggestions[0].risk).toBe('high');
      expect(result.data?.fixSuggestions[0].description).toContain('DANGEROUS');
    });
  });

  describe('execute - error handling', () => {
    it('handles LLM returning invalid JSON gracefully', async () => {
      const module = createIntelligentDiagnosisModule({
        llmClient: createMockLLMClient('not valid json{{{'),
      });

      const input: DiagnosisInput = { error: 'something broke' };
      const result = await module.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when no LLM client', async () => {
      const module = createIntelligentDiagnosisModule();

      const input: DiagnosisInput = { error: 'test' };
      const result = await module.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('LLM unavailable');
    });

    it('returns error when LLM complete throws', async () => {
      const failingLLM: DiagnosisLLMClient = {
        complete: vi.fn().mockRejectedValue(new Error('API error')),
      };
      const module = createIntelligentDiagnosisModule({ llmClient: failingLLM });

      const input: DiagnosisInput = { error: 'test' };
      const result = await module.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('LLM unavailable');
    });
  });

  describe('module unregister', () => {
    it('has no effect on other modules after unregister', async () => {
      const registry = createAIModuleRegistry();
      const diagnosisModule = createIntelligentDiagnosisModule({
        llmClient: createMockLLMClient('{}'),
      });
      const otherModule = createMockModule('other-module');
      registry.register(diagnosisModule);
      registry.register(otherModule);

      registry.unregister('vectahub.intelligent-diagnosis');

      expect(registry.get('vectahub.intelligent-diagnosis')).toBeUndefined();
      expect(registry.get('other-module')).toBe(otherModule);
      expect(registry.size()).toBe(1);
    });
  });
});
