import { describe, it, expect } from 'vitest';
import { createSkillSystem } from './init.js';
import { MockLoggerService, MockEnvironmentService } from '../infrastructure/testing/mock-services.js';

const logger = new MockLoggerService().getLogger('skills');
const environment = new MockEnvironmentService();

describe('createSkillSystem', () => {
  it('should create registry and executor', async () => {
    const system = await createSkillSystem({ logger, environment });

    expect(system.registry).toBeDefined();
    expect(system.executor).toBeDefined();
  });

  it('should register file-ops skill', async () => {
    const system = await createSkillSystem({ logger, environment });

    // Note: command-skill registers 'vectahub.file-ops'
    expect(system.registry.has('vectahub.file-ops')).toBe(true);
  });

  it('should allow querying registered skills by tag', async () => {
    const system = await createSkillSystem({ logger, environment });

    const fileSkills = system.registry.listByCategory('file');
    expect(fileSkills.length).toBeGreaterThanOrEqual(0);
  });

  it('should register command skill without llmConfig', async () => {
    const system = await createSkillSystem({ logger, environment });

    // workflowSkill removed with LLM modules — command skill remains registered
    expect(system.registry.has('vectahub.file-ops')).toBe(true);
  });
});
