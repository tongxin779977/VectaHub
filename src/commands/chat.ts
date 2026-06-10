import { Command } from 'commander';
import { createLLMConfig } from '../nl/llm.js';
import { initializeRouter, processInputWithTaskContract } from '../nl/orchestrator.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { InfrastructureContext } from '../infrastructure/context.js';
import { CommandBridge } from '../chat/command-bridge.js';
import { createDoctorCmd } from './doctor.js';
import { resolveTaskContractAction } from '../nl/task-contract-runtime.js';

interface ChatCommandOutput {
  log(message: string): void;
  error(message: string): void;
}

const chatCommandOutput: ChatCommandOutput = {
  log: (message: string) => process.stdout.write(`${message}\n`),
  error: (message: string) => process.stderr.write(`${message}\n`),
};

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
          const action = resolveTaskContractAction(envelope, input.trim(), 'vectahub chat');

          switch (action.kind) {
            case 'reply':
              for (const line of action.summaryLines) {
                chatCommandOutput.log(line);
              }
              if (action.reply) {
                chatCommandOutput.log(`\n🤖 VectaHub Expert:\n\n${action.reply}\n`);
              }
              break;
            case 'execute-bridge':
              for (const line of action.summaryLines) {
                chatCommandOutput.log(line);
              }
              {
                const executionOutput = await commandBridge.execute(action.bridgeCommand);
                if (executionOutput.trim()) {
                  chatCommandOutput.log(`\n🤖 VectaHub Expert:\n\n${executionOutput}\n`);
                }
              }
              break;
            case 'execute-continue':
              for (const line of action.summaryLines) {
                chatCommandOutput.log(line);
              }
              chatCommandOutput.log('当前合同需要后续工作流处理，`vectahub chat` 当前不自动执行。');
              break;
            case 'execute-dispatch-feedback':
              chatCommandOutput.log(action.feedback);
              break;
            case 'clarify':
            case 'blocked':
              for (const line of action.summaryLines) {
                chatCommandOutput.log(line);
              }
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
