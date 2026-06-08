import { Command } from 'commander';
import { createLLMConfig } from '../nl/llm.js';
import { initializeRouter, processInputWithTaskContract } from '../nl/orchestrator.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { InfrastructureContext } from '../infrastructure/context.js';
import { CommandBridge } from '../chat/command-bridge.js';
import { createDoctorCmd } from './doctor.js';
import { presentTaskContract } from '../nl/task-contract-presentation.js';
import { resolveTaskContractCommand } from '../nl/task-contract-strategy.js';
import { createRunDispatch } from './run-dispatch.js';

interface ChatCommandOutput {
  log(message: string): void;
  error(message: string): void;
}

interface RoutedCommand {
  cli?: string;
  args?: string[];
}

const chatCommandOutput: ChatCommandOutput = {
  log: (message: string) => process.stdout.write(`${message}\n`),
  error: (message: string) => process.stderr.write(`${message}\n`),
};

function formatBridgeCommand(command: RoutedCommand): string | null {
  const cli = command.cli?.trim();
  if (!cli) {
    return null;
  }

  const args = command.args ?? [];
  if (cli === 'vectahub') {
    const [subcommand, ...restArgs] = args;
    if (!subcommand?.trim()) {
      return null;
    }
    return [subcommand, ...restArgs].join(' ');
  }

  return [cli, ...args].join(' ');
}

function logDispatchFeedback(result: ReturnType<typeof createRunDispatch>): void {
  if (result.kind === 'blocked') {
    chatCommandOutput.log('任务执行已阻断：当前请求无法通过受支持的内部命令执行。');
    if (result.suggestedAction) {
      chatCommandOutput.log(`建议：${result.suggestedAction}`);
    }
    return;
  }

  if (result.kind === 'direct-command') {
    chatCommandOutput.log('当前任务已识别为本地直接命令。`vectahub chat` 不会通过内部命令桥自动执行这类命令。');
    return;
  }

  if (result.kind === 'agent-task') {
    chatCommandOutput.log('当前任务需要 Agent runtime 才能继续执行。');
    if (result.suggestedAction) {
      chatCommandOutput.log(`建议：${result.suggestedAction}`);
    }
  }
}

/**
 * 聊天命令
 * 用于交互式自然语言模式，支持意图拆分和路由
 */
export const chatCmd = new Command('chat')
  .description('Interactive NL mode with intent splitting and routing')
  .action(async () => {
    const context = new InfrastructureContext();
    const commandProgram = new Command('vectahub');
    commandProgram.addCommand(createDoctorCmd(context));
    const commandBridge = new CommandBridge(commandProgram);
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const prompt = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

    const intentEntries = INTENT_TEMPLATES.map(t => ({
      intent: t.intent,
      category: t.category,
      patterns: t.patterns,
      examples: t.examples,
      priority: t.priority,
    }));

    initializeRouter(intentEntries);

    const llmConfig = createLLMConfig() ?? undefined;

    chatCommandOutput.log('VectaHub NL Chat Mode');
    chatCommandOutput.log('Type your request or "exit" to quit.');
    chatCommandOutput.log('');

    while (true) {
      const input = await prompt('> ');
      if (input.trim().toLowerCase() === 'exit' || input.trim().toLowerCase() === 'quit') {
        break;
      }
      if (!input.trim()) continue;

      try {
        const envelope = await processInputWithTaskContract(
          input.trim(),
          llmConfig,
          context.audit.getHelper(),
          context.logger.getLogger('nl-pipeline'),
        );
        const result = envelope.legacy;
        if (result?.success) {
          const presentation = presentTaskContract(envelope.taskContract);
          for (const line of presentation.summaryLines) {
            chatCommandOutput.log(line);
          }
          switch (envelope.taskContract.kind) {
            case 'reply':
              if (result.reply) {
                chatCommandOutput.log(`\n🤖 VectaHub Expert:\n\n${result.reply}\n`);
              }
              break;
            case 'execute': {
              const dispatch = createRunDispatch({
                text: input.trim(),
                steps: [],
                reply: result.reply,
                taskContract: envelope.taskContract,
              });

              if (!dispatch.executable || dispatch.kind !== 'workflow') {
                logDispatchFeedback(dispatch);
                break;
              }

              const resolvedCommand = resolveTaskContractCommand(envelope.taskContract);
              const commandText = resolvedCommand
                ? (resolvedCommand.cli === 'vectahub'
                  ? formatBridgeCommand({ cli: resolvedCommand.cli, args: resolvedCommand.args })
                  : null)
                : (result.taskList?.tasks?.[0]?.commands?.[0]
                  ? formatBridgeCommand(result.taskList.tasks[0].commands[0])
                  : null);
              if (commandText) {
                const executionOutput = await commandBridge.execute(commandText);
                if (executionOutput.trim()) {
                  chatCommandOutput.log(`\n🤖 VectaHub Expert:\n\n${executionOutput}\n`);
                }
              }
              break;
            }
            case 'clarify':
            case 'blocked':
              break;
          }
          if (result.metadata.usedSkills?.length) {
            chatCommandOutput.log(`Skills: ${result.metadata.usedSkills.join(', ')}`);
          }
        } else if (!result) {
          throw new Error('Task contract envelope did not include legacy NL result');
        } else {
          chatCommandOutput.log(`No match: ${result.confidence}`);
        }
      } catch (err) {
        chatCommandOutput.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    rl.close();
    chatCommandOutput.log('Chat session ended.');
  });
