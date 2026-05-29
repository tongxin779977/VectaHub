/**
 * NL（自然语言）输入处理模块。
 * 负责 LLM preflight 调用、NL 解析、意图路由和工作流生成。
 * 内置意图解析缓存，避免对相同输入重复调用 NL 处理器。
 * @module chat/nl-handler
 */
import type { ChatOutput, PendingWorkflow, ReplDeps } from './types.js';
import type { ChatConfig } from './config.js';
import type { UIRenderer } from './ui-renderer.js';
import type { NLResult } from '../nl/core/types.js';
import type { Workflow } from '../types/index.js';
import { LLMClient } from '../nl/llm.js';
import { buildAllTools } from '../nl/tool-calling.js';
import { parseWorkflowSteps } from './workflow-parser.js';
import { formatError, SimpleCache } from './utils.js';

/** 意图解析缓存 TTL（毫秒），120 秒 */
const INTENT_CACHE_TTL_MS = 120_000;

/** 意图解析缓存最大容量 */
const INTENT_CACHE_MAX_SIZE = 200;

/**
 * NL 处理器所需的依赖子集。
 */
export interface NLHandlerDeps {
  nlProcessor: ReplDeps['nlProcessor'];
  sessionManager: ReplDeps['sessionManager'];
  useLLM: boolean;
  llmConfig: ReplDeps['llmConfig'];
  auditHelper: ReplDeps['auditHelper'];
  workflowEngine: ReplDeps['workflowEngine'];
  commandExecutor: ReplDeps['commandExecutor'];
  paramExtractor: ReplDeps['paramExtractor'];
  config: ChatConfig;
  logger: ReplDeps['logger'];
}

/**
 * 工作流相关的 NL 元数据。
 */
interface ReplWorkflowMetadata {
  intent?: string;
  confidence?: number;
  path?: NLResult['metadata']['path'];
}

/**
 * 创建 NL 输入处理器。
 * 返回的函数可处理完整的 NL 输入流程：preflight → 解析 → 意图路由 → 工作流生成。
 *
 * @param deps - NL 处理所需依赖
 * @param sessionId - 当前会话 ID
 * @param ui - UI 渲染器，用于 info 输出
 * @param pendingWorkflows - 待执行工作流存储
 * @param promptForConfirmation - 确认提示回调
 * @param executePendingWorkflow - 执行待工作流回调
 * @returns NL 输入处理函数
 */
export function createNLHandler(
  deps: NLHandlerDeps,
  sessionId: string,
  ui: UIRenderer,
  pendingWorkflows: Map<string, PendingWorkflow>,
  promptForConfirmation: (question: string) => Promise<boolean>,
  executePendingWorkflow: (sessId: string, workflowId: string, initialVariables?: Record<string, unknown>) => Promise<ChatOutput>,
) {
  const intentCache = new SimpleCache<NLResult>(INTENT_CACHE_TTL_MS, INTENT_CACHE_MAX_SIZE);

  function buildIntentCacheKey(input: string): string {
    return `${sessionId}::${input}`;
  }

  async function handleNLInput(input: string): Promise<ChatOutput> {
    if (deps.config.executeMode === 'auto' && deps.useLLM && deps.llmConfig) {
      try {
        const llmClient = new LLMClient(deps.llmConfig, { auditHelper: deps.auditHelper });
        await llmClient.complete(
          'intent-parser-chat',
          input,
          {},
          { tools: buildAllTools() }
        );
      } catch (err) {
        deps.logger.debug({ err }, 'LLM preflight failed, falling back to NL processor');
      }
    }

    const cacheKey = buildIntentCacheKey(input);
    let nlResult: NLResult;

    const cached = intentCache.get(cacheKey);
    if (cached !== undefined) {
      nlResult = cached;
    } else {
      nlResult = await deps.nlProcessor.parse({
        input,
        sessionId,
        options: { useLLM: deps.useLLM },
      });
      intentCache.set(cacheKey, nlResult);
    }

    const matchedIntent = nlResult.intent || nlResult.taskList?.intent;

    if (matchedIntent === 'DIALOG_GREETING') {
      return {
        type: 'text',
        content: '👋 你好！我是 VectaHub，你的智能工作流助手。'
      };
    }

    if (nlResult.workflowYAML) {
      return handleWorkflowGeneration(nlResult, input);
    }

    if (nlResult.reply) {
      return {
        type: 'text',
        content: sanitizeReply(nlResult.reply),
      };
    }

    const metadata: ReplWorkflowMetadata = {
      intent: nlResult.intent,
      confidence: nlResult.confidence,
      path: nlResult.metadata?.path,
    };

    return { type: 'workflow', content: JSON.stringify(nlResult), metadata };
  }

  async function handleWorkflowGeneration(nlResult: NLResult, rawInput: string): Promise<ChatOutput> {
    if (!deps.workflowEngine) return { type: 'error', content: '❌ 工作流引擎未初始化。' };
    if (!nlResult.workflowYAML) return { type: 'error', content: '❌ 工作流 YAML 为空。' };

    try {
      const steps = parseWorkflowSteps(nlResult.workflowYAML);
      const workflow: Workflow = {
        id: `chat_${Date.now()}`,
        name: `chat_${Date.now()}`,
        mode: 'relaxed',
        steps,
        createdAt: new Date(),
      };
      const extractedParams = deps.paramExtractor?.extract(rawInput) ?? {};
      const combinedParams = {
        ...(nlResult.params || {}),
        ...extractedParams,
      };

      pendingWorkflows.set(sessionId, {
        workflow,
        yaml: nlResult.workflowYAML,
        intent: String(nlResult.intent),
        confidence: nlResult.confidence,
        createdAt: new Date(),
        params: combinedParams,
      });

      if (deps.sessionManager?.updateLastWorkflow) {
        deps.sessionManager.updateLastWorkflow(sessionId, workflow.id, nlResult.workflowYAML);
      }

      const workflowSummary = `✅ 工作流已生成！\n🎯 意图: ${nlResult.intent}\n📊 置信度: ${((nlResult.confidence || 0) * 100).toFixed(0)}%\n\n\`\`\`yaml\n${nlResult.workflowYAML}\n\`\`\``;

      if (deps.config.executeMode === 'auto') {
        ui.renderInfo(`执行模式: auto. 立即执行工作流: ${workflow.id}`);
        return executePendingWorkflow(sessionId, workflow.id, combinedParams);
      } else if (deps.config.executeMode === 'confirm') {
        const confirmed = await promptForConfirmation(`是否立即执行工作流 ${workflow.id}?`);
        if (confirmed) {
          return executePendingWorkflow(sessionId, workflow.id, combinedParams);
        }
        return { type: 'text', content: `${workflowSummary}\n\n💡 已取消自动执行。输入 \`执行工作流\` 或 \`/execute\` 来手动执行。` };
      } else {
        return { type: 'text', content: `${workflowSummary}\n\n💡 输入 \`执行工作流\` 或 \`/execute\` 来运行。` };
      }
    } catch (err) {
      return { type: 'error', content: `❌ 工作流解析失败: ${formatError(err)}` };
    }
  }

  /**
   * 清空意图解析缓存。
   * 在会话切换或需要强制重新解析时调用。
   */
  function clearIntentCache(): void {
    intentCache.clear();
  }

  return { handleNLInput, clearIntentCache };
}

/**
 * 清洗 LLM reply 字段，将误输出的 JSON 结构转换为可读文本。
 * LLM 在处理评估类问题时，倾向于在 reply 字段中输出 JSON 对象，
 * 此函数检测并提取其中的文本内容。
 */
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
