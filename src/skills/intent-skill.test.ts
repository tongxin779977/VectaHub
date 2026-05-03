import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIntentSkill } from './intent-skill.js';
import type { SkillContext } from './types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';

function createMockLLM(output = '{"intent":"QUERY_INFO","params":{},"confidence":0.9}') {
  return {
    id: 'llm-dialog',
    name: 'LLM Dialog Control',
    description: 'mock',
    category: 'utility',
    tags: [],
    version: '1.0.0',
    canHandle: async () => true,
    execute: async () => ({ success: true, output: [] }),
    generateJSON: vi.fn().mockResolvedValue({
      success: true,
      output,
      rawResponse: output,
      attemptCount: 1,
      duration: 100,
    }),
    chat: vi.fn(),
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
    getConfig: vi.fn(),
  } as unknown as LLMDialogControlSkill;
}

function createMockRegistry() {
  return {
    build: vi.fn().mockResolvedValue({
      system: 'system prompt',
      user: 'user prompt',
    }),
    prompts: new Map(),
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    list: vi.fn().mockReturnValue([]),
    listByTag: vi.fn().mockReturnValue([]),
    listByCategory: vi.fn().mockReturnValue([]),
    search: vi.fn().mockReturnValue([]),
    exportAll: vi.fn().mockReturnValue(''),
    importFromYAML: vi.fn(),
    importFromDirectory: vi.fn(),
    evaluate: vi.fn(),
    saveToFile: vi.fn(),
  };
}

describe('IntentSkill', () => {
  let skill: ReturnType<typeof createIntentSkill>;
  let mockLLM: ReturnType<typeof createMockLLM>;
  let mockRegistry: ReturnType<typeof createMockRegistry>;
  let context: SkillContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = createMockLLM();
    mockRegistry = createMockRegistry();
    skill = createIntentSkill(mockRegistry as any, mockLLM);
    context = { userInput: 'What is my website about?' };
  });

  it('should have correct metadata', () => {
    expect(skill.id).toBe('vectahub.intent');
    expect(skill.name).toBe('Intent Recognition');
    expect(skill.tags).toContain('intent');
    expect(skill.tags).toContain('core');
  });

  it('should handle non-empty input', async () => {
    const canHandle = await skill.canHandle(context);
    expect(canHandle).toBe(true);
  });

  it('should not handle empty input', async () => {
    const canHandle = await skill.canHandle({ userInput: '' });
    expect(canHandle).toBe(false);
  });

  it('should parse intent via promptRegistry.build + LLM', async () => {
    const result = await skill.execute('What is my website about?', context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.intent).toBe('QUERY_INFO');
    expect(result.confidence).toBe(0.9);
    expect(mockRegistry.build).toHaveBeenCalledWith('intent-parser-v1', expect.objectContaining({
      userInput: 'What is my website about?',
    }));
  });

  it('should return failure when LLM fails', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: false, output: '', rawResponse: '', attemptCount: 1, duration: 100, error: 'API timeout',
    });

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('API timeout');
  });

  it('should return failure on invalid JSON', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: true, output: 'not json', rawResponse: 'not json', attemptCount: 1, duration: 100,
    });

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unexpected token');
  });

  it('should return failure on unknown intent', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: true,
      output: JSON.stringify({ intent: 'FAKE_INTENT', params: {}, confidence: 0.5 }),
      rawResponse: '', attemptCount: 1, duration: 100,
    });

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown intent');
  });

  it('should pass through LLM confidence value', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: true,
      output: JSON.stringify({ intent: 'QUERY_INFO', params: {}, confidence: 0.7 }),
      rawResponse: '', attemptCount: 1, duration: 100,
    });

    const result = await skill.execute('test', context);

    expect(result.success).toBe(true);
    expect(result.confidence).toBe(0.7);
  });

  it('should return undefined confidence when missing from LLM output', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: true,
      output: JSON.stringify({ intent: 'QUERY_INFO', params: {} }),
      rawResponse: '', attemptCount: 1, duration: 100,
    });

    const result = await skill.execute('test', context);

    expect(result.success).toBe(true);
    expect(result.confidence).toBeUndefined();
  });

  it('should pass projectContext and userPreferences to prompt', async () => {
    const ctx: SkillContext = {
      userInput: 'test',
      projectContext: { projectName: 'test-project' } as any,
      userPreferences: { theme: 'dark' } as any,
    };

    await skill.execute('test', ctx);

    expect(mockRegistry.build).toHaveBeenCalledWith('intent-parser-v1', expect.objectContaining({
      projectContext: JSON.stringify({ projectName: 'test-project' }),
      userPreferences: JSON.stringify({ theme: 'dark' }),
    }));
  });
});
