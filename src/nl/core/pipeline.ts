import type { NLProcessor, NLContext, NLResult } from './types.js';
import type { IntentName } from '../../types/index.js';
import type { ILLMClient } from '../interfaces.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';
import pino from 'pino';
import YAML from 'yaml';
import { splitPosixArgs } from '../../utils/shell.js';
import { LLMClient, createLLMConfig } from '../llm.js';
import { buildAllTools, convertToolCallToSteps } from '../tool-calling.js';
import { createSemanticDetector } from '../../sandbox/semantic-detector.js';

export interface NLProcessorOptions {
  useLLM?: boolean;
}

/**
 * NL 处理器依赖注入接口
 * 用于支持自定义替换各个组件，提高可测试性
 */
export interface NLProcessorDeps {
  llmConfig?: ReturnType<typeof createLLMConfig> | null;
  semanticDetector?: ReturnType<typeof createSemanticDetector>;
  llmClient?: ILLMClient;
  auditHelper?: AuditHelper;
  logger?: pino.Logger;
}

export function createNLProcessor(deps: NLProcessorDeps = {}): NLProcessor {
  const llmConfig = deps.llmConfig ?? null;
  const semanticDetector = deps.semanticDetector ?? createSemanticDetector();
  const logger = deps.logger ?? pino({ name: 'nl-pipeline' });

  if (!llmConfig) {
    throw new Error('LLM configuration is required. Keyword fallback has been removed.');
  }

  const resolvedLLMConfig = llmConfig;
  const llmClient: ILLMClient = deps.llmClient ?? new LLMClient(resolvedLLMConfig, { auditHelper: deps.auditHelper });

  async function parse(context: NLContext): Promise<NLResult> {
    const input = typeof context.input === 'string' ? context.input.trim() : '';

    if (!input) {
      throw new Error('Empty input: NL pipeline requires a non-empty string input');
    }
    const injectionResult = semanticDetector.detectInjection(input);
    if (injectionResult.detected) {
      throw new Error(`Semantic Guardrails: ${injectionResult.reason}`);
    }

    try {
      return await executeLLMToolCalling(input, llmClient);
    } catch (err) {
      logger.error(`LLM Tool Calling failed: ${err}`);
      throw err;
    }
  }

  return { parse };
}

async function executeLLMToolCalling(
  input: string,
  llmClient: ILLMClient
): Promise<NLResult> {
  const tools = buildAllTools();
  
  const llmResponse = await llmClient.complete('nl-processor-tool-calling', input, {}, { tools, toolChoice: 'auto' });
  
  if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
    const toolCall = llmResponse.tool_calls[0];
    const parsed = convertToolCallToSteps(toolCall);
    
    // 校验每个 step 至少具备最小可执行字段，不允许静默补默认值
    for (let i = 0; i < parsed.steps.length; i++) {
      validateWorkflowStep(parsed.steps[i], `steps[${i}]`);
    }
    const workflowSteps = parsed.steps;

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

  if (llmResponse.intent !== 'UNKNOWN') {
    const steps = llmResponse.workflow?.steps || [];
    if (steps.length > 0) {
      // 校验 LLM 直接返回的 workflow steps，包括嵌套 body
      for (let i = 0; i < steps.length; i++) {
        validateWorkflowStep(steps[i] as unknown as MinimalStep, `steps[${i}]`);
      }
      const workflowYAML = YAML.stringify({ steps });
      return {
        success: true,
        intent: llmResponse.intent as IntentName,
        confidence: llmResponse.confidence || 0.8,
        workflowYAML,
        reply: llmResponse.reply,
        metadata: {
          path: 'llm-tool-calling',
          usedSkills: [],
        },
        taskList: createTaskListFromWorkflow(workflowYAML, input),
      };
    } else if (llmResponse.reply) {
      return {
        success: true,
        intent: llmResponse.intent as IntentName,
        confidence: llmResponse.confidence || 0.8,
        reply: llmResponse.reply,
        metadata: {
          path: 'dialog',
        },
      };
    } else if (llmResponse.workflow) {
      throw new Error('Workflow must contain at least one step');
    }
  }

  if (llmResponse.reply) {
    return {
      success: true,
      intent: llmResponse.intent as IntentName,
      confidence: llmResponse.confidence || 0.8,
      reply: llmResponse.reply,
      metadata: {
        path: 'dialog',
      },
    };
  }

  throw new Error('LLM failed to generate a result: no tool calls, workflow or reply produced');
}




/** 最小 step 合同：只要有 type 可选、cli 可选、body 可选即可递归校验 */
interface MinimalStep {
  type?: string;
  cli?: string;
  body?: MinimalStep[];
}

function validateWorkflowStep(step: MinimalStep, path: string): void {
  if (!step.type) {
    throw new Error(`LLM step missing required field "type" at ${path}: ${JSON.stringify(step)}`);
  }
  if (step.type === 'exec' && !step.cli) {
    throw new Error(`LLM exec step missing required field "cli" at ${path}: ${JSON.stringify(step)}`);
  }
  // 递归校验嵌套 body
  if (Array.isArray(step.body)) {
    for (let i = 0; i < step.body.length; i++) {
      validateWorkflowStep(step.body[i], `${path}.body[${i}]`);
    }
  }
}

function createTaskListFromWorkflow(workflowYAML: string, userInput: string): NLResult['taskList'] {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error) {
      throw new Error(`Invalid workflow YAML: ${message}`, { cause: error });
    }
    throw error;
  }

  if (!workflow || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    throw new Error('Workflow must contain at least one step');
  }

  const tasks = workflow.steps
    .map((step, index) => {
      const commandText = step.cli ?? step.exec ?? step.command;
      if (!commandText) return null;

      const [cli, ...splitArgs] = splitPosixArgs(commandText);
      if (!cli) return null;
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
    .filter((task): task is NonNullable<typeof task> => task !== null);

  if (tasks.length === 0) {
    throw new Error('Workflow contains no executable command steps');
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
}
