import type { NLProcessor, NLContext, NLResult } from './types.js';
import type { IntentName } from '../../types/index.js';
import type { ILLMClient } from '../interfaces.js';
import type { AuditHelper } from '../../infrastructure/audit/index.js';
import type pino from 'pino';
import YAML from 'yaml';
import { splitPosixArgs } from '../../utils/shell.js';
import { LLMClient, createLLMConfig } from '../llm.js';
import { buildAllTools, convertToolCallToSteps } from '../tool-calling.js';
import { createSemanticDetector } from '../../sandbox/semantic-detector.js';
import { parseGoal } from './goal-parser.js';
import { getAgentRegistry } from '../../agent-runtime/registry.js';

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
  logger: Pick<pino.Logger, 'error'>;
}

export function createNLProcessor(deps: NLProcessorDeps): NLProcessor {
  const llmConfig = deps.llmConfig ?? null;
  const semanticDetector = deps.semanticDetector ?? createSemanticDetector();
  const logger = deps.logger;

  if (!llmConfig) {
    throw new Error('LLM configuration is required. Keyword fallback has been removed.');
  }

  const resolvedLLMConfig = llmConfig;
  const llmClient: ILLMClient = deps.llmClient ?? (() => {
    if (!deps.auditHelper) {
      throw new Error('auditHelper is required when llmClient is not provided in NLProcessorDeps');
    }
    return new LLMClient(resolvedLLMConfig, { auditHelper: deps.auditHelper });
  })();

  async function parse(context: NLContext): Promise<NLResult> {
    const input = typeof context.input === 'string' ? context.input.trim() : '';

    if (!input) {
      throw new Error('Empty input: NL pipeline requires a non-empty string input');
    }
    const injectionResult = semanticDetector.detectInjection(input);
    if (injectionResult.detected) {
      throw new Error(`Semantic Guardrails: ${injectionResult.reason}`);
    }

    const goal = parseGoal(input);
    let domains: string[] | undefined = goal.domains;

    if (domains.length === 0) {
      // 检查是否为纯闲聊。如果满足以下所有条件，则判定为纯闲聊，执行工具剪枝：
      // 1. 无识别出的动作 (action === 'unknown')
      // 2. 无任何实体提取 (如文件、路径、URL等)
      // 3. 不包含任何已注册 Agent 的名字/ID
      const hasEntities = Object.values(goal.evidence).some(arr => Array.isArray(arr) && arr.length > 0);
      let containsAgentName = false;
      try {
        const registry = getAgentRegistry();
        if (registry) {
          const agentIds = registry.getAllDescriptors().map(d => d.id.toLowerCase());
          const lowerInput = input.toLowerCase();
          containsAgentName = agentIds.some(id => lowerInput.includes(id));
        }
      } catch {
        containsAgentName = false;
      }

      if (goal.action === 'unknown' && !hasEntities && !containsAgentName) {
        domains = [];
      } else {
        domains = undefined;
      }
    }

    try {
      return await executeLLMToolCalling(input, llmClient, domains);
    } catch (err) {
      logger.error(`LLM Tool Calling failed: ${err}`);
      throw err;
    }
  }

  return { parse };
}

async function executeLLMToolCalling(
  input: string,
  llmClient: ILLMClient,
  domains?: string[]
): Promise<NLResult> {
  const tools = buildAllTools(domains);
  
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
        reply: llmResponse.reply ? sanitizeReply(llmResponse.reply) : undefined,
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
        reply: sanitizeReply(llmResponse.reply),
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
      reply: sanitizeReply(llmResponse.reply),
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

function sanitizeReply(reply: string): string {
  const trimmed = reply.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return reply;
  }
  if (trimmed === '{}' || trimmed === '[]' || trimmed === '{' || trimmed === '[') {
    return '收到，但未生成有效回复。请重试或换个方式提问。';
  }
  const jsonStr = extractLeadingJSON(trimmed);
  if (!jsonStr) return reply;
  const tail = trimmed.slice(jsonStr.length).trim();
  try {
    const parsed: Record<string, unknown> = JSON.parse(jsonStr);
    const sanitized = sanitizeParsedJSON(parsed);
    if (sanitized) {
      return tail ? `${sanitized}\n\n${tail}` : sanitized;
    }
    return reply;
  } catch {
    if (/^\{[a-zA-Z_]+\}$/.test(trimmed) || /^\{[a-zA-Z_]+:\s*.+\}$/.test(trimmed)) {
      return '收到，但未生成有效回复。请重试或换个方式提问。';
    }
    return reply;
  }
}

function sanitizeParsedJSON(obj: Record<string, unknown>): string | null {
  if (typeof obj.reply === 'string') return sanitizeSingleValue(obj.reply);
  if (typeof obj.response === 'string') return sanitizeSingleValue(obj.response);
  if (typeof obj.answer === 'string') return sanitizeSingleValue(obj.answer);
  if (typeof obj.message === 'string') return sanitizeSingleValue(obj.message);
  if (typeof obj.content === 'string' && obj.content.length > 0) return obj.content;
  const result = extractTextParts(obj);
  if (result.length > 0) return result.join('\n\n');
  const allStrings = collectAllStrings(obj);
  if (allStrings.length > 0) return allStrings.join('\n');
  const values = Object.values(obj);
  if (values.length === 1) {
    const v = values[0];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v) && v.length === 0) return '[]';
  }
  if (values.length === 0) return '{}';
  return null;
}

function sanitizeSingleValue(val: string): string {
  const trimmed = val.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const innerJson = extractLeadingJSON(trimmed);
    if (innerJson) {
      try {
        const innerParsed: Record<string, unknown> = JSON.parse(innerJson);
        return sanitizeParsedJSON(innerParsed) || trimmed;
      } catch { /* not valid JSON, return as-is */ }
    }
  }
  return val;
}

function extractLeadingJSON(text: string): string | null {
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  const openBracket = text[0];
  const closeBracket = openBracket === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openBracket) depth++;
    if (ch === closeBracket) { depth--; if (depth === 0) return text.slice(0, i + 1); }
  }
  return null;
}

function extractTextParts(obj: Record<string, unknown>, prefix?: string): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' && value.length > 0) {
      parts.push(`**${label}**: ${value}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`**${label}**: ${String(value)}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const strItems = value.filter((v): v is string => typeof v === 'string');
      if (strItems.length > 0) {
        parts.push(`**${label}**:\n${strItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}`);
      } else {
        const objItems = value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null);
        for (const item of objItems) {
          parts.push(...extractTextParts(item, label));
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      parts.push(...extractTextParts(value as Record<string, unknown>, label));
    }
  }
  return parts;
}

function collectAllStrings(obj: Record<string, unknown>): string[] {
  const strings: string[] = [];
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.trim()) {
      strings.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) {
          strings.push(item);
        } else if (typeof item === 'object' && item !== null) {
          strings.push(...collectAllStrings(item as Record<string, unknown>));
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      strings.push(...collectAllStrings(value as Record<string, unknown>));
    }
  }
  return strings;
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
