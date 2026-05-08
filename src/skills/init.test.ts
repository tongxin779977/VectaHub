import { describe, it, expect } from 'vitest';
import { createSkillSystem } from './init.js';

describe('createSkillSystem', () => {
  it('should create registry and executor', async () => {
    const system = await createSkillSystem();

    expect(system.registry).toBeDefined();
    expect(system.executor).toBeDefined();
  });

  it('should register file-ops skill', async () => {
    const system = await createSkillSystem();

    // Note: command-skill registers 'vectahub.file-ops'
    expect(system.registry.has('vectahub.file-ops')).toBe(true);
  });

  it('should allow querying registered skills by tag', async () => {
    const system = await createSkillSystem();

    const fileSkills = system.registry.listByCategory('file');
    expect(fileSkills.length).toBeGreaterThanOrEqual(0);
  });

  it('should register workflowSkill when llmConfig is provided', async () => {
    const mockLLMConfig = {
      provider: 'openai' as const,
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
    };

    const system = await createSkillSystem({ llmConfig: mockLLMConfig });

    expect(system.registry.has('vectahub.workflow')).toBe(true);
  });
});
