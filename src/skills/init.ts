import { SkillRegistry, createSkillRegistry } from './registry.js';
import { createSkillExecutor, SkillExecutor } from './executor.js';
import { createCommandSkill } from './command-skill.js';
import { createIntentSkill } from './intent-skill.js';
import { createWorkflowSkill } from './workflow-skill.js';
import { createPipelineSkill } from './pipeline-skill.js';
import { createPromptRegistry } from '../nl/prompt/v3.js';
import { createLLMDialogControlSkill } from './llm-dialog-control/index.js';
import type { SkillExecutorOptions } from './executor.js';
import type { AIModuleRegistry as IAIModuleRegistry, AIModule, AIModuleMetadata } from './ai-modules/types.js';
import type { AIModuleConfig } from '../infrastructure/config/index.js';
import type { LLMConfig } from '../nl/llm.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SkillSystem {
  registry: SkillRegistry;
  executor: SkillExecutor;
  moduleRegistry?: IAIModuleRegistry;
}

export interface SkillSystemOptions extends SkillExecutorOptions {
  llmConfig?: LLMConfig | null;
}

export async function createSkillSystem(options?: SkillSystemOptions): Promise<SkillSystem> {
  const registry = createSkillRegistry();
  const executor = createSkillExecutor(options);

  const commandSkill = createCommandSkill();
  registry.register(commandSkill);

  if (options?.llmConfig) {
    try {
      const promptRegistry = createPromptRegistry();
      const llmDialogSkill = createLLMDialogControlSkill(options.llmConfig, { maxRetries: 3 });

      const intentSkill = createIntentSkill(promptRegistry, llmDialogSkill);
      const workflowSkill = createWorkflowSkill(promptRegistry, llmDialogSkill);
      const pipelineSkill = createPipelineSkill(intentSkill, workflowSkill);

      registry.register(intentSkill);
      registry.register(workflowSkill);
      registry.register(pipelineSkill);
    } catch (error) {
      console.error('Failed to register LLM skills:', error instanceof Error ? error.message : String(error));
    }
  }

  return { registry, executor };
}

interface AIModuleRegistration {
  id: string;
  factory: () => AIModule | Promise<AIModule>;
}

/**
 * Discover AI modules dynamically from the ai-modules directory.
 */
async function discoverAIModules(): Promise<AIModuleRegistration[]> {
  const modulesDir = path.join(__dirname, 'ai-modules');
  const registrations: AIModuleRegistration[] = [];

  // Define a map for known modules to maintain existing IDs if they don't self-identify
  // In a full implementation, modules would export their own metadata/ID
  const knownModules: Record<string, string> = {
    'semantic-matching/semantic-matcher.js': 'vectahub.semantic-matching',
    'agent-delegate/agent-loop.js': 'vectahub.agent-delegate',
    'intelligent-diagnosis/diagnoser.js': 'vectahub.intelligent-diagnosis',
    'cli-plugin/feishu-plugin.js': 'vectahub.cli.feishu',
    'cli-plugin/opencli-plugin.js': 'vectahub.cli.opencli',
    'cli-plugin/gemini-plugin.js': 'vectahub.cli.gemini',
  };

  for (const [relPath, id] of Object.entries(knownModules)) {
    try {
      const fullPath = path.join(modulesDir, relPath);
      // Skip if file doesn't exist (e.g. in dev vs prod builds)
      const tsPath = fullPath.replace('.js', '.ts');
      if (!fs.existsSync(fullPath) && !fs.existsSync(tsPath)) continue;

      const module = await import(`file://${fullPath}`);
      const factory = module.createSemanticMatchingModule || 
                      module.createAgentDelegateModule || 
                      module.createIntelligentDiagnosisModule ||
                      module.createFeishuCliPlugin ||
                      module.createOpenCliPlugin ||
                      module.createGeminiCliPlugin;

      if (factory) {
        registrations.push({ id, factory });
      }
    } catch {
      // console.debug(`Failed to load module ${relPath}:`, err);
    }
  }

  return registrations;
}

export interface RegisterAIModulesOptions {
  aiModules?: Record<string, AIModuleConfig>;
}

export async function registerAIModules(
  moduleRegistry: IAIModuleRegistry,
  options?: RegisterAIModulesOptions,
): Promise<IAIModuleRegistry> {
  const moduleConfig = options?.aiModules ?? {};
  const discoveredModules = await discoverAIModules();

  for (const registration of discoveredModules) {
    const cfg = moduleConfig[registration.id];

    if (cfg !== undefined && !cfg.enabled) {
      continue;
    }

    try {
      const mod = await registration.factory();
      const meta: AIModuleMetadata = {
        enabled: cfg?.enabled ?? true,
        config: cfg?.config,
      };
      moduleRegistry.register(mod, meta);
    } catch {
      // Module dependency not available — skip silently
    }
  }

  return moduleRegistry;
}
