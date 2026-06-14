import type { NLProcessor, NLContext, NLResult } from './types.js';
import type { IntentName, Step } from '../../types/index.js';
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
import { getLogger } from '../../infrastructure/logger/index.js';

const moduleLogger = getLogger('nl-pipeline');

const SAFE_SHELL_COMMANDS = new Set(['pwd', 'ls', 'echo']);

const DIALOG_DEFAULT_REPLIES: Record<string, string> = {
  DIALOG_GREETING: '你好！我是 VectaHub，你的智能工作流助手。有什么我可以帮你的吗？',
};

function tryDeterministicShellCommand(
  input: string,
  semanticDetector: ReturnType<typeof createSemanticDetector>
): NLResult | null {
  const parts = splitPosixArgs(input);
  if (parts.length === 0) return null;
  const cmd = parts[0];
  if (!SAFE_SHELL_COMMANDS.has(cmd)) return null;
  const args = parts.slice(1);

  const fullCommand = [cmd, ...args].join(' ');
  const dangerResult = semanticDetector.scan(input, fullCommand);
  if (dangerResult.severity === 'critical' || dangerResult.severity === 'high') {
    throw new Error(`Semantic Guardrails: ${dangerResult.reason ?? 'dangerous command detected'}`);
  }

  const step: Step = {
    id: 'step_shell',
    type: 'exec',
    cli: cmd,
    args,
  };

  const workflowYAML = YAML.stringify({ steps: [step] });
  return {
    success: true,
    intent: 'RUN_SCRIPT' as IntentName,
    confidence: 1.0,
    workflowYAML,
    params: {},
    metadata: { path: 'direct-query' },
    taskList: createTaskListFromWorkflow(workflowYAML, input),
  };
}

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

    const shellResult = tryDeterministicShellCommand(input, semanticDetector);
    if (shellResult) {
      return shellResult;
    }

    const goal = parseGoal(input);
    let domains: string[] | undefined = goal.domains;

    // 检查输入是否包含任何已注册 Agent 的名字/ID
    let matchedAgentIds: string[] = [];
    try {
      const registry = getAgentRegistry();
      if (registry) {
        const agentIds = registry.getAllDescriptors().map(d => d.id.toLowerCase());
        const lowerInput = input.toLowerCase();
        matchedAgentIds = agentIds.filter(id => lowerInput.includes(id));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      moduleLogger.debug({ error: message }, 'Agent name check failed');
    }

    if (matchedAgentIds.length > 0) {
      // 如果包含了已注册的 Agent，将 domains 强制置为被匹配的 Agent ID 列表。
      // 这将在工具集构造阶段（buildAllTools）自动进行排他性的精准裁剪。
      domains = matchedAgentIds;
    } else if (domains.length === 0) {
      // 检查是否为纯闲聊。如果满足以下所有条件，则判定为纯闲聊，执行工具剪枝：
      // 1. 无识别出的动作 (action === 'unknown')
      // 2. 无任何实体提取 (如文件、路径、URL等)
      const hasEntities = Object.values(goal.evidence).some(arr => Array.isArray(arr) && arr.length > 0);

      if (goal.action === 'unknown' && !hasEntities) {
        domains = [];
      } else {
        domains = undefined;
      }
    }

    try {
      const kind = await classifyIntent(input, llmClient);
      if (kind === 'query' || kind === 'dialog') {
        return await executeReplyOnly(input, llmClient, kind);
      }
      return await executeLLMToolCalling(input, llmClient, domains);
    } catch (err) {
      logger.error(`LLM Tool Calling failed: ${err}`);
      throw err;
    }
  }

  return { parse };
}

type IntentKind = 'query' | 'task' | 'dialog';

/**
 * 两阶段路由第一阶段：用 `nl-intent-classifier-v1` 提示词对输入做轻量分类。
 * 失败/解析错误返回 `null`，调用方应静默回退到现有 tool-calling 流程。
 */
