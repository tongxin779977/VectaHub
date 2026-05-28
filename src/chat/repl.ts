/**
 * Chat REPL 主模块。
 * 负责 REPL 生命周期管理、输入路由和斜杠命令注册。
 * @module chat/repl
 */
import { createInterface } from 'node:readline';
import type { ChatOutput, PendingWorkflow, ReplDeps, SlashCommand, SlashCommandContext } from './types.js';
import type { UIRenderer } from './ui-renderer.js';
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
    handler: async () => '📖 可用命令: /exit, /help, /status, /execute',
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

  const contextBuilder = createContextBuilder(deps.sessionManager);

  const sessionId = deps.config.defaultSessionId;
  const pendingWorkflows = new Map<string, PendingWorkflow>();

  const nlHandler = createNLHandler(
    {
      nlProcessor: deps.nlProcessor,
      sessionManager: deps.sessionManager,
      useLLM: deps.useLLM,
      llmConfig: deps.llmConfig,
      auditHelper: deps.auditHelper,
      workflowEngine: deps.workflowEngine,
      commandExecutor: deps.commandExecutor,
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

      return {
        type: 'command-result',
        content: typeof outputText === 'string' ? outputText : JSON.stringify(outputText, null, 2),
        metadata: { executionId, status: String(status), exitCode },
      };
    } catch (err) {
      return { type: 'error', content: `❌ 工作流执行失败: ${formatError(err)}` };
    }
  }

  async function processInput(input: string): Promise<ChatOutput> {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return { type: 'text', content: '' };
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
          if (pendingWorkflows.size === 0) {
            return { type: 'error', content: '❌ 没有待执行的工作流。请先通过 NL 生成工作流。' };
          }
          const [[wfId]] = pendingWorkflows;
          return executePendingWorkflow(sessionId, wfId);
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

    return nlHandler.handleNLInput(chatInput.parsed);
  }

  async function start(): Promise<void> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: deps.config.prompt,
    });

    ui.renderInfo(`VectaHub Chat REPL ${formatChatConfig(deps.config)}`);
    rl.prompt();

    rl.on('line', async (line: string) => {
      const output = await processInput(line);
      renderOutput(output);

      if (output.metadata?.exit) {
        rl.close();
        return;
      }

      rl.prompt();
    });

    rl.on('close', () => {
      ui.renderInfo('👋 再见！');
      process.exit(0);
    });
  }

  function getSlashCommands(): Map<string, SlashCommand> {
    return new Map(slashCommands);
  }

  return { start, processInput, getSlashCommands };
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
