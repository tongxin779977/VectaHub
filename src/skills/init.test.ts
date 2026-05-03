import { describe, it, expect, vi } from 'vitest';
import { createSkillSystem } from './init.js';

vi.mock('../../nl/prompt/registry.js', () => ({
  createPromptRegistry: () => ({
    prompts: new Map(),
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    list: vi.fn().mockReturnValue([]),
    listByTag: vi.fn().mockReturnValue([]),
    listByCategory: vi.fn().mockReturnValue([]),
    search: vi.fn().mockReturnValue([]),
    build: vi.fn().mockResolvedValue({ system: '', user: '' }),
    exportAll: vi.fn().mockReturnValue(''),
    importFromYAML: vi.fn(),
    importFromDirectory: vi.fn(),
    evaluate: vi.fn(),
    saveToFile: vi.fn(),
  }),
}));

vi.mock('./llm-dialog-control/index.js', () => ({
  createLLMDialogControlSkill: () => ({
    id: 'llm-dialog',
    name: 'LLM Dialog Control',
    description: 'mock',
    category: 'utility',
    tags: [],
    version: '1.0.0',
    canHandle: async () => true,
    execute: async () => ({ success: true, output: [] }),
    generateJSON: vi.fn(),
    generateYAML: vi.fn(),
    chat: vi.fn(),
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
    getConfig: vi.fn(),
  }),
}));

describe('createSkillSystem', () => {
  it('should create registry and executor', () => {
    const system = createSkillSystem();

    expect(system.registry).toBeDefined();
    expect(system.executor).toBeDefined();
  });

  it('should register all 4 NL skills', () => {
    const system = createSkillSystem();

    expect(system.registry.has('vectahub.intent')).toBe(true);
    expect(system.registry.has('vectahub.command')).toBe(true);
    expect(system.registry.has('vectahub.workflow')).toBe(true);
    expect(system.registry.has('vectahub.pipeline')).toBe(true);
  });

  it('should allow querying registered skills by tag', () => {
    const system = createSkillSystem();

    const intentSkills = system.registry.listByCategory('intent');
    expect(intentSkills.length).toBeGreaterThanOrEqual(1);

    const pipelineSkills = system.registry.listByCategory('pipeline');
    expect(pipelineSkills.length).toBe(1);
  });
});
