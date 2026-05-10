import { Command } from 'commander';
import { initializeRouter, processInput } from '../nl/orchestrator.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import type { LLMConfig } from '../nl/llm.js';

export const chatCmd = new Command('chat')
  .description('Interactive NL mode with intent splitting and routing')
  .action(async () => {
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

    const llmConfig: LLMConfig = {
      provider: (process.env.LLM_PROVIDER as LLMConfig['provider']) ?? 'openai',
      model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
    };

    console.log('VectaHub NL Chat Mode');
    console.log('Type your request or "exit" to quit.');
    console.log('');

    let running = true;
    while (running) {
      const input = await prompt('> ');
      if (input.trim().toLowerCase() === 'exit' || input.trim().toLowerCase() === 'quit') {
        running = false;
        break;
      }
      if (!input.trim()) continue;

      try {
        const result = await processInput(input.trim(), llmConfig);
        if (result.success) {
          console.log(`Intent: ${result.intent ?? 'none'} (confidence: ${result.confidence})`);
          if (result.taskList) {
            for (const task of result.taskList.tasks) {
              console.log(`  - ${task.description}`);
            }
          }
          if (result.metadata.usedSkills?.length) {
            console.log(`Skills: ${result.metadata.usedSkills.join(', ')}`);
          }
        } else {
          console.log(`No match: ${result.confidence}`);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    rl.close();
    console.log('Chat session ended.');
  });
