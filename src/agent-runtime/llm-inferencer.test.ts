import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LlmInferencer, getLlmInferencer, resetLlmInferencer } from './llm-inferencer';
import type { LlmInferenceResult, CliDetectionResult } from '../types/provider';

describe('LlmInferencer', () => {
  beforeEach(() => {
    resetLlmInferencer();
  });
  
  const mockDetectionResult: CliDetectionResult = {
    found: true,
    path: '/usr/bin/test-cli',
    version: '1.0.0',
    helpOutput: 'Usage: test-cli --prompt <text>',
  };
  
  const mockInferenceResult: LlmInferenceResult = {
    descriptor: {
      id: 'test-cli',
      displayName: 'Test CLI',
      entryCommand: 'test-cli',
      promptTransport: 'arg',
      promptArgName: '--prompt',
      nonInteractiveFlags: [],
      approvalPolicySupport: 'unknown',
      structuredOutputSupport: false,
      preflightSpec: { versionArgs: ['--version'], invocableArgs: ['--help'], readyArgs: ['--help'] },
      dryRunRenderMode: 'prompt-only',
      runtimePolicy: { configSemantics: 'inherit-user-default' },
      description: 'Test CLI description',
    },
    adapterLogic: 'Build command with prompt arg',
    usageNotes: 'Use --prompt flag',
  };
  
  it('should infer CLI configuration', async () => {
    const mockLlmClient = {
      completeRaw: vi.fn().mockResolvedValue(JSON.stringify(mockInferenceResult)),
    };
    
    const inferencer = new LlmInferencer({ llmClient: mockLlmClient });
    const result = await inferencer.infer('test-cli', mockDetectionResult);
    
    expect(mockLlmClient.completeRaw).toHaveBeenCalled();
    expect(result.descriptor.id).toBe('test-cli');
    expect(result.descriptor.displayName).toBe('Test CLI');
  });
  
  it('should throw error when LLM is not configured', async () => {
    const inferencer = new LlmInferencer();
    // 直接 mock createLLMClient 避免调用真实代码
    vi.spyOn(inferencer as any, 'createLLMClient').mockReturnValue(null);
    
    await expect(inferencer.infer('test-cli', mockDetectionResult)).rejects.toThrow('LLM is not configured');
  });
  
  it('should handle invalid LLM response', async () => {
    const mockLlmClient = {
      completeRaw: vi.fn().mockResolvedValue('not json'),
    };
    
    const inferencer = new LlmInferencer({ llmClient: mockLlmClient });
    
    await expect(inferencer.infer('test-cli', mockDetectionResult)).rejects.toThrow();
  });
  
  it('should validate descriptor fields', async () => {
    const invalidResult = JSON.parse(JSON.stringify(mockInferenceResult)); // 深拷贝
    delete invalidResult.descriptor.promptTransport;
    
    const mockLlmClient = {
      completeRaw: vi.fn().mockResolvedValue(JSON.stringify(invalidResult)),
    };
    
    const inferencer = new LlmInferencer({ llmClient: mockLlmClient });
    
    await expect(inferencer.infer('test-cli', mockDetectionResult)).rejects.toThrow('Missing required field in descriptor');
  });
  
  it('should use singleton', async () => {
    resetLlmInferencer();
    const inferencer1 = getLlmInferencer();
    const inferencer2 = getLlmInferencer();
    expect(inferencer1).toBe(inferencer2);
  });
  
  it('should use provided logger', async () => {
    resetLlmInferencer();
    const mockLlmClient = {
      completeRaw: vi.fn().mockResolvedValue(JSON.stringify(mockInferenceResult)),
    };
    const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    
    const inferencer = new LlmInferencer({ llmClient: mockLlmClient, logger }); // 直接 new，不用 singleton
    await inferencer.infer('test-cli', mockDetectionResult);
    
    expect(logger.info).toHaveBeenCalled();
  });
});
