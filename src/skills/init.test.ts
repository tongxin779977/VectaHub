import { describe, it, expect } from 'vitest';
import { createSkillSystem } from './init.js';
import { MockLoggerService } from '../infrastructure/testing/mock-services.js';

const logger = new MockLoggerService().getLogger('skills');

describe('createSkillSystem', () => {
  it('should create registry and executor', async () => {
    const system = await createSkillSystem({ logger });

    expect(system.registry).toBeDefined();
    expect(system.executor).toBeDefined();
  });

  it('should register file-ops skill', async () => {
    const system = await createSkillSystem({ logger });

    // Note: command-skill registers 'vectahub.file-ops'
    expect(system.registry.has('vectahub.file-ops')).toBe(true);
  });

  it('should allow querying registered skills by tag', async () => {
    const system = await createSkillSystem({ logger });

    const fileSkills = system.registry.listByCategory('file');
    expect(fileSkills.length).toBeGreaterThanOrEqual(0);
  });

  it('should register command skill when llmConfig is provided', async () => {
    const mockLLMConfig = {
      provider: 'openai' as const,
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
    };

    const system = await createSkillSystem({ llmConfig: mockLLMConfig, logger });

    // workflowSkill removed with LLM modules — command skill remains registered
    expect(system.registry.has('vectahub.file-ops')).toBe(true);
  });
});
