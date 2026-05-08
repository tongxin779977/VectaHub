import * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import type { ChatOutput, SlashCommandContext, PendingWorkflow, UIRenderer, ReplDeps } from './types.js';
import type { ChatConfig } from './config.js';
import type { SessionManager } from '../nl/session-manager.js';
import type { NLResult } from '../nl/core/types.js';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { buildToolsFromTemplates } from '../nl/tool-calling.js';
import { createUIRenderer } from './ui-renderer.js';
import { createCommandManager, type CommandManager } from './command-manager.js';
import type { Workflow, Step } from '../types/index.js';

export function createREPL(
  deps: ReplDeps,
  sessionId: string,
  rl: readline.Interface,
  ui: UIRenderer,
  cmdManager: CommandManager
): (input: string) => Promise<ChatOutput> {
  const { nlProcessor, sessionManager, useLLM, commandExecutor, workflowEngine, commandBridge, paramExtractor, config } = deps;
  const pendingWorkflows = new Map<string, PendingWorkflow>();

  async function executePendingWorkflow(
    sessId: string,
    workflowId: string,
    initialVariables?: Record<string, unknown>
  ): Promise<ChatOutput> {
    const pending = pendingWorkflows.get(sessId);
    if (!pending) {
      return { type: 'error', content: '❌ 没有待执行的工作流。' };
    }
    if (!workflowEngine) {
      return { type: 'error', content: '❌ 工作流引擎未初始化。' };
    }
    try {
      const workflow = (await workflowEngine.getWorkflow(workflowId)) ?? pending.workflow;
      const result = await workflowEngine.execute(workflow, { mode: 'relaxed', initialVariables });
      const stepsOutput = (result.steps as any[]).map(s => {
        const icon = s.status === 'COMPLETED' ? '✅' : '❌';
        const output = s.output ? `\n    ${String(s.output).substring(0, 200)}` : '';
        return `  ${icon} ${s.stepId}: ${s.status}${output}`;
      }).join('\n');
      const summary = result.status === 'COMPLETED' ? '✅ 执行成功' : '❌ 执行失败';
      return {
        type: 'text',
        content: `${summary} (${result.duration}ms)\n\n${stepsOutput}`,
        metadata: { executionId: result.executionId, status: result.status, duration: result.duration },
      };
    } catch (err) {
      return { type: 'error', content: `❌ 执行出错: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async function promptForConfirmation(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      rl.question(question + ' (y/n): ', (answer) => {
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  async function handleSlashCommand(input: { parsed: string; args?: string[] }): Promise<ChatOutput> {
    const cmd = cmdManager.getSlashCommand(input.parsed);
    if (!cmd) {
      return { type: 'error', content: `Unknown command: /${input.parsed}. Type /help for available commands.` };
    }

    const ctx: SlashCommandContext = {
      sessionId,
      sessionManager,
      config,
    };

    const result = await cmd.handler(input.args ?? [], ctx);

    if (result === '__EXIT__') {
      return { type: 'text', content: result, metadata: { exit: true } };
    }

    if (result === '__EXECUTE__') {
      const pending = pendingWorkflows.get(sessionId);
      if (!pending) return { type: 'error', content: '❌ 没有待执行的工作流。' };
      return executePendingWorkflow(sessionId, pending.workflow.id, pending.params);
    }

    if (result === '__STATUS__') {
      return renderStatus();
    }

    return { type: 'text', content: result };
  }

  function renderStatus(): ChatOutput {
    const lines = [
      '═══ SESSION STATUS ═══',
      `Session ID: ${sessionId || 'N/A'}`,
    ];
    
    const session = sessionManager?.getSession(sessionId);
    if (session?.projectContext?.gitStatus) {
      lines.push(`Branch: ${session.projectContext.gitStatus.branch}`);
    }

    const pending = pendingWorkflows.get(sessionId);
    if (pending) {
      lines.push(`Pending Workflow: ${pending.workflow.id} (${pending.intent})`);
      lines.push(`  Confidence: ${((pending.confidence ?? 0) * 100).toFixed(1)}%`);
    }

    lines.push('══════════════════════');
    return { type: 'text', content: lines.join('\n') };
  }

  async function processInput(input: string): Promise<ChatOutput> {
    const parsed = cmdManager.parseInput(input.trim());

    if (parsed.type === 'shell') {
      return handleShellInput(parsed.raw);
    }

    if (parsed.type === 'slash-command') {
      return handleSlashCommand({ parsed: parsed.parsed, args: parsed.args });
    }

    // Check for execution patterns
    const execPatterns = /^(执行|运行|execute|run)\s*(这个|该|上一个)?\s*(工作流|workflow)$/i;
    if (execPatterns.test(parsed.parsed.trim())) {
      const pending = pendingWorkflows.get(sessionId);
      if (pending) {
        return executePendingWorkflow(sessionId, pending.workflow.id, pending.params);
      }
      return { type: 'error', content: '❌ 没有待执行的工作流。请先生成一个工作流。' };
    }

    return handleNLInput(parsed.parsed);
  }

  async function handleShellInput(raw: string): Promise<ChatOutput> {
    const { commandBridgePrefix, enableCommandBridge } = config;
    if (enableCommandBridge && raw.startsWith(commandBridgePrefix)) {
      const commandToExecute = raw.slice(commandBridgePrefix.length).trim();
      try {
        const result = await commandBridge.execute(commandToExecute);
        return { type: 'command-result', content: result };
      } catch (err) {
        return { type: 'error', content: `VectaHub command failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    } else if (commandExecutor) {
      try {
        const result = await commandExecutor.execute(raw);
        return { type: 'command-result', content: result };
      } catch (err) {
        return { type: 'error', content: `Shell command failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    return executeDirectShellCommand(raw);
  }

  async function handleNLInput(input: string): Promise<ChatOutput> {
    if (config.executeMode === 'auto' && useLLM && deps.llmConfig) {
      try {
        const llmClient = new LLMClient(deps.llmConfig);
        await llmClient.complete(
          'intent-parser-chat',
          input,
          {},
          { tools: buildToolsFromTemplates() }
        );
      } catch {
        // NL processor remains the source of truth for workflow generation.
      }
    }

    // Calling the unified nlProcessor instead of direct LLM logic
    const nlResult = await nlProcessor.parse({
      input,
      sessionId,
      options: { useLLM },
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

    return { type: 'workflow', content: JSON.stringify(nlResult), metadata: nlResult as any };
  }

  async function handleWorkflowGeneration(nlResult: NLResult, rawInput: string): Promise<ChatOutput> {
    if (!workflowEngine) return { type: 'error', content: '❌ 工作流引擎未初始化。' };
    if (!nlResult.workflowYAML) return { type: 'error', content: '❌ 工作流 YAML 为空。' };

    try {
      const parsedYaml = YAML.parse(nlResult.workflowYAML);
      const steps: Step[] = (parsedYaml.steps ?? []).map((s: any, i: number) => ({
        id: `step_${i + 1}`,
        type: 'exec' as const,
        cli: s.cli ?? s.command ?? 'echo',
        args: s.args ?? [],
      }));

      const workflow = await workflowEngine.createWorkflow(`chat_${Date.now()}`, steps);
      const extractedParams = paramExtractor?.extract(rawInput) ?? {};
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

      // Remember for multi-turn context
      if (sessionManager?.updateLastWorkflow) {
        sessionManager.updateLastWorkflow(sessionId, workflow.id, nlResult.workflowYAML);
      }

      const workflowSummary = `✅ 工作流已生成！\n🎯 意图: ${nlResult.intent}\n📊 置信度: ${((nlResult.confidence || 0) * 100).toFixed(0)}%\n\n\`\`\`yaml\n${nlResult.workflowYAML}\n\`\`\``;

      if (config.executeMode === 'auto') {
        ui.renderInfo(`执行模式: auto. 立即执行工作流: ${workflow.id}`);
        return executePendingWorkflow(sessionId, workflow.id, combinedParams);
      } else if (config.executeMode === 'confirm') {
        const confirmed = await promptForConfirmation(`是否立即执行工作流 ${workflow.id}?`);
        if (confirmed) {
          return executePendingWorkflow(sessionId, workflow.id, combinedParams);
        }
        return { type: 'text', content: `${workflowSummary}\n\n💡 已取消自动执行。输入 \`执行工作流\` 或 \`/execute\` 来手动执行。` };
      } else {
        return { type: 'text', content: `${workflowSummary}\n\n💡 输入 \`执行工作流\` 或 \`/execute\` 来运行。` };
      }
    } catch (err) {
      return { type: 'error', content: `❌ 工作流解析失败: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  function executeDirectShellCommand(command: string): Promise<ChatOutput> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(/\s+/);
      const child = spawn(cmd, args);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());
      child.on('close', code => resolve({ type: 'command-result', content: stdout || stderr, metadata: { exitCode: code ?? 0, stderr } }));
      child.on('error', err => resolve({ type: 'error', content: `Execution failed: ${err.message}` }));
    });
  }

  return processInput;
}

export function createRepl(deps: ReplDeps, options?: { sessionId?: string; sessionManager?: SessionManager; config?: ChatConfig }): { start: () => Promise<void>; getSlashCommands: () => Map<string, unknown>; processInput: (input: string) => Promise<ChatOutput> } {
  const sessionId = options?.sessionId ?? `chat-${Date.now()}`;
  const config = options?.config ?? deps.config;
  
  const ui = createUIRenderer(config);
  const cmdManager = createCommandManager();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'vectahub> ',
  });

  const processInputFn = createREPL(deps, sessionId, rl, ui, cmdManager);

  return {
    start: async () => {
      ui.renderInfo(`Starting chat session: ${sessionId}`);
      rl.prompt();

      rl.on('line', async (line: string) => {
        const input = line.trim();
        if (!input) { rl.prompt(); return; }
        if (['exit', 'quit', 'q'].includes(input.toLowerCase())) { rl.close(); return; }

        try {
          const output = await processInputFn(input);
          ui.render(output);
          if (output.metadata?.exit) { rl.close(); return; }
        } catch (err) {
          ui.renderError(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
        }
        rl.prompt();
      });

      rl.on('close', () => {
        ui.renderInfo('Goodbye!');
        process.exit(0);
      });
    },
    getSlashCommands: () => cmdManager.getAllSlashCommands() as any,
    processInput: processInputFn
  };
}
