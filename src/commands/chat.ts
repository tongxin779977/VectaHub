import { Command } from 'commander';
import { createRepl } from '../chat/repl.js';
import { createContextBuilder } from '../chat/context-builder.js';
import { createSessionManager } from '../nl/session-manager.js';
import { createNLProcessor, createCoordinator, adaptAllTemplates } from '../nl/core/index.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSkillSystem } from '../skills/init.js';
import { createLLMConfig } from '../nl/llm.js';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('chat');

export const chatCmd = new Command('chat')
  .description('Start interactive chat session')
  .option('-s, --session <name>', 'Session name for context persistence')
  .option('--no-llm', 'Disable LLM path, use keyword matching only')
  .action(async (options) => {
    try {
      const sessionId = options.session ?? `chat-${Date.now()}`;
      const useLLM = options.llm !== false;

      logger.info(`Starting chat session: ${sessionId}`);

      const sessionManager = createSessionManager();
      sessionManager.createSession(sessionId);

      const contextBuilder = createContextBuilder(sessionManager);

      const { registry, executor } = createSkillSystem();
      const coordinator = createCoordinator(adaptAllTemplates(INTENT_TEMPLATES));
      const llmConfig = createLLMConfig();

      const nlProcessor = createNLProcessor(
        registry,
        { parse: async () => ({ success: false, intent: 'UNKNOWN' as const, confidence: 0, metadata: { path: 'keyword-fallback' as const } }) },
        {
          confidenceThreshold: 0.7,
          executor,
          coordinator,
          useNewMatcher: true,
        }
      );

      const deps = {
        nlProcessor,
        contextBuilder,
        config: {
          prompt: 'vectahub> ',
          historyLimit: 50,
          sessionDir: `${process.env.HOME ?? '~'}/.vectahub/sessions`,
        },
      };

      const repl = createRepl(deps, { sessionId, sessionManager });
      await repl.start();
    } catch (error) {
      logger.error(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
