import type { SkillRegistry } from '../../skills/registry.js';
import type { SkillExecutor } from '../../skills/executor.js';
import type { NLProcessor, NLContext, NLResult } from './types.js';
import type { SkillContext } from '../../skills/types.js';
import type { IntentName } from '../../types/index.js';
import YAML from 'yaml';
import { createConsoleLogger } from '../../utils/logger.js';
import { LLMClient, createLLMConfig } from '../llm.js';
import { buildToolsFromTemplates, convertToolCallToSteps } from '../tool-calling.js';

const logger = createConsoleLogger('nl-pipeline');

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
    llmConfig?: ReturnType<typeof createLLMConfig>;
  } = {}
): NLProcessor {
  const executor = deps.executor;
  const threshold = deps.confidenceThreshold ?? 0.7;
  const llmConfig = deps.llmConfig;

  async function parse(context: NLContext): Promise<NLResult> {
    const input = typeof context.input === 'string' ? context.input : '';

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

    // 1. Try LLM Tool Calling
    if (llmConfig) {
      try {
        const llmResult = await executeLLMToolCalling(input, llmConfig);
        if (llmResult) return llmResult;
      } catch (err) {
        logger.debug(`LLM Tool Calling failed: ${err}`);
      }
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

async function executeLLMToolCalling(
  input: string,
  llmConfig: ReturnType<typeof createLLMConfig>
): Promise<NLResult | null> {
  if (!llmConfig) return null;
  const llmClient = new LLMClient(llmConfig);
  const tools = buildToolsFromTemplates();
  
  const llmResponse = await llmClient.complete('nl-processor-tool-calling', input, {}, { tools, toolChoice: 'auto' });
  
  if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
    const toolCall = llmResponse.tool_calls[0];
    const parsed = convertToolCallToSteps(toolCall);
    
    if (parsed) {
      const workflowSteps = parsed.steps.map(s => ({
        ...s,
        type: s.type || 'exec',
        cli: s.cli || 'echo',
        args: s.args || [],
      }));

      const workflowYAML = YAML.stringify({ steps: workflowSteps });
      return {
        success: true,
        intent: parsed.intent as IntentName,
        confidence: llmResponse.confidence || 1.0,
        workflowYAML,
        params: parsed.params,
        metadata: {
          path: 'llm-tool-calling',
          usedSkills: [],
        },
        taskList: createTaskListFromWorkflow(workflowYAML, input),
      };
    }
  } else if (llmResponse.intent !== 'UNKNOWN') {
    // If LLM recognized intent but no tool call, we might want to return it but keep fallback open.
    // For now, let's treat it as a result if it has a workflow
    if (llmResponse.workflow?.steps) {
       const steps = llmResponse.workflow.steps as any[];
       const workflowYAML = YAML.stringify({ steps });
       return {
         success: true,
         intent: llmResponse.intent as IntentName,
         confidence: llmResponse.confidence || 0.8,
         workflowYAML,
         metadata: {
           path: 'llm-tool-calling',
           usedSkills: [],
         },
         taskList: createTaskListFromWorkflow(workflowYAML, input),
       };
    }
  }

  return null;
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

    if (result.success && result.data) {
      if ((result.confidence ?? 0) < threshold) {
        return null;
      }
      return buildSkillResult(result, [pipelineSkill.id], context.input);
    }
  } catch {
    // ignore
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
    logger.debug('Intent skill failed, falling back');
    return null;
  }

  lastConfidence = intentResultData.confidence;
  
  if (intentResultData.data && typeof intentResultData.data === 'object') {
    intentResult = intentResultData.data as Record<string, unknown>;
    lastIntent = intentResult.intent as string;
  }

  if (lastConfidence < threshold) {
    logger.debug(`Intent confidence ${lastConfidence} below threshold ${threshold}`);
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
    logger.debug('Workflow skill failed');
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
        name?: string;
        type?: string;
        cli?: string;
        exec?: string;
        command?: string;
        args?: string[];
      }>;
    };

    try {
      const documents = YAML.parseAllDocuments(workflowYAML);
      if (documents.length > 0) {
        workflow = documents[0].toJSON() as typeof workflow;
      } else {
        workflow = YAML.parse(workflowYAML) as typeof workflow;
      }
    } catch {
      workflow = YAML.parse(workflowYAML) as typeof workflow;
    }

    const tasks = workflow.steps
      ? workflow.steps
          .map((step, index) => {
            const commandText = step.cli ?? step.exec ?? step.command;
            if (!commandText) return null;

            const [cli, ...splitArgs] = commandText.split(/\s+/).filter(Boolean);
            const args = step.args ?? splitArgs;

            return {
              id: step.id || `task_${index + 1}`,
              type: 'QUERY_EXEC' as const,
              description: step.id || step.name || `Step ${index + 1}`,
              status: 'PENDING' as const,
              commands: [{
                cli,
                args,
              }],
              dependencies: [],
            };
          })
          .filter((task): task is NonNullable<typeof task> => task !== null)
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
