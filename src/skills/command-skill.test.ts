import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCommandSkill } from './command-skill.js';
import type { SkillContext } from './types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';
import type { CommandSkillInput } from './command-skill.js';

function createMockLLM(output = '{"commands":[{"cli":"vecta","args":["crawl","${url}"]}]}') {
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
    build: vi.fn().mockResolvedValue({ system: 'sys', user: 'usr' }),
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

describe('CommandSkill', () => {
  let skill: ReturnType<typeof createCommandSkill>;
  let mockLLM: ReturnType<typeof createMockLLM>;
  let mockRegistry: ReturnType<typeof createMockRegistry>;
  let context: SkillContext;
  let validInput: CommandSkillInput;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = createMockLLM();
    mockRegistry = createMockRegistry();
    skill = createCommandSkill(mockRegistry as any, mockLLM);
    context = { userInput: 'crawl my website' };
    validInput = { intent: 'EXECUTE_TASK', params: { taskType: 'crawl' }, userInput: 'crawl my website' };
  });

  it('should have correct metadata', () => {
    expect(skill.id).toBe('vectahub.command');
    expect(skill.name).toBe('Command Generation');
    expect(skill.tags).toContain('command');
  });

  it('should handle any context', async () => {
    expect(await skill.canHandle(context)).toBe(true);
  });

  it('should generate commands via LLM', async () => {
    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.commands).toHaveLength(1);
    expect(result.data!.commands[0].cli).toBe('vecta');
    expect(mockRegistry.build).toHaveBeenCalledWith('command-generator-v1', expect.objectContaining({
      intent: 'EXECUTE_TASK',
    }));
  });

  it('should fallback to keyword matching when LLM fails', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: false, output: '', rawResponse: '', attemptCount: 1, duration: 100, error: 'err',
    });

    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.metadata?.fallback).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it('should fallback when LLM returns invalid JSON', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: true, output: 'not json', rawResponse: '', attemptCount: 1, duration: 100,
    });

    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.metadata?.fallback).toBe(true);
  });

  it('should fallback when LLM returns empty commands', async () => {
    (mockLLM.generateJSON as any).mockResolvedValue({
      success: true, output: JSON.stringify({ commands: [] }), rawResponse: '', attemptCount: 1, duration: 100,
    });

    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.metadata?.fallback).toBe(true);
  });

  it('should fallback when promptRegistry.build fails', async () => {
    (mockRegistry.build as any).mockRejectedValue(new Error('registry error'));

    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.metadata?.fallback).toBe(true);
  });
});
