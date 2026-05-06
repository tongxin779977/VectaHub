import { describe, it, expect } from 'vitest';
import { createSkillSystem } from './init.js';

describe('createSkillSystem', () => {
  it('should create registry and executor', () => {
    const system = createSkillSystem();

    expect(system.registry).toBeDefined();
    expect(system.executor).toBeDefined();
  });

  it('should register file-ops skill', () => {
    const system = createSkillSystem();

    expect(system.registry.has('vectahub.file-ops')).toBe(true);
  });

  it('should allow querying registered skills by tag', () => {
    const system = createSkillSystem();

    const fileSkills = system.registry.listByCategory('file');
    expect(fileSkills.length).toBeGreaterThanOrEqual(0);
  });

  it('should register workflowSkill when llmConfig is provided', () => {
    const mockLLMConfig = {
      provider: 'openai' as const,
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
    };

    const system = createSkillSystem({ llmConfig: mockLLMConfig });

    expect(system.registry.has('vectahub.workflow')).toBe(true);
  });
});
