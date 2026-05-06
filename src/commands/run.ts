import { Command } from 'commander';
import { createConsoleLogger } from '../utils/logger.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { reviewAndEditCommands } from './command-editor.js';
import { isFirstRun, runFirstRunWizard } from '../setup/first-run-wizard.js';
import { scanCLITools, updateCLIToolConfig } from '../setup/cli-scanner.js';
import { createLLMConfig } from '../nl/llm.js';
import { createNLProcessor, createCoordinator, adaptAllTemplates } from '../nl/core/index.js';
import { createKeywordFallback } from '../nl/core/keyword-fallback.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSkillSystem } from '../skills/init.js';
import type { Workflow, Step, TaskList } from '../types/index.js';

import path from 'node:path';
import fs from 'node:fs';
import { homedir } from 'node:os';

const logger = createConsoleLogger('run');

export const runCmd = new Command('run')
  .description('Run a workflow from natural language or file')
  .argument('[intent...]', 'Natural language description')
  .option('-f, --file <file>', 'Run workflow from YAML/JSON file')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)')
  .option('-s, --save', 'Save workflow after execution')
  .option('-y, --yes', 'Skip confirmation')
  .option('--no-edit', 'Skip command review')
  .option('--dry-run', 'Show what would be executed without running')
  .action(async (intent: string[], options: any) => {
    try {
      if (isFirstRun()) {
        const configured = await runFirstRunWizard();
        if (configured) {
          await scanCLITools();
          updateCLIToolConfig([]);
        }
      }

      let workflow: Workflow | null = null;
      const storage = createStorage();
      const workflowEngine = createWorkflowEngine();
      await workflowEngine.loadWorkflows();

      if (options.file) {
        let filepath = path.resolve(options.file);
        
        if (!fs.existsSync(filepath)) {
          const workflowsDir = path.join(homedir(), '.vectahub', 'workflows');
          const fallbackPath = path.join(workflowsDir, options.file);
          if (fs.existsSync(fallbackPath)) {
            filepath = fallbackPath;
          }
        }
        
        logger.info(`从文件加载工作流: ${filepath}`);
        workflow = await storage.loadWorkflowFromFile(filepath);
        
        if (!workflow) {
          logger.error(`❌ 无法加载工作流文件: ${filepath}`);
          process.exit(1);
        }
        
        logger.info(`✅ 工作流加载成功: ${workflow.name}`);
      } else if (intent.length > 0) {
        const text = intent.join(' ');
        logger.info(`解析意图: "${text}"`);

        const llmConfig = createLLMConfig();
        const useLLM = !!llmConfig;

        if (useLLM) {
          logger.info('使用 LLM 解析意图');
          logger.info(`LLM 配置: provider=${llmConfig?.provider}, model=${llmConfig?.model}, timeout=${llmConfig?.timeout}ms`);
        } else {
          logger.info('LLM 未配置，使用关键词匹配');
        }

        const { registry, executor } = createSkillSystem();
        const patterns = adaptAllTemplates(INTENT_TEMPLATES);
        const coordinator = createCoordinator(patterns);
        const keywordFallback = createKeywordFallback(patterns);
        const nlProcessor = createNLProcessor(
          registry,
          keywordFallback,
          {
            confidenceThreshold: 0.7,
            executor,
            coordinator,
            useNewMatcher: true,
          }
        );

        const nlResult = await nlProcessor.parse({
          input: text,
          options: { useLLM },
        });

        const multiIntent = nlResult.metadata.multiIntent;
        if (multiIntent && multiIntent.isMultiIntent && multiIntent.intents.length > 1) {
          logger.info(`多意图识别 (${multiIntent.intents.length} 个):`);
          for (const intent of multiIntent.intents) {
            logger.info(`  - ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`);
          }
        } else {
          const matchedIntent = nlResult.intent || nlResult.taskList?.intent || 'UNKNOWN';
          const matchPath = nlResult.metadata.path;
          logger.info(`意图: ${matchedIntent} (路径: ${matchPath})`);
        }

        let taskListResult: TaskList | undefined = nlResult.taskList;

        if (!taskListResult) {
          logger.error('❌ 无法解析意图，请尝试更明确的输入！');
          if (nlResult.metadata.fallbackReason) {
            logger.info(`💡 降级原因: ${nlResult.metadata.fallbackReason}`);
          } else {
            logger.info('\n📋 可用的意图示例:');
            logger.info('  - "查找当前目录下的文件"');
            logger.info('  - "显示磁盘使用情况"');
            logger.info('  - "构建项目"');
            logger.info('  - "运行测试"');
            logger.info('  - "查看 git 状态"');
          }
          process.exit(1);
        }

        if (options.edit !== false && !options.dryRun && taskListResult.tasks.length > 0) {
          try {
            taskListResult = await reviewAndEditCommands(taskListResult);
          } catch (error) {
            if (error instanceof Error && error.message === 'User cancelled') {
              logger.info('⏭️  用户取消执行');
              process.exit(0);
            }
            throw error;
          }
        }

        const steps: Array<Step> = [];
        let stepIndex = 1;

        for (const task of taskListResult.tasks) {
          const commands = task.commands.length > 0 ? task.commands : [{ cli: 'echo', args: [] }];
          for (const cmd of commands) {
            steps.push({
              id: `step_${stepIndex}`,
              type: 'exec' as const,
              cli: cmd.cli,
              args: (cmd.args || []).filter((arg): arg is string => arg !== undefined && arg !== ''),
            });
            stepIndex++;
          }
        }

        workflow = await workflowEngine.createWorkflow(
          `intent_${Date.now()}`,
          steps
        );

        logger.info(`创建工作流，包含 ${steps.length} 个步骤`);

        if (options.save) {
          await storage.saveWorkflow(workflow);
          logger.info('工作流已保存');
        }
      } else {
        logger.error('❌ 请提供自然语言描述或使用 --file 选项指定工作流文件');
        process.exit(1);
      }

      logger.info('执行工作流...');
      const mode = options.mode || 'relaxed';
      const result = await workflowEngine.execute(workflow, { mode: mode as any, dryRun: options.dryRun });

      logger.info(`\n执行${result.status === 'COMPLETED' ? '✅ 成功' : '❌ 失败'}`);
      logger.info(`耗时: ${result.duration}ms`);

      if (result.steps.length > 0) {
        logger.info('\n📊 步骤结果:');
        for (const step of result.steps) {
          logger.info(`  ${step.stepId}: ${step.status}`);
          if (step.output && step.output.length > 0) {
            logger.info(`  输出:`);
            for (const line of step.output) {
              logger.info(`    ${String(line).trim()}`);
            }
          }
          if (step.error) {
            logger.error(`  错误: ${step.error}`);
          }
        }
      }

      if (result.status === 'FAILED') {
        process.exit(1);
      }
    } catch (error) {
      logger.error(`错误: ${error instanceof Error ? error.message : '未知错误'}`);
      logger.debug(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    }
  });
