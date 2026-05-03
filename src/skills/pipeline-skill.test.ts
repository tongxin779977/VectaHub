import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPipelineSkill } from './pipeline-skill.js';
import type { SkillContext, Skill, SkillResult } from './types.js';

function createMockIntentSkill(result: SkillResult = {
  success: true,
  data: { intent: 'EXECUTE_TASK', params: { taskType: 'crawl' }, confidence: 0.9 },
  confidence: 0.9,
}): Skill<string, any> {
  return {
    id: 'intent', name: 'Intent', description: '', category: 'nl', version: '1.0.0', tags: [],
    canHandle: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(result),
  };
}

function createMockCommandSkill(result: SkillResult = {
  success: true,
  data: { commands: [{ cli: 'vecta', args: ['crawl'] }] },
  confidence: 0.9,
}): Skill<any, any> {
  return {
    id: 'command', name: 'Command', description: '', category: 'nl', version: '1.0.0', tags: [],
    canHandle: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(result),
  };
}

function createMockWorkflowSkill(result: SkillResult = {
  success: true,
  data: { workflowYAML: 'id: wf\nsteps:\n  - id: s1\n    type: exec\n    cli: echo\n    args: [hello]' },
  confidence: 0.9,
}): Skill<any, any> {
  return {
    id: 'workflow', name: 'Workflow', description: '', category: 'nl', version: '1.0.0', tags: [],
    canHandle: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(result),
  };
}

describe('PipelineSkill', () => {
  let skill: ReturnType<typeof createPipelineSkill>;
  let intentSkill: Skill<string, any>;
  let commandSkill: Skill<any, any>;
  let workflowSkill: Skill<any, any>;
  let context: SkillContext;

  beforeEach(() => {
    vi.clearAllMocks();
    intentSkill = createMockIntentSkill();
    commandSkill = createMockCommandSkill();
    workflowSkill = createMockWorkflowSkill();
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);
    context = { userInput: 'crawl my website' };
  });

  it('should have correct metadata', () => {
    expect(skill.id).toBe('vectahub.pipeline');
    expect(skill.name).toBe('End-to-End Pipeline');
    expect(skill.tags).toContain('pipeline');
    expect(skill.skills).toHaveLength(3);
  });

  it('should always handle input', async () => {
    expect(await skill.canHandle(context)).toBe(true);
  });

  it('should execute full pipeline: intent → command → workflow', async () => {
    const result = await skill.execute('crawl my website', context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect((result.data as any).workflowYAML).toContain('steps:');
    expect(intentSkill.execute).toHaveBeenCalledWith('crawl my website', context);
    expect(commandSkill.execute).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'EXECUTE_TASK', userInput: 'crawl my website' }),
      context
    );
    expect(workflowSkill.execute).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'EXECUTE_TASK', userInput: 'crawl my website' }),
      context
    );
  });

  it('should fail when intent skill fails', async () => {
    intentSkill = createMockIntentSkill({ success: false, error: 'intent failed', confidence: 0 });
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('intent failed');
    expect(commandSkill.execute).not.toHaveBeenCalled();
    expect(workflowSkill.execute).not.toHaveBeenCalled();
  });

  it('should fail when command skill fails', async () => {
    commandSkill = createMockCommandSkill({ success: false, error: 'cmd failed', confidence: 0 });
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('cmd failed');
    expect(workflowSkill.execute).not.toHaveBeenCalled();
  });

  it('should pass through workflow skill result', async () => {
    const wfResult: SkillResult = {
      success: true,
      data: { workflowYAML: 'custom-yaml' },
      confidence: 0.8,
    };
    workflowSkill = createMockWorkflowSkill(wfResult);
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

    const result = await skill.execute('test', context);

    expect((result.data as any).workflowYAML).toBe('custom-yaml');
    expect(result.confidence).toBe(0.8);
  });

  it('should handle workflow skill returning failure', async () => {
    workflowSkill = createMockWorkflowSkill({ success: false, error: 'wf failed', confidence: 0 });
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('wf failed');
  });

  it('should propagate error when intent skill throws', async () => {
    (intentSkill.execute as any).mockRejectedValue(new Error('crash'));
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

    await expect(skill.execute('test', context)).rejects.toThrow('crash');
  });

  it('should return error when intent result has no data', async () => {
    intentSkill = createMockIntentSkill({ success: true, confidence: 0.3 });
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Intent recognition failed');
  });

  it('should return error when command result has no data', async () => {
    commandSkill = createMockCommandSkill({ success: true, confidence: 0.3 });
    skill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

    const result = await skill.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Command generation failed');
  });
});
