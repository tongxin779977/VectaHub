import { SkillRegistry, createSkillRegistry } from './registry.js';
import { createSkillExecutor, SkillExecutor } from './executor.js';
import { createCommandSkill } from './command-skill.js';
import type { SkillExecutorOptions } from './executor.js';
import type { AIModuleRegistry as IAIModuleRegistry, AIModule, AIModuleMetadata } from './ai-modules/types.js';
import type { AIModuleConfig } from '../infrastructure/config/index.js';
import { createSemanticMatchingModule } from './ai-modules/semantic-matching/semantic-matcher.js';
import { createAgentDelegateModule } from './ai-modules/agent-delegate/agent-loop.js';
import { createIntelligentDiagnosisModule } from './ai-modules/intelligent-diagnosis/diagnoser.js';
import { createFeishuCliPlugin } from './ai-modules/cli-plugin/feishu-plugin.js';
import { createOpenCliPlugin } from './ai-modules/cli-plugin/opencli-plugin.js';
import { createGeminiCliPlugin } from './ai-modules/cli-plugin/gemini-plugin.js';

export interface SkillSystem {
  registry: SkillRegistry;
  executor: SkillExecutor;
  moduleRegistry?: IAIModuleRegistry;
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

interface AIModuleRegistration {
  id: string;
  factory: () => AIModule;
}

const builtInModules: AIModuleRegistration[] = [
  { id: 'vectahub.semantic-matching', factory: () => createSemanticMatchingModule() },
  { id: 'vectahub.agent-delegate', factory: () => createAgentDelegateModule() },
  { id: 'vectahub.intelligent-diagnosis', factory: () => createIntelligentDiagnosisModule() },
  { id: 'vectahub.cli.feishu', factory: () => createFeishuCliPlugin() },
  { id: 'vectahub.cli.opencli', factory: () => createOpenCliPlugin() },
  { id: 'vectahub.cli.gemini', factory: () => createGeminiCliPlugin() },
];

export interface RegisterAIModulesOptions {
  aiModules?: Record<string, AIModuleConfig>;
}

export function registerAIModules(
  moduleRegistry: IAIModuleRegistry,
  options?: RegisterAIModulesOptions,
): IAIModuleRegistry {
  const moduleConfig = options?.aiModules ?? {};

  for (const registration of builtInModules) {
    const cfg = moduleConfig[registration.id];

    if (cfg !== undefined && !cfg.enabled) {
      continue;
    }

    try {
      const mod = registration.factory();
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
