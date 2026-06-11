/**
 * Chat REPL 主模块。
 * 负责 REPL 生命周期管理、输入路由、斜杠命令注册和会话持久化。
 * @module chat/repl
 */
import { createInterface } from 'node:readline';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ChatOutput, PendingWorkflow, ReplDeps, SlashCommand, SlashCommandContext } from './types.js';
import type { UIRenderer } from './ui-renderer.js';
import type { ChatConfig } from './config.js';
import { createUIRenderer } from './ui-renderer.js';
import { createCommandManager } from './command-manager.js';
import { formatChatConfig } from './config.js';
import { createContextBuilder } from './context-builder.js';
import { executeDirectShellCommand } from './shell-executor.js';
import { createNLHandler } from './nl-handler.js';
import { formatError } from './utils.js';

export { mapWorkflowStep, parseWorkflowSteps } from './workflow-parser.js';
export type { ParsedWorkflowStep } from './workflow-parser.js';

/**
 * 会话持久化数据结构。
 * 用于保存和恢复 REPL 会话状态。
 */
export interface SessionPersistData {
  /** 会话标识符 */
  sessionId: string;
  /** 持久化格式版本号 */
  version: number;
  /** 最后活动时间（ISO 8601） */
  lastActivity: string;
  /** 待执行工作流的 YAML 列表 */
  pendingWorkflowYAMLs: string[];
  /** 聊天配置快照 */
  config: ChatConfig;
}

/** 持久化格式版本号 */
const SESSION_DATA_VERSION = 1;

/**
 * 获取会话持久化文件的存储目录。
 *
 * @returns 会话存储目录路径
 */
function getSessionStoreDir(): string {
  return join(homedir(), '.vectahub', 'chat-sessions');
}

/**
 * 获取指定会话的持久化文件路径。
 *
 * @param sessionId - 会话标识符
 * @returns 会话文件的完整路径
 */
function getSessionFilePath(sessionId: string): string {
  return join(getSessionStoreDir(), `${sessionId}.json`);
}

/**
 * 保存会话数据到文件系统。
 *
 * @param data - 要持久化的会话数据
 */
async function saveSessionData(data: SessionPersistData): Promise<void> {
  try {
    const dir = getSessionStoreDir();
    await mkdir(dir, { recursive: true });
    const filePath = getSessionFilePath(data.sessionId);
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // 持久化失败不应阻断 REPL 主流程
  }
}

/**
 * 从文件系统加载会话数据。
 *
 * @param sessionId - 会话标识符
 * @returns 会话数据，文件不存在或格式无效时返回 `null`
 */
