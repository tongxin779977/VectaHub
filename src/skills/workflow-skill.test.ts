import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWorkflowSkill } from './workflow-skill.js';
import type { SkillContext } from './types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';
import type { WorkflowSkillInput } from './workflow-skill.js';

function createMockLLM(yamlOutput = 'id: wf\name: Test Workflow\nsteps:\n  - id: s1\n    type: exec\n    cli: echo\n    args: [hello]') {
  return {
    id: 'llm-dialog',
    name: 'LLM Dialog Control',
    description: 'mock',
    category: 'utility',
    tags: [],
    version: '1.0.0',
    canHandle: async () => true,
    execute: async () => ({ success: true, output: [] }),
    generateYAML: vi.fn().mockResolvedValue({
      success: true,
      output: yamlOutput,
      rawResponse: yamlOutput,
      attemptCount: 1,
      duration: 100,
    }),
    generateJSON: vi.fn(),
    chat: vi.fn(),
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
    getConfig: vi.fn(),
  } as unknown as LLMDialogControlSkill;
}

function createMockRegistry(hasTemplate = false) {
  return {
    build: vi.fn().mockResolvedValue({ system: 'sys', user: 'usr' }),
    get: vi.fn().mockReturnValue(hasTemplate ? {
      template: 'id: existing\nsteps:\n  - id: e1\n    type: exec\n    cli: echo\n    args: [from-template]',
    } : undefined),
    has: vi.fn().mockReturnValue(hasTemplate),
    prompts: new Map(),
    register: vi.fn(),
    unregister: vi.fn(),
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

describe('WorkflowSkill', () => {
  let skill: ReturnType<typeof createWorkflowSkill>;
  let mockLLM: ReturnType<typeof createMockLLM>;
  let mockRegistry: ReturnType<typeof createMockRegistry>;
  let context: SkillContext;
  let validInput: WorkflowSkillInput;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = createMockLLM();
    mockRegistry = createMockRegistry();
    skill = createWorkflowSkill(mockLLM as any, mockRegistry as any);
    context = { userInput: 'crawl example.com then index it' };
    validInput = {
      intent: 'EXECUTE_TASK',
      params: { taskType: 'crawl' },
      commands: [{ cli: 'vecta', args: ['crawl', '${url}'] }],
      userInput: 'crawl example.com then index it',
    };
  });

  it('should have correct metadata', () => {
    expect(skill.id).toBe('vectahub.workflow');
    expect(skill.name).toBe('Workflow Generation');
    expect(skill.tags).toContain('workflow');
  });

  it('should handle any context', async () => {
    expect(await skill.canHandle(context)).toBe(true);
  });

  it('should use existing template when available', async () => {
    mockRegistry = createMockRegistry(true);
    skill = createWorkflowSkill(mockLLM as any, mockRegistry as any);

    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.data!.workflowYAML).toBeDefined();
    expect(result.data!.workflowYAML.length).toBeGreaterThan(0);
  });

  it('should generate workflow from LLM when no template', async () => {
    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.data!.workflowYAML).toBeDefined();
  });

  it('should fallback on LLM error', async () => {
    (mockLLM.generateYAML as any).mockResolvedValue({
      success: false, output: '', rawResponse: '', attemptCount: 1, duration: 100, error: 'LLM fail',
    });

    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.data!.workflowYAML).toContain('steps:');
  });

  it('should fallback when promptRegistry.build fails', async () => {
    (mockRegistry.build as any).mockRejectedValue(new Error('no template'));

    const result = await skill.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.data!.workflowYAML).toContain('steps:');
  });

  it('should use INTENT_TEMPLATES for known intents', async () => {
    const input: WorkflowSkillInput = {
      intent: 'GIT_WORKFLOW',
      params: {},
      commands: [],
      userInput: 'git workflow',
    };

    const result = await skill.execute(input, context);

    expect(result.success).toBe(true);
    expect(result.data!.workflowYAML).toContain('steps:');
  });
});
