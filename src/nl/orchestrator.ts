import { createLLMConfig } from './llm.js';
import { createNLProcessor, adaptAllTemplates } from './core/index.js';
import { createKeywordFallback } from './core/keyword-fallback.js';
import { INTENT_TEMPLATES } from './templates/index.js';
import { createSkillSystem } from '../skills/init.js';
import { parseGoal } from './core/goal-parser.js';
import { createCapabilityRouter } from './capabilities/router.js';
import { executionPlanToSteps } from './capabilities/plan-adapter.js';
import { detectProjectContext } from '../project/context-detector.js';
import type { Step } from '../types/index.js';
import type { ExecutionPlan } from './capabilities/types.js';

export interface OrchestrationResult {
  steps: Step[];
  plan?: ExecutionPlan;
  matchedCapability?: string;
  score?: number;
  intentRecognitionMethod: 'capability' | 'llm' | 'keyword' | 'none';
  recognizedIntent?: string;
}

export interface OrchestratorOptions {
  cwd?: string;
}

export async function orchestrateIntent(
  text: string,
  options: OrchestratorOptions = {}
): Promise<OrchestrationResult> {
  const cwd = options.cwd || process.cwd();
  const goal = parseGoal(text);
  const capabilityRouter = createCapabilityRouter();
  const projectContext = detectProjectContext(cwd);
  const routeResult = capabilityRouter.route(goal, projectContext);

  // 1. 尝试新链路 (Capability Router)
  if (routeResult.route === 'auto' && routeResult.plan) {
    return {
      steps: executionPlanToSteps(routeResult.plan),
      plan: routeResult.plan,
      matchedCapability: routeResult.matchedCapability,
      score: routeResult.score,
      intentRecognitionMethod: 'capability',
    };
  }

  // 2. 回退到旧链路 (NL Processor)
  const llmConfig = createLLMConfig();
  const useLLM = !!llmConfig;

  const { registry, executor } = await createSkillSystem({ llmConfig });
  const patterns = adaptAllTemplates(INTENT_TEMPLATES);
  const keywordFallback = createKeywordFallback(patterns);
  const nlProcessor = createNLProcessor(registry, keywordFallback, {
    confidenceThreshold: 0.7,
    executor,
    llmConfig,
  });

  const nlResult = await nlProcessor.parse({
    input: text,
    options: { useLLM },
  });

  const steps: Step[] = [];
  if (nlResult.success && nlResult.taskList && nlResult.taskList.tasks.length > 0) {
    let stepIndex = 1;
    for (const task of nlResult.taskList.tasks) {
      const commands = task.commands.length > 0 ? task.commands : [{ cli: 'echo', args: [] }];
      for (const cmd of commands) {
        steps.push({
          id: `step_${stepIndex}`,
          type: 'exec' as const,
          cli: cmd.cli,
          args: (cmd.args || []).filter((arg): arg is string => arg !== undefined && arg !== ''),
        });
        stepIndex++;
      }
    }

    return {
      steps,
      intentRecognitionMethod: useLLM ? 'llm' : 'keyword',
      recognizedIntent: nlResult.intent || nlResult.taskList.intent,
    };
  }

  return {
    steps: [],
    intentRecognitionMethod: 'none',
  };
}