async function loadSessionData(sessionId: string): Promise<SessionPersistData | null> {
  try {
    const filePath = getSessionFilePath(sessionId);
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as SessionPersistData;
    if (parsed && parsed.version === SESSION_DATA_VERSION && parsed.sessionId === sessionId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 视为"执行最近一个待执行工作流"的自然语言短语集合。
 * 大小写不敏感，匹配时去除首尾空白。
 * 与 `/execute` slash-command 行为一致：直接执行，不受 executeMode 影响。
 */
const BARE_EXECUTE_INTENTS: ReadonlySet<string> = new Set([
  '执行',
  '运行',
  'run',
  'go',
  'execute',
  'do it',
  'run it',
  'go ahead',
]);

function isBareExecuteIntent(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return false;
  return BARE_EXECUTE_INTENTS.has(normalized);
}

/**
 * 默认斜杠命令集合。
 * 包含 `exit`、`help`、`status` 和 `execute` 四个内置命令。
 */
export const defaultSlashCommands: SlashCommand[] = [
  {
    name: 'exit',
    description: '退出',
    handler: async () => '__EXIT__',
  },
  {
    name: 'help',
    description: '帮助',
    handler: async () => '📖 可用命令: /exit, /help, /status, /execute\n💡 也可以直接输入 `执行` / `run` / `go` 触发最近一个待执行工作流',
  },
  {
    name: 'status',
    description: '状态',
    handler: async () => '__STATUS__',
  },
  {
    name: 'execute',
    description: '执行',
    handler: async () => '__EXECUTE__',
  },
];

/**
 * 创建 REPL 实例的完整版本。
 * 包含所有初始化逻辑：UI 渲染器、命令管理器、上下文构建器、NL 处理器。
 *
 * @param deps - 外部依赖注入
 * @returns 包含 `start`、`processInput` 和 `getSlashCommands` 的 REPL 实例
 */
export function createREPL(deps: ReplDeps) {
  const ui: UIRenderer = createUIRenderer(deps.config, deps.logger);
  const cmdManager = createCommandManager(deps.config);

  const slashCommands = new Map<string, SlashCommand>();
  defaultSlashCommands.forEach(cmd => slashCommands.set(cmd.name, cmd));

  createContextBuilder(deps.sessionManager);

  const sessionId = deps.config.defaultSessionId;
  const pendingWorkflows = new Map<string, PendingWorkflow>();

  const nlHandler = createNLHandler(
    {
      nlProcessor: deps.nlProcessor,
      taskContractProcessor: deps.taskContractProcessor,
      sessionManager: deps.sessionManager,
      useLLM: deps.useLLM,
      llmConfig: deps.llmConfig,
      auditHelper: deps.auditHelper,
      workflowEngine: deps.workflowEngine,
      commandExecutor: deps.commandExecutor,
      commandBridge: deps.commandBridge,
      paramExtractor: deps.paramExtractor,
      config: deps.config,
      logger: deps.logger,
    },
    sessionId,
    ui,
    pendingWorkflows,
    (question: string) => promptForConfirmation(question, ui),
    executePendingWorkflow,
  );

  function renderOutput(output: ChatOutput): void {
    ui.render(output);
  }

  async function promptForConfirmation(question: string, uiRenderer: UIRenderer): Promise<boolean> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    uiRenderer.renderInfo(question);
    const answer = await new Promise<string>((resolve) => {
      rl.question('> ', (ans) => {
        resolve(ans);
        rl.close();
      });
    });
    const normalizedAnswer = answer.trim().toLowerCase();
    return normalizedAnswer === 'y' || normalizedAnswer === 'yes';
  }

  async function executePendingWorkflow(sessId: string, workflowId: string, initialVariables?: Record<string, unknown>): Promise<ChatOutput> {
    const workflowData = pendingWorkflows.get(sessId);
    if (!workflowData) {
      return { type: 'error', content: `❌ 工作流 ${workflowId} 未找到。请先生成工作流。` };
    }

    if (!deps.workflowEngine) {
      return { type: 'error', content: '❌ 工作流引擎未初始化。' };
    }

    try {
      const execution = await deps.workflowEngine.execute(
        workflowData.workflow,
        { initialVariables: initialVariables || workflowData.params },
      );

      const executionId = execution.executionId;
      const status = execution.status;
      const exitCode = status === 'COMPLETED' ? 0 : 1;
      const lastStepOutput = execution.steps.length > 0
        ? execution.steps[execution.steps.length - 1].output
        : undefined;
      const outputText = Array.isArray(lastStepOutput) && lastStepOutput.length > 0
        ? lastStepOutput.join('\n')
        : '✅ 工作流执行完成';

      pendingWorkflows.delete(sessId);
      void persistSession();

      return {
        type: 'command-result',
        content: typeof outputText === 'string' ? outputText : JSON.stringify(outputText, null, 2),
        metadata: { executionId, status: String(status), exitCode },
      };
    } catch (err) {
      return { type: 'error', content: `❌ 工作流执行失败: ${formatError(err)}` };
    }
  }

  /**
   * 执行当前会话最近一个待执行工作流。
   * 无待执行工作流时返回错误回复。
   * 被 `/execute` slash-command 与 bare execute 意图（`执行`/`run` 等）共用。
   */
  async function runMostRecentPendingWorkflow(): Promise<ChatOutput> {
    if (pendingWorkflows.size === 0) {
      return { type: 'error', content: '❌ 没有待执行的工作流。请先通过 NL 生成工作流。' };
    }
    const [[wfId]] = pendingWorkflows;
    return executePendingWorkflow(sessionId, wfId);
  }

  async function processInput(input: string): Promise<ChatOutput> {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return { type: 'text', content: '' };
    }

    if (isBareExecuteIntent(trimmedInput)) {
      return runMostRecentPendingWorkflow();
    }

    const chatInput = cmdManager.parseInput(trimmedInput);

    if (chatInput.type === 'slash-command') {
      const commandName = chatInput.parsed;
      const command = slashCommands.get(commandName);
      if (!command) {
        return { type: 'error', content: `❌ 未知命令: ${trimmedInput}` };
      }

      const context: SlashCommandContext = { sessionId, sessionManager: deps.sessionManager, config: deps.config };
      try {
        const result = await command.handler(chatInput.args || [], context);
        if (result === '__EXIT__') {
          return { type: 'text', content: '👋 再见！', metadata: { exit: true } };
        }
        if (result === '__EXECUTE__') {
          return runMostRecentPendingWorkflow();
        }
        if (result === '__STATUS__') {
          const status = `📊 会话: ${sessionId}\n工作流: ${pendingWorkflows.size} 个待执行\n${formatChatConfig(deps.config)}`;
          return { type: 'text', content: status };
        }
        return { type: 'text', content: result };
      } catch (err) {
        deps.logger.debug({ err }, 'Slash command execution failed');
        return { type: 'error', content: `❌ 命令执行失败: ${formatError(err)}` };
      }
    }

    if (chatInput.type === 'shell') {
      try {
        const bridgeOutput = await deps.commandBridge.execute(chatInput.parsed);
        return { type: 'command-result', content: bridgeOutput };
      } catch (err) {
        deps.logger.debug({ err, command: chatInput.parsed }, 'CommandBridge execution failed, trying fallback');
        try {
          if (deps.commandExecutor) {
            const executorOutput = await deps.commandExecutor.execute(chatInput.parsed);
            return { type: 'command-result', content: executorOutput };
          }
          return executeDirectShellCommand(chatInput.parsed);
        } catch (fallbackErr) {
          deps.logger.debug({ err: fallbackErr, command: chatInput.parsed }, 'Shell fallback execution failed');
          return { type: 'error', content: `❌ 执行出错: ${formatError(fallbackErr)}` };
        }
      }
    }

    const nlOutput = await nlHandler.handleNLInput(chatInput.parsed);
    if (nlOutput.type === 'text' && nlOutput.content.includes('工作流已生成')) {
      void persistSession();
    }
    return nlOutput;
  }

  /**
   * 将当前会话状态持久化到文件系统。
   * 包含待执行工作流和配置快照。
   */
  async function persistSession(): Promise<void> {
    const pendingYAMLs: string[] = [];
    for (const [, wf] of pendingWorkflows) {
      pendingYAMLs.push(wf.yaml);
    }

    await saveSessionData({
      sessionId,
      version: SESSION_DATA_VERSION,
      lastActivity: new Date().toISOString(),
      pendingWorkflowYAMLs: pendingYAMLs,
      config: deps.config,
    });
  }

  /**
   * 从文件系统恢复上一次会话的待执行工作流。
   * 恢复失败时不阻断 REPL 启动。
   */
  async function restoreSession(): Promise<void> {
    const data = await loadSessionData(sessionId);
    if (!data || data.pendingWorkflowYAMLs.length === 0) {
      return;
    }

    for (const yaml of data.pendingWorkflowYAMLs) {
      try {
        const { parseWorkflowSteps } = await import('./workflow-parser.js');
        const steps = parseWorkflowSteps(yaml);
        const restoredWorkflow = {
          id: `restored_${Date.now()}`,
          name: `restored_${Date.now()}`,
          mode: 'relaxed' as const,
          steps,
          createdAt: new Date(),
        };
        pendingWorkflows.set(sessionId, {
          workflow: restoredWorkflow,
          yaml,
          createdAt: new Date(),
        });
      } catch {
        // 单个工作流恢复失败不影响其他工作流
      }
    }

    if (pendingWorkflows.size > 0) {
      ui.renderInfo(`🔄 已恢复 ${pendingWorkflows.size} 个工作流`);
    }
  }

  async function start(): Promise<void> {
    await restoreSession();

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: deps.config.prompt,
    });

    ui.renderInfo(`VectaHub Chat REPL ${formatChatConfig(deps.config)}`);
    ui.renderInfo('💡 输入自然语言生成工作流，再输入 `执行` / `run` / `go` 触发最近一个待执行工作流');
    rl.prompt();

    rl.on('line', async (line: string) => {
      const output = await processInput(line);
      renderOutput(output);

      if (output.metadata?.exit) {
        rl.close();
        return;
      }

      if (process.env.NODE_ENV === 'test') {
        rl.prompt();
      } else {
        setTimeout(() => {
          rl.prompt();
        }, 50);
      }
    });

    rl.on('close', () => {
      ui.renderInfo('👋 再见！');
      process.exit(0);
    });
  }

  function getSlashCommands(): Map<string, SlashCommand> {
    return new Map(slashCommands);
  }

  return { start, processInput, getSlashCommands, persistSession };
}

/**
 * 创建 REPL 实例的简洁入口。
 * 委托给 `createREPL`。
 *
 * @param deps - 外部依赖注入
 * @returns 包含 `start`、`processInput` 和 `getSlashCommands` 的 REPL 实例
 */
export function createRepl(deps: ReplDeps) {
  return createREPL(deps);
}
