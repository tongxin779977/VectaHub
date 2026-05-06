import { Command } from 'commander';
import { createConsoleLogger } from '../utils/logger.js';
import { createWorkflowEngine, type ProgressInfo } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { reviewAndEditCommands } from './command-editor.js';
import { isFirstRun, loadConfig, saveConfig } from '../setup/first-run-wizard.js';
import { createDefaultInstaller } from '../setup/priority-installer.js';
import { createLLMConfig } from '../nl/llm.js';
import { createNLProcessor, createCoordinator, adaptAllTemplates, createCategoryRouter } from '../nl/core/index.js';
import { createKeywordFallback } from '../nl/core/keyword-fallback.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSkillSystem } from '../skills/init.js';
import type { Workflow, Step, TaskList } from '../types/index.js';
import { IntentCategory } from '../nl/types/category.js';

import path from 'node:path';
import fs from 'node:fs';
import { homedir } from 'node:os';

const logger = createConsoleLogger('run');

function createProgressCallback(totalSteps: number): (info: ProgressInfo) => void {
  return (info: ProgressInfo) => {
    const percentage = Math.round((info.currentStep / info.totalSteps) * 100);
    const statusIcon = info.status === 'starting' ? '▶' : info.status === 'completed' ? '✓' : '✗';
    const statusText = info.status === 'starting' ? '执行中' : info.status === 'completed' ? '完成' : '失败';
    const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    process.stdout.write(`\r[${progressBar}] ${percentage}% | ${statusIcon} 步骤 ${info.currentStep}/${info.totalSteps}: ${info.stepId} (${statusText})`);
    if (info.status === 'completed' || info.status === 'failed') {
      process.stdout.write('\n');
    }
  };
}

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
        logger.info('首次运行，启动优先级安装流程...');
        const installer = createDefaultInstaller();
        if (installer) {
          const summary = await installer.run();
          if (summary.overallSuccess) {
            const config = loadConfig();
            config.first_run_completed = true;
            saveConfig(config);
          } else {
            logger.warn('安装未完全成功，部分功能可能不可用');
          }
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

        const { registry, executor } = createSkillSystem({ llmConfig });
        const patterns = adaptAllTemplates(INTENT_TEMPLATES);
        const coordinator = createCoordinator(patterns);
        const keywordFallback = createKeywordFallback(patterns);
        const categoryRouter = createCategoryRouter();
        const nlProcessor = createNLProcessor(
          registry,
          keywordFallback,
          {
            confidenceThreshold: 0.7,
            executor,
          }
        );

        const nlResult = await nlProcessor.parse({
          input: text,
          options: { useLLM: !!llmConfig },
        });

        const matchedIntent = nlResult.intent || nlResult.taskList?.intent || 'UNKNOWN';
        const requiresLLM = categoryRouter.shouldUseLLM(matchedIntent as any);
        const intentCategory = categoryRouter.getCategory(matchedIntent as any);
        
        logger.info(`意图分类: ${intentCategory} (${categoryRouter.getCategoryDescription(intentCategory)})`);

        const matchPath = nlResult.metadata.path;
        const usedLLM = requiresLLM && !!llmConfig;

        if (usedLLM && llmConfig) {
          logger.info(`意图解析: LLM (provider=${llmConfig.provider}, model=${llmConfig.model})`);
        } else {
          logger.info(`意图解析: 规则匹配`);
        }

        const multiIntent = nlResult.metadata.multiIntent;
        if (multiIntent && multiIntent.primary && multiIntent.secondary && multiIntent.secondary.length > 0) {
          const allIntents = [multiIntent.primary, ...multiIntent.secondary];
          logger.info(`多意图识别 (${allIntents.length} 个):`);
          for (const intent of allIntents) {
            logger.info(`  - ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`);
          }
        } else {
          const matchedIntent = nlResult.intent || nlResult.taskList?.intent || 'UNKNOWN';
          logger.info(`意图: ${matchedIntent}`);
        }

        let taskListResult: TaskList | undefined = nlResult.taskList;

        if (intentCategory === IntentCategory.DIALOG) {
          if (matchedIntent === 'DIALOG_GREETING') {
            logger.info('👋 你好！我是 VectaHub，你的智能工作流助手。');
            logger.info('我可以帮助你执行各种开发任务，例如：');
            logger.info('  - 运行命令: vectahub run "npm test"');
            logger.info('  - 查找文件: vectahub run "查找所有ts文件"');
            logger.info('  - Git操作: vectahub run "git status"');
            logger.info('请问有什么可以帮你的？');
            process.exit(0);
          }
          taskListResult = undefined;
        }

        if (!taskListResult) {
          if (requiresLLM && llmConfig) {
            logger.info(`📝 意图分类为 ${intentCategory}，需要调用 LLM 生成工作流`);
            const { createLLMEnhancedParser } = await import('../nl/llm.js');
            const llmParser = createLLMEnhancedParser(llmConfig);
            try {
              const llmResponse = await llmParser.parse(text);
              
              if (llmResponse.intent === 'UNKNOWN') {
                logger.info('💡 LLM 无法识别操作意图，请描述具体的开发任务。');
                process.exit(1);
              }
              
              if (!llmResponse.workflow?.steps || llmResponse.workflow.steps.length === 0) {
                logger.info(`💡 识别到意图 "${llmResponse.intent}"，但无法生成执行步骤。`);
                logger.info('请尝试更具体的描述或使用已知的模板。');
                process.exit(1);
              }
              
              logger.info('意图解析: LLM 补充解析成功');
              const steps: Step[] = llmResponse.workflow.steps
                .filter(s => s.type === 'exec' && s.cli)
                .map((s, i) => ({
                  id: `step_${i + 1}`,
                  type: 'exec' as const,
                  cli: s.cli!,
                  args: (s.args ?? []).filter((a): a is string => a != null),
                }));
              
              if (steps.length === 0) {
                logger.info(`💡 识别到意图 "${llmResponse.intent}"，但没有可执行的命令步骤。`);
                process.exit(1);
              }
              
              workflow = await workflowEngine.createWorkflow(
                `intent_${Date.now()}`,
                steps
              );
              logger.info(`LLM 生成工作流，包含 ${steps.length} 个步骤`);
              
              if (options.dryRun) {
                logger.info('\n📋 将要执行的命令:');
                for (const s of steps) {
                  logger.info(`  ${s.cli} ${(s.args ?? []).join(' ')}`);
                }
                process.exit(0);
              }
              
              if (options.save) {
                await storage.saveWorkflow(workflow);
              }
              
              logger.info('执行工作流...');
              const mode = options.mode || 'relaxed';
              const result = await workflowEngine.execute(workflow, { 
                mode: mode as any, 
                dryRun: options.dryRun,
                onProgress: createProgressCallback(workflow.steps.length),
              });
              
              logger.info(`\n执行${result.status === 'COMPLETED' ? '✅ 成功' : '❌ 失败'}`);
              logger.info(`耗时: ${result.duration}ms`);
              
              if (result.steps.length > 0) {
                logger.info('\n📊 步骤结果:');
                let hasOutput = false;
                for (const step of result.steps) {
                  logger.info(`  ${step.stepId}: ${step.status}`);
                  if (step.output && step.output.length > 0) {
                    hasOutput = true;
                    logger.info(`  输出:`);
                    for (const line of step.output) {
                      logger.info(`    ${String(line).trim()}`);
                    }
                  }
                  if (step.error) {
                    logger.error(`  错误: ${step.error}`);
                  }
                }
                
                if (!hasOutput && result.status === 'COMPLETED') {
                  logger.info('\n💡 工作流执行成功但没有输出。');
                  logger.info('您可以尝试以下命令：');
                  logger.info('  - vectahub run "列出当前目录"');
                  logger.info('  - vectahub run "npm test"');
                  logger.info('  - vectahub run "git status"');
                }
              }
              
              if (result.status === 'FAILED') {
                process.exit(1);
              }
              process.exit(0);
            } catch {
              logger.error('❌ LLM 响应失败，无法解析意图');
              process.exit(1);
            }
          } else if (requiresLLM && !llmConfig) {
            logger.error(`❌ 意图分类为 ${intentCategory}，需要 LLM 但未配置`);
            logger.info('请配置 LLM 后再试，或使用其他类型的命令');
            process.exit(1);
          }

          logger.error('❌ 无法解析意图，请尝试更明确的输入！');
          if (nlResult.metadata.fallbackReason) {
            logger.info(`💡 降级原因: ${nlResult.metadata.fallbackReason}`);
          }
          logger.info('\n💡 您可能想执行:');
          logger.info('  - vectahub run "git status"');
          logger.info('  - vectahub run "npm test"');
          logger.info('  - vectahub run "列出当前目录文件"');
          logger.info('\n📋 可用模板:');
          logger.info('  - vectahub templates use git-commit');
          logger.info('  - vectahub templates use git-flow');
          logger.info('  - vectahub templates use ci-check');
          logger.info('  - vectahub templates use docker-build');
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
      const result = await workflowEngine.execute(workflow, { 
        mode: mode as any, 
        dryRun: options.dryRun,
        onProgress: createProgressCallback(workflow.steps.length),
      });

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
