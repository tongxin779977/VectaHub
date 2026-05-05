import { SkillRegistry, createSkillRegistry } from './registry.js';
import { createSkillExecutor, SkillExecutor } from './executor.js';
import { createCommandSkill } from './command-skill.js';
import type { SkillExecutorOptions } from './executor.js';

export interface SkillSystem {
  registry: SkillRegistry;
  executor: SkillExecutor;
}

export interface SkillSystemOptions extends SkillExecutorOptions {
}

export function createSkillSystem(options?: SkillSystemOptions): SkillSystem {
  const registry = createSkillRegistry();
  const executor = createSkillExecutor(options);

  const commandSkill = createCommandSkill();
  registry.register(commandSkill);

  return { registry, executor };
}
