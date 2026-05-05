import type { NLContext, NLResult, NLProcessor } from './types.js';
import type { IntentName, TaskList } from '../../types/index.js';
import type { SkillRegistry } from '../../skills/registry.js';
import type { SkillExecutor } from '../../skills/executor.js';
import type { SkillContext, SkillResult } from '../../skills/types.js';
import type { Coordinator } from './coordinator.js';
import { createTaskFromIntent } from '../command-synthesizer.js';
import { getAllIntentNames } from '../templates/index.js';

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export interface NLProcessorOptions {
  confidenceThreshold?: number;
  executor?: SkillExecutor;
  coordinator?: Coordinator;
  useNewMatcher?: boolean;
}

export function createNLProcessor(
  skillRegistry: SkillRegistry,
  keywordFallback: NLProcessor,
  options?: NLProcessorOptions
): NLProcessor {
  const threshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const executor = options?.executor;
  const coordinator = options?.coordinator;
  const useNewMatcher = options?.useNewMatcher ?? true;

  async function parse(context: NLContext): Promise<NLResult> {
    if (useNewMatcher && coordinator) {
      return parseWithCoordinator(context, coordinator);
    }

    const keywordResult = await keywordFallback.parse(context);
    if (keywordResult.confidence >= threshold) {
      return {
        ...keywordResult,
        metadata: {
          path: 'keyword-match',
          usedSkills: [],
        },
      };
    }

    // Step 2: Keyword confidence too low, try LLM if configured
    if (!context.options?.useLLM) {
      return {
        ...keywordResult,
        metadata: {
          path: 'keyword-fallback',
          usedSkills: [],
          fallbackReason: 'LLM disabled',
        },
      };
    }

    const skillContext: SkillContext = {
      userInput: context.input,
      sessionId: context.sessionId,
    };

    if (executor) {
      const pipelineResult = await executePipelineSkill(
        skillRegistry, executor, context, skillContext, threshold
      );
      if (pipelineResult) return pipelineResult;

      const individualResult = await executeIndividualSkills(
        skillRegistry, executor, context, skillContext, threshold
      );
      if (individualResult) return individualResult;
    }

    // Step 3: LLM failed, return cached keyword result
    return {
      ...keywordResult,
      metadata: {
        path: 'keyword-fallback',
        usedSkills: [],
        fallbackReason: executor
          ? 'LLM failed, keyword confidence below threshold'
          : 'No executor configured',
      },
    };
  }

  return { parse };
}

async function executePipelineSkill(
  registry: SkillRegistry,
  executor: SkillExecutor,
  context: NLContext,
  skillContext: SkillContext,
  threshold: number
): Promise<NLResult | null> {
  const pipelineSkill = registry.get('vectahub.pipeline');
  if (!pipelineSkill) return null;

  try {
    const result = await executor.execute(
      pipelineSkill,
      context.input,
      skillContext
    );

    if (result.success && result.confidence >= threshold && result.data) {
      return buildSkillResult(result, [pipelineSkill.id], context.input);
    }
  } catch {
    // fall through
  }

  return null;
}

async function executeIndividualSkills(
  registry: SkillRegistry,
  executor: SkillExecutor,
  context: NLContext,
  skillContext: SkillContext,
  threshold: number
): Promise<NLResult | null> {
  const applicable = await registry.findApplicableSkills(skillContext);
  if (applicable.length === 0) return null;

  const usedSkills: string[] = [];
  let currentInput: unknown = context.input;
  let lastIntent: string | undefined;
  let lastConfidence = 0;

  for (const skill of applicable) {
    usedSkills.push(skill.id);

    const inputContext: SkillContext = {
      userInput: typeof currentInput === 'string' ? currentInput : context.input,
      sessionId: context.sessionId,
    };

    const result = await executor.execute(skill, currentInput as never, inputContext);

    if (!result.success) break;
    if (result.confidence < threshold) break;

    lastConfidence = result.confidence;

    if (result.data && typeof result.data === 'object') {
      const data = result.data as Record<string, unknown>;

      if ('intent' in data) {
        lastIntent = data.intent as string;
      }
      if ('commands' in data) {
        currentInput = data.commands;
      }
      if ('workflowYAML' in data) {
        return buildSkillResult(
          { success: true, data: result.data, confidence: result.confidence },
          usedSkills,
          context.input
        );
      }
    }
  }

  if (lastIntent) {
    return {
      success: true,
      intent: lastIntent as NLResult['intent'],
      confidence: lastConfidence,
      metadata: {
        path: 'skill-pipeline',
        usedSkills,
      },
    };
  }

  return null;
}

function buildSkillResult(
  result: SkillResult<unknown>,
  usedSkills: string[],
  userInput: string
): NLResult {
  const data = result.data as Record<string, unknown> | undefined;

  let taskList: NLResult['taskList'];
  if (data?.workflowYAML && typeof data.workflowYAML === 'string') {
    taskList = createTaskListFromWorkflow(data.workflowYAML, userInput);
  }

  const intent = data?.intent as NLResult['intent'];

  return {
    success: true,
    intent,
    confidence: result.confidence,
    taskList,
    metadata: {
      path: 'skill-pipeline',
      usedSkills,
    },
  };
}

function parseWithCoordinator(context: NLContext, coordinator: Coordinator): NLResult {
  const input = typeof context.input === 'string' ? context.input : '';
  const result = coordinator.match(input);

  if (result.intents.length === 0 || result.intents[0].intent === 'UNKNOWN') {
    return {
      success: false,
      intent: 'UNKNOWN',
      confidence: 0,
      metadata: { path: 'coordinator' },
    };
  }

  const primary = result.intents[0];
  return {
    success: true,
    intent: primary.intent as NLResult['intent'],
    confidence: primary.confidence,
    metadata: {
      path: result.isMultiIntent ? 'coordinator-multi' : 'coordinator',
      multiIntent: result.isMultiIntent ? result : undefined,
    },
  };
}

function createTaskListFromWorkflow(workflowYAML: string, userInput: string): TaskList {
  const allIntentNames = getAllIntentNames();
  let detectedIntent: IntentName = 'QUERY_INFO';
  for (const intentName of allIntentNames) {
    if (workflowYAML.includes(intentName)) {
      detectedIntent = intentName as IntentName;
      break;
    }
  }

  const groupedEntities: any = {
    FILE_PATH: [],
    CLI_TOOL: [],
    PACKAGE_NAME: [],
    FUNCTION_NAME: [],
    BRANCH_NAME: [],
    ENV: [],
    OPTIONS: [],
  };

  const task = createTaskFromIntent(detectedIntent, groupedEntities, userInput);

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    originalInput: userInput,
    intent: detectedIntent,
    confidence: 0.8,
    entities: groupedEntities,
    tasks: [task],
    warnings: [],
  };
}
