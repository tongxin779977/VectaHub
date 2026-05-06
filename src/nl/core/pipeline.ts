import type { SkillRegistry } from '../../skills/types.js';
import type { SkillExecutor } from '../../skills/executor.js';
import type { NLProcessor, NLContext, NLResult } from './types.js';
import type { SkillContext } from '../../skills/types.js';
import type { Coordinator, KeywordMatcher } from '../matcher/index.js';

interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  confidence?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function createNLProcessor(
  skillRegistry: SkillRegistry,
  keywordFallback: KeywordMatcher,
  deps: {
    executor?: SkillExecutor;
    confidenceThreshold?: number;
  } = {}
): NLProcessor {
  const executor = deps.executor;
  const threshold = deps.confidenceThreshold ?? 0.7;

  async function parse(context: NLContext): Promise<NLResult> {
    const input = typeof context.input === 'string' ? context.input : '';
    console.log(`[PIPELINE DEBUG] parse called with input: "${input}"`);
    console.log(`[PIPELINE DEBUG] useLLM: ${context.options?.useLLM}`);

    if (!context.options?.useLLM) {
      const keywordResult = keywordFallback.match(input);
      return {
        success: keywordResult.matched,
        intent: keywordResult.intent as NLResult['intent'],
        confidence: keywordResult.confidence,
        taskList: keywordResult.tasks ? { intent: keywordResult.intent as string, tasks: keywordResult.tasks } : undefined,
        metadata: {
          path: 'keyword-only',
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

    const keywordResult = keywordFallback.match(input);
    return {
      ...keywordResult,
      metadata: {
        path: 'keyword-fallback',
        usedSkills: [],
        fallbackReason: executor
          ? 'LLM failed, keyword confidence below threshold'
          : 'No executor available',
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
  console.log(`[PIPELINE DEBUG] pipelineSkill found: ${!!pipelineSkill}`);
  if (!pipelineSkill) return null;

  try {
    console.log(`[PIPELINE DEBUG] Executing pipeline skill with input: "${context.input}"`);
    const result = await executor.execute(
      pipelineSkill,
      context.input,
      skillContext
    );
    console.log(`[PIPELINE DEBUG] Pipeline skill result:`, JSON.stringify(result));

    if (result.success && result.data) {
      return buildSkillResult(result, [pipelineSkill.id], context.input);
    }
  } catch (err) {
    console.error(`[PIPELINE DEBUG] Pipeline skill error:`, err instanceof Error ? err.message : String(err));
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
  const intentSkill = registry.get('vectahub.intent');
  const workflowSkill = registry.get('vectahub.workflow');

  if (!intentSkill || !workflowSkill) return null;

  const usedSkills: string[] = [];
  let lastIntent: string | undefined;
  let lastConfidence = 0;
  let intentResult: Record<string, unknown> | undefined;

  usedSkills.push(intentSkill.id);
  const intentInputContext: SkillContext = {
    userInput: context.input,
    sessionId: context.sessionId,
  };

  const intentResultData = await executor.execute(intentSkill, context.input, intentInputContext);

  if (!intentResultData.success) {
    console.debug('[PIPELINE] Intent skill failed, falling back');
    return null;
  }

  lastConfidence = intentResultData.confidence;
  
  if (intentResultData.data && typeof intentResultData.data === 'object') {
    intentResult = intentResultData.data as Record<string, unknown>;
    lastIntent = intentResult.intent as string;
  }

  if (lastConfidence < threshold) {
    console.debug(`[PIPELINE] Intent confidence ${lastConfidence} below threshold ${threshold}`);
    return null;
  }

  usedSkills.push(workflowSkill.id);
  const workflowInputContext: SkillContext = {
    userInput: context.input,
    sessionId: context.sessionId,
  };

  const workflowInput = {
    intent: lastIntent || 'WORKFLOW_GENERATE',
    params: intentResult?.params || {},
    commands: [],
    userInput: context.input,
  };

  const workflowResult = await executor.execute(workflowSkill, workflowInput, workflowInputContext);

  if (!workflowResult.success) {
    console.debug('[PIPELINE] Workflow skill failed');
    return {
      success: true,
      intent: lastIntent as NLResult['intent'],
      confidence: lastConfidence,
      metadata: {
        path: 'skill-individual',
        usedSkills,
      },
    };
  }

  if (workflowResult.data && typeof workflowResult.data === 'object') {
    const data = workflowResult.data as Record<string, unknown>;
    if ('workflowYAML' in data) {
      return buildSkillResult(
        { success: true, data: workflowResult.data, confidence: workflowResult.confidence },
        usedSkills,
        context.input
      );
    }
  }

  return {
    success: true,
    intent: lastIntent as NLResult['intent'],
    confidence: lastConfidence,
    metadata: {
      path: 'skill-individual',
      usedSkills,
    },
  };
}

function buildSkillResult(
  result: SkillResult<unknown>,
  usedSkills: string[],
  userInput: string
): NLResult {
  const data = result.data as Record<string, unknown> | undefined;

  let workflowYAML: string | undefined;
  let taskList: NLResult['taskList'];
  if (data?.workflowYAML && typeof data.workflowYAML === 'string') {
    workflowYAML = data.workflowYAML;
    taskList = createTaskListFromWorkflow(data.workflowYAML, userInput);
  }

  const intent = data?.intent as NLResult['intent'];

  return {
    success: true,
    intent,
    workflowYAML,
    confidence: result.confidence,
    taskList,
    metadata: {
      path: 'skill-pipeline',
      usedSkills,
    },
  };
}

function createTaskListFromWorkflow(workflowYAML: string, userInput: string): NLResult['taskList'] {
  return {
    intent: 'WORKFLOW_GENERATE',
    tasks: [
      {
        description: userInput,
        commands: [
          {
            cli: 'echo',
            args: ['Workflow generated from YAML']
          }
        ]
      }
    ]
  };
}

function parseWithCoordinator(context: NLContext, coordinator: Coordinator): NLResult {
  const input = typeof context.input === 'string' ? context.input : '';
  const result = coordinator.match(input);

  if (!result.matched) {
    return {
      success: false,
      intent: 'UNKNOWN',
      confidence: 0,
      metadata: {
        path: 'no-match',
        usedSkills: [],
      },
    };
  }

  return {
    success: true,
    intent: result.intent as NLResult['intent'],
    confidence: result.confidence,
    taskList: result.tasks ? { intent: result.intent as string, tasks: result.tasks } : undefined,
    metadata: {
      path: 'coordinator',
      usedSkills: ['coordinator'],
    },
  };
}