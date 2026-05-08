import { Command } from 'commander';
import { createRepl } from '../chat/repl.js';
import type { REPLDeps } from '../chat/types.js';
import { createContextBuilder } from '../chat/context-builder.js';
import { createCommandBridge } from '../chat/command-bridge.js';
import { createParamExtractor } from '../nl/param-extractor.js';
import { createSessionManager } from '../nl/session-manager.js';
import { createNLProcessor, createCoordinator, adaptAllTemplates } from '../nl/core/index.js';
import { createKeywordFallback } from '../nl/core/keyword-fallback.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSkillSystem } from '../skills/init.js';
import { createLLMConfig } from '../nl/llm.js';
import { createConsoleLogger } from '../utils/logger.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createCommandDiscovery, createKnowledgeBase, createFailureHandler, createCommandExecutor } from '../nl/index.js';
import { ChatConfig, defaultConfig } from '../chat/config.js';

const logger = createConsoleLogger('chat');

export const chatCmd = new Command('chat')
  .description('Start interactive chat session')
  .option('-s, --session <name>', 'Session name for context persistence')
  .option('--no-llm', 'Disable LLM path, use keyword matching only')
  .option('--log-level <level>', '日志级别: quiet|normal|verbose|debug', defaultConfig.logLevel)
  .option('--execute-mode <mode>', '执行模式: manual|confirm|auto', defaultConfig.executeMode)
  .option('--show-yaml', '显示工作流 YAML', defaultConfig.showWorkflowYAML)
  .option('--hide-steps', '隐藏步骤列表')
  .option('--no-cmd-bridge', '禁用命令桥接')
  .option('--no-skill-scan', '禁用 Skill 扫描')
  .option('-v, --verbose', '详细输出模式')
  .option('--debug', '调试模式')
  .action(async (options) => {
    try {
      const sessionId = options.session ?? `chat-${Date.now()}`;
      const useLLM = options.llm !== false;

      const config: ChatConfig = {
        ...defaultConfig,
        logLevel: options.logLevel || defaultConfig.logLevel,
        executeMode: options.executeMode || defaultConfig.executeMode,
        showWorkflowYAML: options.showYaml || defaultConfig.showWorkflowYAML,
        showWorkflowSteps: options.hideSteps === undefined ? defaultConfig.showWorkflowSteps : !options.hideSteps,
        enableCommandBridge: options.noCmdBridge === undefined ? defaultConfig.enableCommandBridge : !options.noCmdBridge,
        enableSkillScan: options.noSkillScan === undefined ? defaultConfig.enableSkillScan : !options.noSkillScan,
      };

      if (options.verbose) {
        config.logLevel = 'verbose';
      }
      if (options.debug) {
        config.logLevel = 'debug';
      }

      logger.info(`Starting chat session: ${sessionId}`);
      logger.debug(`Chat config: ${JSON.stringify(config)}`);

      const sessionManager = createSessionManager();
      sessionManager.createSession(sessionId);

      const contextBuilder = createContextBuilder(sessionManager);

      const llmConfig = createLLMConfig();
      const { registry, executor } = await createSkillSystem({ llmConfig });
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

      // Get the main Commander program instance
      const mainProgram = chatCmd.parent as Command;
      const commandBridge = createCommandBridge(mainProgram);
      const paramExtractor = createParamExtractor(); // Create paramExtractor

      const deps: REPLDeps = {
        nlProcessor,
        contextBuilder,
        sessionManager,
        useLLM,
        llmConfig, // Add llmConfig here
        workflowEngine,
        commandExecutor,
        config,
        commandBridge,
        paramExtractor, // Add paramExtractor here
      };

      const repl = createRepl(deps, { sessionId, sessionManager, config });
      await repl.start();
    } catch (error) {
      logger.error(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
