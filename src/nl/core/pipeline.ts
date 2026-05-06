import type { SkillRegistry } from '../../skills/registry.js';
import type { SkillExecutor } from '../../skills/executor.js';
import type { NLProcessor, NLContext, NLResult } from './types.js';
import type { SkillContext } from '../../skills/types.js';
import type { IntentName } from '../../types/index.js';
import YAML from 'yaml';

export interface NLProcessorOptions {
  useLLM?: boolean;
}

interface SkillResult<T = unknown> {
  success: boolean;
  data?: T;
  confidence?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function createNLProcessor(
  skillRegistry: SkillRegistry,
  keywordFallback: NLProcessor,
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
      const keywordResult = await keywordFallback.parse(context);
      return {
        success: keywordResult.success,
        intent: keywordResult.intent as NLResult['intent'],
        confidence: keywordResult.confidence,
        taskList: keywordResult.taskList,
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

    const keywordResult = await keywordFallback.parse(context);
    return {
      success: keywordResult.success,
      intent: keywordResult.intent,
      confidence: keywordResult.confidence,
      taskList: keywordResult.taskList,
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
      if ((result.confidence ?? 0) < threshold) {
        console.debug(`[PIPELINE] Pipeline skill confidence ${result.confidence} below threshold ${threshold}`);
        return null;
      }
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
  const confidence = typeof data?.confidence === 'number' 
    ? data.confidence 
    : (result.confidence ?? 0);

  return {
    success: true,
    intent,
    workflowYAML,
    confidence,
    taskList,
    metadata: {
      path: 'skill-pipeline',
      usedSkills,
    },
  };
}

function createTaskListFromWorkflow(workflowYAML: string, userInput: string): NLResult['taskList'] {
  try {
    let workflow: {
      name?: string;
      description?: string;
      steps?: Array<{
        id?: string;
        type?: string;
        cli?: string;
        args?: string[];
      }>;
    };

    try {
      workflow = YAML.parse(workflowYAML) as typeof workflow;
    } catch {
      const documents = YAML.parseAllDocuments(workflowYAML);
      if (documents.length > 0) {
        workflow = documents[0].toJSON() as typeof workflow;
      } else {
        throw new Error('No documents found');
      }
    }

    const tasks = workflow.steps
      ? workflow.steps
          .filter((step): step is { id: string; type: string; cli: string; args?: string[] } => 
            !!step && typeof step === 'object' && typeof step.type === 'string' && step.type === 'exec' && typeof step.cli === 'string'
          )
          .map((step, index) => ({
            id: step.id || `task_${index + 1}`,
            type: 'QUERY_EXEC' as const,
            description: step.id || `Step ${index + 1}`,
            status: 'PENDING' as const,
            commands: [{
              cli: step.cli,
              args: step.args || [],
            }],
            dependencies: [],
          }))
      : [];

    if (tasks.length === 0) {
      return {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: userInput,
        intent: 'WORKFLOW_GENERATE' as IntentName,
        confidence: 1.0,
        entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
        tasks: [
          {
            id: 'task_1',
            type: 'QUERY_EXEC' as const,
            description: userInput,
            status: 'PENDING' as const,
            commands: [{ cli: 'echo', args: ['Workflow generated from YAML'] }],
            dependencies: [],
          }
        ],
        warnings: [],
      };
    }

    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      originalInput: userInput,
      intent: 'WORKFLOW_GENERATE' as IntentName,
      confidence: 1.0,
      entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
      tasks,
      warnings: [],
    };
  } catch {
    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      originalInput: userInput,
      intent: 'WORKFLOW_GENERATE' as IntentName,
      confidence: 1.0,
      entities: { FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [], BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [], OWNER: [], MODE: [], FILE1: [], FILE2: [] },
      tasks: [
        {
          id: 'task_1',
          type: 'QUERY_EXEC' as const,
          description: userInput,
          status: 'PENDING' as const,
          commands: [{ cli: 'echo', args: ['Workflow generated from YAML'] }],
          dependencies: [],
        }
      ],
      warnings: [],
    };
  }
}