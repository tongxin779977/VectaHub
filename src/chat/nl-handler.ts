/**
 * NL（自然语言）输入处理模块。
 * 负责 LLM preflight 调用、NL 解析、意图路由和工作流生成。
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
import { formatError } from './utils.js';

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

    const nlResult = await deps.nlProcessor.parse({
      input,
      sessionId,
      options: { useLLM: deps.useLLM },
    });

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
        content: nlResult.reply,
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

  return { handleNLInput };
}