async function classifyIntent(input: string, llmClient: ILLMClient): Promise<IntentKind | null> {
  try {
    const response = await llmClient.complete('nl-intent-classifier-v1', input, {}, { toolChoice: 'none' });
    const kind = parseClassifierKind(response.reply);
    return kind;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    moduleLogger.debug({ error: message }, 'Intent classifier call failed, falling back to tool-calling');
    return null;
  }
}

function parseClassifierKind(raw: string | undefined): IntentKind | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (candidate.startsWith('```')) {
    const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) candidate = fenceMatch[1].trim();
  }
  try {
    const parsed = JSON.parse(candidate) as { kind?: string };
    if (parsed.kind === 'query' || parsed.kind === 'task' || parsed.kind === 'dialog') {
      return parsed.kind;
    }
  } catch {
    const loose = trimmed.match(/["']?kind["']?\s*[:=]\s*["'](query|task|dialog)["']/i);
    if (loose) {
      const v = loose[1].toLowerCase();
      if (v === 'query' || v === 'task' || v === 'dialog') return v;
    }
  }
  return null;
}

/**
 * 两阶段路由第二阶段：reply-only 通道。
 * 使用同一个 `nl-processor-tool-calling` 提示词但禁用工具调用（toolChoice='none'），
 * 强制 LLM 在 `reply` 字段中用 Markdown 直接回答。
 */
async function executeReplyOnly(input: string, llmClient: ILLMClient, kind: IntentKind): Promise<NLResult> {
  const response = await llmClient.complete('nl-processor-tool-calling', input, {}, { toolChoice: 'none' });
  const reply = response.reply ? sanitizeReply(response.reply) : undefined;
  if (!reply) {
    if (DIALOG_DEFAULT_REPLIES[response.intent]) {
      return {
        success: true,
        intent: response.intent as IntentName,
        confidence: response.confidence || 0.7,
        reply: DIALOG_DEFAULT_REPLIES[response.intent],
        metadata: { path: 'dialog', classifierKind: kind },
      };
    }
    return {
      success: true,
      intent: (response.intent || 'UNKNOWN') as IntentName,
      confidence: response.confidence || 0.5,
      reply: '收到，但当前没有可展示的回复内容。请换个方式提问或提供更多信息。',
      metadata: { path: 'dialog', classifierKind: kind },
    };
  }
  return {
    success: true,
    intent: (response.intent || 'QUERY_INFO') as IntentName,
    confidence: response.confidence || 0.7,
    reply,
    metadata: { path: 'reply-only', classifierKind: kind },
  };
}

/**
 * 工具调用因"缺少必填参数"失败时，让 LLM 自我修正：用追加反馈再调用一次，
 * 期望 LLM 要么改用 reply 字段、要么用补全后的参数重新调工具。
 * 自我修正失败返回 `null`，调用方应回退到现有兜底文案。
 */
async function tryLLMSelfCorrection(
  originalInput: string,
  llmClient: ILLMClient,
  tools: ReturnType<typeof buildAllTools>,
  failedToolCall: { function: { name: string; arguments: string } },
  errorMessage: string,
): Promise<NLResult | null> {
  const missingKeysMatch = errorMessage.match(/Missing required parameters:?\s*(.+)$/);
  const missingKeys = missingKeysMatch ? missingKeysMatch[1].trim() : '(unknown)';
  const feedback = [
    `用户原始输入：${originalInput}`,
    '',
    '（系统反馈：你上一轮调用了工具 `' + failedToolCall.function.name + '`，但缺少必填参数：' + missingKeys + '。',
    '请按以下优先级重新响应：',
    '1. 如果信息不足以执行该工具，请改用 reply 字段用 Markdown 直接回答用户；',
    '2. 如果能在不编造的前提下从用户输入里补出参数，请重新调用该工具并填齐参数；',
    '3. 不要再次用相同的缺失参数调用该工具。）',
  ].join('\n');

  try {
    const response = await llmClient.complete('nl-processor-tool-calling', feedback, {}, { tools, toolChoice: 'auto' });
    if (response.tool_calls && response.tool_calls.length > 0) {
      try {
        const parsed = convertToolCallToSteps(response.tool_calls[0]);
        if (parsed.steps.length > 0) {
          for (let i = 0; i < parsed.steps.length; i++) {
            validateWorkflowStep(parsed.steps[i], `steps[${i}]`);
          }
          const workflowYAML = YAML.stringify({ steps: parsed.steps });
          return {
            success: true,
            intent: parsed.intent as IntentName,
            confidence: response.confidence || 0.8,
            workflowYAML,
            params: parsed.params,
            metadata: {
              path: 'llm-tool-calling',
              usedSkills: [],
              fallbackReason: 'self-corrected after Missing required parameters',
            },
            taskList: createTaskListFromWorkflow(workflowYAML, originalInput),
          };
        }
      } catch (retryToolError) {
        const retryMsg = retryToolError instanceof Error ? retryToolError.message : String(retryToolError);
        moduleLogger.debug({ error: retryMsg }, 'LLM self-correction retry still failed to convert tool call');
      }
    }
    if (response.reply) {
      return {
        success: true,
        intent: (response.intent || failedToolCall.function.name) as IntentName,
        confidence: response.confidence || 0.7,
        reply: sanitizeReply(response.reply),
        metadata: {
          path: 'dialog',
          fallbackReason: 'self-corrected to reply after Missing required parameters',
        },
      };
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    moduleLogger.debug({ error: message }, 'LLM self-correction call failed');
    return null;
  }
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

    let parsed: { intent: string; params: Record<string, unknown>; steps: Step[] };
    try {
      parsed = convertToolCallToSteps(toolCall);
    } catch (toolCallError) {
      const errorMessage = toolCallError instanceof Error ? toolCallError.message : String(toolCallError);
      if (llmResponse.reply) {
        return {
          success: true,
          intent: (llmResponse.intent || toolCall.function.name) as IntentName,
          confidence: llmResponse.confidence || 0.8,
          reply: sanitizeReply(llmResponse.reply),
          metadata: {
            path: 'dialog',
            fallbackReason: `tool_call failed: ${errorMessage}`,
          },
        };
      }
      if (errorMessage.includes('Missing required parameters')) {
        const selfCorrected = await tryLLMSelfCorrection(input, llmClient, tools, toolCall, errorMessage);
        if (selfCorrected) return selfCorrected;
        return {
          success: true,
          intent: 'UNKNOWN' as IntentName,
          confidence: 0.3,
          reply: '收到，但缺少必要参数，无法执行。请提供更具体的信息后重试。',
          metadata: {
            path: 'dialog',
            fallbackReason: `tool_call failed: ${errorMessage}`,
          },
        };
      }
      throw toolCallError;
    }

    if (parsed.steps.length === 0) {
      const reply = llmResponse.reply
        ? sanitizeReply(llmResponse.reply)
        : (DIALOG_DEFAULT_REPLIES[parsed.intent] ?? undefined);
      return {
        success: true,
        intent: parsed.intent as IntentName,
        confidence: llmResponse.confidence || 0.8,
        reply,
        metadata: {
          path: 'dialog',
        },
      };
    }

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
    } else if (DIALOG_DEFAULT_REPLIES[llmResponse.intent]) {
      return {
        success: true,
        intent: llmResponse.intent as IntentName,
        confidence: llmResponse.confidence || 0.8,
        reply: DIALOG_DEFAULT_REPLIES[llmResponse.intent],
        metadata: {
          path: 'dialog',
        },
      };
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    moduleLogger.debug({ error: message, input: trimmed.slice(0, 100) }, 'LLM reply JSON parse failed');
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        moduleLogger.debug({ error: message }, 'Inner JSON sanitize fallback');
      }
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
