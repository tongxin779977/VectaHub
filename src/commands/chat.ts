import { Command } from 'commander';
import { createLLMConfig } from '../nl/llm.js';
import { initializeRouter, processInput } from '../nl/orchestrator.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { InfrastructureContext } from '../infrastructure/context.js';

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
        const result = await processInput(
          input.trim(),
          llmConfig,
          context.audit.getHelper(),
          context.logger.getLogger('nl-pipeline'),
        );
        if (result.success) {
          chatCommandOutput.log(`Intent: ${result.intent ?? 'none'} (confidence: ${result.confidence})`);
          if (result.taskList) {
            for (const task of result.taskList.tasks) {
              chatCommandOutput.log(`  - ${task.description}`);
            }
          }
          if (result.reply) {
            chatCommandOutput.log(`\n🤖 VectaHub Expert:\n\n${result.reply}\n`);
          }
          if (result.metadata.usedSkills?.length) {
            chatCommandOutput.log(`Skills: ${result.metadata.usedSkills.join(', ')}`);
          }
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
