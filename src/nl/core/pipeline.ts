import type { NLContext, NLResult, NLProcessor } from './types.js';
import type { SkillRegistry } from '../../skills/registry.js';
import type { SkillExecutor } from '../../skills/executor.js';
import type { SkillContext, SkillResult } from '../../skills/types.js';
import { createTaskListFromWorkflow } from '../parser.js';

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export interface NLProcessorOptions {
  confidenceThreshold?: number;
  executor?: SkillExecutor;
}

export function createNLProcessor(
  skillRegistry: SkillRegistry,
  keywordFallback: NLProcessor,
  options?: NLProcessorOptions
): NLProcessor {
  const threshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const executor = options?.executor;

  async function parse(context: NLContext): Promise<NLResult> {
    if (!context.options?.useLLM) {
      const fallbackResult = await keywordFallback.parse(context);
      return {
        ...fallbackResult,
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

    const fallbackResult = await keywordFallback.parse(context);
    return {
      ...fallbackResult,
      metadata: {
        path: 'keyword-fallback',
        usedSkills: [],
        fallbackReason: executor
          ? 'No pipeline skill found or all skills failed'
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
