import { Command } from 'commander';
import { createRepl } from '../chat/repl.js';
import { createContextBuilder } from '../chat/context-builder.js';
import { createSessionManager } from '../nl/session-manager.js';
import { createNLProcessor, createCoordinator, adaptAllTemplates } from '../nl/core/index.js';
import { createKeywordFallback } from '../nl/core/keyword-fallback.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSkillSystem } from '../skills/init.js';
import { createLLMConfig } from '../nl/llm.js';
import { createConsoleLogger } from '../utils/logger.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createCommandDiscovery, createKnowledgeBase, createFailureHandler, createCommandExecutor } from '../nl/index.js';

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

      const llmConfig = createLLMConfig();
      const { registry, executor } = createSkillSystem({ llmConfig });
      const patterns = adaptAllTemplates(INTENT_TEMPLATES);
      const coordinator = createCoordinator(patterns);
      const keywordFallback = createKeywordFallback(patterns);
      const nlProcessor = createNLProcessor(
        registry,
        keywordFallback,
        {
          confidenceThreshold: 0.7,
          executor,
        }
      );

      const workflowEngine = createWorkflowEngine();

      const knowledgeBase = createKnowledgeBase();
      await knowledgeBase.load();

      const commandDiscovery = createCommandDiscovery();
      const failureHandler = createFailureHandler(commandDiscovery, knowledgeBase);
      const commandExecutor = createCommandExecutor(knowledgeBase, failureHandler);

      const deps = {
        nlProcessor,
        contextBuilder,
        sessionManager,
        useLLM,
        workflowEngine,
        commandExecutor,
      };

      const repl = createRepl(deps, { sessionId, sessionManager });
      await repl.start();
    } catch (error) {
      logger.error(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
