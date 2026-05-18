import type { NLProcessor, NLContext, NLResult } from './types.js';
import type { IntentName } from '../../types/index.js';
import YAML from 'yaml';
import { getLogger } from '../../utils/logger.js';
import { splitPosixArgs } from '../../utils/shell.js';
import { LLMClient, createLLMConfig, type LLMConfig } from '../llm.js';
import { buildAllTools, convertToolCallToSteps } from '../tool-calling.js';
import { createSemanticDetector } from '../../sandbox/semantic-detector.js';

const logger = getLogger('nl-pipeline');

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
  deps: {
    llmConfig?: ReturnType<typeof createLLMConfig> | null;
  } = {}
): NLProcessor {
  const llmConfig = deps.llmConfig ?? null;

  if (!llmConfig) {
    throw new Error('LLM configuration is required. Keyword fallback has been removed.');
  }

  const resolvedLLMConfig = llmConfig;

  async function parse(context: NLContext): Promise<NLResult> {
    const input = typeof context.input === 'string' ? context.input.trim() : '';

    if (!input) {
      throw new Error('Empty input: NL pipeline requires a non-empty string input');
    }

    const semanticDetector = createSemanticDetector();
    const injectionResult = semanticDetector.detectInjection(input);
    if (injectionResult.detected) {
      throw new Error(`Semantic Guardrails: ${injectionResult.reason}`);
    }

    try {
      return await executeLLMToolCalling(input, resolvedLLMConfig);
    } catch (err) {
      logger.error(`LLM Tool Calling failed: ${err}`);
      throw err;
    }
  }

  return { parse };
}

async function executeLLMToolCalling(
  input: string,
  llmConfig: LLMConfig
): Promise<NLResult> {
  const llmClient = new LLMClient(llmConfig);
  const tools = buildAllTools();
  
  const llmResponse = await llmClient.complete('nl-processor-tool-calling', input, {}, { tools, toolChoice: 'auto' });
  
  if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
    const toolCall = llmResponse.tool_calls[0];
    const parsed = convertToolCallToSteps(toolCall);
    
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

  if (llmResponse.intent !== 'UNKNOWN' && llmResponse.workflow?.steps) {
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

  throw new Error('LLM failed to generate a result: no tool calls or workflow produced');
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
