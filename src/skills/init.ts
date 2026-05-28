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
import type pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Complete skill system with registry and executor
 * @property registry - The skill registry for managing skills
 * @property executor - The skill executor for running skills
 * @property moduleRegistry - Optional AI module registry for AI-powered skills
 */
export interface SkillSystem {
  registry: SkillRegistry;
  executor: SkillExecutor;
  moduleRegistry?: IAIModuleRegistry;
}

/**
 * Options for creating a SkillSystem
 * @property llmConfig - Optional LLM configuration for AI-powered skills
 * @property logger - Logger instance for system messages
 */
export interface SkillSystemOptions extends Omit<SkillExecutorOptions, 'logger'> {
  llmConfig?: LLMConfig | null;
  logger: pino.Logger;
}

/**
 * Creates a complete SkillSystem with registry and executor
 * Registers core skills and optionally LLM-powered skills
 * @param options - Skill system configuration options
 * @returns Promise resolving to SkillSystem instance
 */
export async function createSkillSystem(options: SkillSystemOptions): Promise<SkillSystem> {
  const registry = createSkillRegistry();
  const logger = options.logger;
  const executor = createSkillExecutor({
    ...options,
    logger,
  });

  const commandSkill = createCommandSkill();
  registry.register(commandSkill);

  if (options.llmConfig) {
    try {
      const promptRegistry = createPromptRegistry();
      const llmDialogSkill = createLLMDialogControlSkill(options.llmConfig, { maxRetries: 3 });

      const loggerWithChild = logger as (pino.Logger & { child?: (bindings: Record<string, unknown>) => pino.Logger }) | undefined;
      const intentLogger = loggerWithChild?.child ? loggerWithChild.child({ module: 'intent-skill' }) : logger;
      const workflowLogger = loggerWithChild?.child ? loggerWithChild.child({ module: 'workflow-skill' }) : logger;
      const intentSkill = createIntentSkill(promptRegistry, llmDialogSkill, intentLogger);
      const workflowSkill = createWorkflowSkill(promptRegistry, llmDialogSkill, workflowLogger);
      const pipelineSkill = createPipelineSkill(intentSkill, workflowSkill);

      registry.register(intentSkill);
      registry.register(workflowSkill);
      registry.register(pipelineSkill);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to register LLM skills');
    }
  }

  return { registry, executor };
}

/**
 * Represents a discovered AI module with its ID and factory function
 * @property id - The module identifier
 * @property factory - Factory function to create the module
 */
interface AIModuleRegistration {
  id: string;
  factory: () => AIModule | Promise<AIModule>;
}

/**
 * Configuration for a known AI module
 * @property relativePath - Relative path to the module file
 * @property id - The module identifier
 * @property factoryName - Name of the factory function to call
 */
interface KnownModuleConfig {
  relativePath: string;
  id: string;
  factoryName: string;
}

/**
 * List of known AI modules with their configurations
 */
const knownModuleConfigs: KnownModuleConfig[] = [
  { relativePath: 'semantic-matching/semantic-matcher.js', id: 'vectahub.semantic-matching', factoryName: 'createSemanticMatchingModule' },
  { relativePath: 'agent-delegate/agent-loop.js', id: 'vectahub.agent-delegate', factoryName: 'createAgentDelegateModule' },
  { relativePath: 'intelligent-diagnosis/diagnoser.js', id: 'vectahub.intelligent-diagnosis', factoryName: 'createIntelligentDiagnosisModule' },
  { relativePath: 'cli-plugin/feishu-plugin.js', id: 'vectahub.cli.feishu', factoryName: 'createFeishuCliPlugin' },
  { relativePath: 'cli-plugin/opencli-plugin.js', id: 'vectahub.cli.opencli', factoryName: 'createOpenCliPlugin' },
  { relativePath: 'cli-plugin/gemini-plugin.js', id: 'vectahub.cli.gemini', factoryName: 'createGeminiCliPlugin' },
];

/**
 * Discover AI modules dynamically from the ai-modules directory
 * @param logger - Optional logger for warnings
 * @returns Promise resolving to array of AIModuleRegistration
 */
async function discoverAIModules(logger?: Pick<pino.Logger, 'warn'>): Promise<AIModuleRegistration[]> {
  const modulesDir = path.join(__dirname, 'ai-modules');
  const registrations: AIModuleRegistration[] = [];

  for (const config of knownModuleConfigs) {
    try {
      const fullPath = path.join(modulesDir, config.relativePath);
      // Skip if file doesn't exist (e.g. in dev vs prod builds)
      const tsPath = fullPath.replace('.js', '.ts');
      if (!fs.existsSync(fullPath) && !fs.existsSync(tsPath)) continue;

      const module = await import(`file://${fullPath}`);
      const factory = module[config.factoryName];

      if (factory) {
        registrations.push({ id: config.id, factory });
      }
    } catch (error) {
      logger?.warn(
        { module: config.relativePath, error: error instanceof Error ? error.message : String(error) },
        'Failed to discover AI module',
      );
    }
  }

  return registrations;
}

/**
 * Options for registering AI modules
 * @property aiModules - Optional map of module configurations
 * @property logger - Optional logger for warnings
 */
export interface RegisterAIModulesOptions {
  aiModules?: Record<string, AIModuleConfig>;
  logger?: Pick<pino.Logger, 'warn'>;
}

/**
 * Registers discovered AI modules into the provided module registry
 * @param moduleRegistry - The AI module registry to register into
 * @param options - Registration options including module configurations and logger
 * @returns Promise resolving to the updated module registry
 */
export async function registerAIModules(
  moduleRegistry: IAIModuleRegistry,
  options?: RegisterAIModulesOptions,
): Promise<IAIModuleRegistry> {
  const moduleConfig = options?.aiModules ?? {};
  const logger = options?.logger;
  const discoveredModules = await discoverAIModules(logger);

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
    } catch (error) {
      logger?.warn(
        { moduleId: registration.id, error: error instanceof Error ? error.message : String(error) },
        'Failed to register AI module, skipping',
      );
    }
  }

  return moduleRegistry;
}
