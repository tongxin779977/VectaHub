import { SkillRegistry, createSkillRegistry } from './registry.js';
import { createSkillExecutor, SkillExecutor } from './executor.js';
import { createLLMDialogControlSkill } from './llm-dialog-control/index.js';
import { createIntentSkill } from './intent-skill.js';
import { createCommandSkill } from './command-skill.js';
import { createWorkflowSkill } from './workflow-skill.js';
import { createPipelineSkill } from './pipeline-skill.js';
import { createPromptRegistry } from '../nl/prompt/registry.js';
import type { SkillExecutorOptions } from './executor.js';

export interface SkillSystem {
  registry: SkillRegistry;
  executor: SkillExecutor;
}

export function createSkillSystem(executorOptions?: SkillExecutorOptions): SkillSystem {
  const registry = createSkillRegistry();
  const executor = createSkillExecutor(executorOptions);

  const promptRegistry = createPromptRegistry();
  const llmDialogSkill = createLLMDialogControlSkill();

  const intentSkill = createIntentSkill(promptRegistry, llmDialogSkill);
  const commandSkill = createCommandSkill(promptRegistry, llmDialogSkill);
  const workflowSkill = createWorkflowSkill(promptRegistry, llmDialogSkill);
  const pipelineSkill = createPipelineSkill(intentSkill, commandSkill, workflowSkill);

  registry.register(intentSkill);
  registry.register(commandSkill);
  registry.register(workflowSkill);
  registry.register(pipelineSkill);

  return { registry, executor };
}
