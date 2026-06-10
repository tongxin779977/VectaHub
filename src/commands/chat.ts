import { Command } from 'commander';
import { InfrastructureContext } from '../infrastructure/context.js';
import { createRepl } from '../chat/repl.js';
import { CommandBridge } from '../chat/command-bridge.js';
import { createContextBuilder } from '../chat/context-builder.js';
import { createNLProcessor } from '../nl/core/pipeline.js';
import { createLLMConfig } from '../nl/llm.js';
import { createParamExtractor } from '../nl/param-extractor.js';
import { createWorkflowEngine, type ProgressInfo } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { type ChatConfig, createDefaultChatConfig, formatChatConfig } from '../chat/config.js';
import { type ReplDeps } from '../chat/types.js';

/**
 * VectaHub Chat 子命令。
 *
 * 实现策略（自 1.0.17 起）：将 CLI 直接桥接到 `chat/repl.ts` 的 REPL 实现，
 * 不再保留独立的 while-loop 入口。这样 chat 模式与单元测试、嵌入式
 * 使用者共享同一份逻辑，包括：
 *
 * - bare execute 意图（`执行` / `run` / `go` 等）触发最近一个待执行工作流
 * - `/execute`、`/help`、`/status`、`/exit` 等斜杠命令
 * - `pendingWorkflows` 状态机与 session 持久化
 *
 * 命令的对外接口（`chatCmd` 命名导出）保持不变以避免破坏下游装配逻辑。
 */
export const chatCmd: Command = new Command('chat')
  .description('VectaHub NL Chat Mode')
  .action(async (_options: unknown, command: Command) => {
    const context = getCommandContext(command);
    const deps = buildReplDeps(context);
    const repl = createRepl(deps);
    await repl.start();
  });

/**
 * 把 `InfrastructureContext` 装配为 `ReplDeps`。
 *
 * 独立出来便于单元/集成测试复用：调用方可以在
 * 此基础上再覆盖部分字段后再传给 `createRepl`。
 */
export function buildReplDeps(context: InfrastructureContext): ReplDeps {
  const logger = context.logger.getLogger('chat');
  const commandProgram = new Command('vectahub');
  const commandBridge = new CommandBridge(commandProgram);
  const llmConfig = createLLMConfig();
  const storage = createStorage({
    logger: context.logger.getLogger('storage'),
    environment: context.environment,
  });
  const auditHelper = context.audit.getHelper();
  const workflowEngine = createWorkflowEngine({
    storage,
    logger,
    audit: auditHelper,
    environment: context.environment,
  });
  const nlProcessor = createNLProcessor({
    llmConfig,
    logger: context.logger.getLogger('nl'),
    auditHelper,
  });
  const contextBuilder = createContextBuilder(undefined);
  const paramExtractor = createParamExtractor();

  const config: ChatConfig = {
    ...createDefaultChatConfig(),
    executeMode: 'manual',
  };

  const deps: ReplDeps = {
    nlProcessor,
    contextBuilder,
    llmConfig,
    useLLM: Boolean(llmConfig),
    config,
    commandBridge,
    paramExtractor,
    auditHelper,
    logger,
    workflowEngine,
  };

  return deps;
}

/**
 * 兼容旧调用方式的命令工厂。
 * 旧 `createChatCmd(context)` 仍然返回一个新的 chat Command，
 * 但实际执行逻辑与 `chatCmd` 等价（也走 createRepl）。
 */
export function createChatCmd(context: InfrastructureContext): Command {
  return new Command('chat')
    .description('VectaHub NL Chat Mode')
    .action(async () => {
      const deps = buildReplDeps(context);
      const repl = createRepl(deps);
      await repl.start();
    });
}

/**
 * 从 commander 注入的 `Command` 上反查当前 `InfrastructureContext`。
 * 默认实现：每次都新建一个。这与历史 chatCmd 的实现一致。
 */
function getCommandContext(_command: Command): InfrastructureContext {
  return new InfrastructureContext();
}

// 显式导出 ProgressInfo 以保持与其他命令的导出风格一致
export type { ProgressInfo };
// 显式导出 formatChatConfig 以便嵌入式使用者复用
export { formatChatConfig };
