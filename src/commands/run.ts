import { Command } from 'commander';
import { createConsoleLogger } from '../utils/logger.js';
import { createWorkflowEngine, type ProgressInfo } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { isFirstRun, loadConfig, saveConfig } from '../setup/first-run-wizard.js';
import { createDefaultInstaller } from '../setup/priority-installer.js';
import { createLLMConfig } from '../nl/llm.js';
import { createNLProcessor, adaptAllTemplates } from '../nl/core/index.js';
import { createKeywordFallback } from '../nl/core/keyword-fallback.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';
import { createSkillSystem } from '../skills/init.js';
import type { Workflow, Step } from '../types/index.js';
import type { ExecutionMetadata, ExecutionRecord as ExecRecord } from '../execution/types.js';

import path from 'node:path';
import fs from 'node:fs';
import { createRecordManager } from '../execution/record-manager.js';
import { runSelfHealingLoop } from './self-healing.js';
import { getVectaHubPath } from '../utils/paths.js';

const logger = createConsoleLogger('run');

function restoreEnvValue(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}

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

interface RunCommandOptions {
  file?: string;
  mode?: 'strict' | 'relaxed' | 'consensus';
  save?: boolean;
  yes?: boolean;
  edit?: boolean;
  dryRun?: boolean;
}

export const runCmd = new Command('run')
  .description('Run a workflow from natural language or file')
  .argument('[intent...]', 'Natural language description')
  .option('-f, --file <file>', 'Run workflow from YAML/JSON file')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)', 'relaxed')
  .option('-s, --save', 'Save workflow after execution')
  .option('-y, --yes', 'Skip confirmation')
  .option('--no-edit', 'Skip command review')
  .option('--dry-run', 'Show what would be executed without running')
  .option('--json', 'Output results in JSON format')
  .action(async (intent: string[], options: RunCommandOptions & { json?: boolean }) => {
    try {
      // Validate mode
      if (options.mode && !['strict', 'relaxed', 'consensus'].includes(options.mode)) {
        logger.error(`❌ 无效的运行模式: ${options.mode}。可选值为: strict, relaxed, consensus`);
        process.exit(1);
      }

      const previousAuditDisabled = process.env.VECTAHUB_AUDIT_DISABLED;
      if (options.dryRun) {
        process.env.VECTAHUB_AUDIT_DISABLED = '1';
      }

      if (!options.dryRun && isFirstRun()) {
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
      let storage: ReturnType<typeof createStorage> | null = null;
      let workflowEngine: ReturnType<typeof createWorkflowEngine> | null = null;

      const getStorage = (): ReturnType<typeof createStorage> => {
        storage ??= createStorage();
        return storage;
      };

      const getWorkflowEngine = async (): Promise<ReturnType<typeof createWorkflowEngine>> => {
        if (!workflowEngine) {
          workflowEngine = createWorkflowEngine();
          await workflowEngine.loadWorkflows();
        }
        return workflowEngine;
      };

      if (options.file) {
        let filepath = path.resolve(options.file);
        
        if (!fs.existsSync(filepath)) {
          const workflowsDir = getVectaHubPath('workflows');
          const fallbackPath = path.join(workflowsDir, options.file);
          if (fs.existsSync(fallbackPath)) {
            filepath = fallbackPath;
          }
        }
        
        logger.info(`从文件加载工作流: ${filepath}`);
        workflow = await getStorage().loadWorkflowFromFile(filepath);
        
        if (!workflow) {
          logger.error(`❌ 无法加载工作流文件: ${filepath}`);
          process.exit(1);
        }
        
        logger.info(`✅ 工作流加载成功: ${workflow.name}`);

        if (options.dryRun) {
          if (options.json) {
            console.log(JSON.stringify({
              ok: true,
              dryRun: true,
              workflow: {
                name: workflow.name,
                steps: workflow.steps.map(s => ({
                  cli: s.cli || s.type,
                  args: s.args ?? []
                }))
              }
            }, null, 2));
          } else {
            logger.info('\n📋 将要执行的命令:');
            for (const step of workflow.steps) {
              logger.info(`  ${step.cli || step.type} ${(step.args ?? []).join(' ')}`);
            }
            logger.info('\nDry-run: 未执行任何命令。');
          }
          restoreEnvValue('VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          process.exit(0);
          return;
        }
      } else if (intent.length > 0) {
        const text = intent.join(' ');
        logger.info(`解析意图: "${text}"`);

        const llmConfig = createLLMConfig();
        const useLLM = !!llmConfig;

        const { registry, executor } = await createSkillSystem({ llmConfig });
        const patterns = adaptAllTemplates(INTENT_TEMPLATES);
        const keywordFallback = createKeywordFallback(patterns);
        const nlProcessor = createNLProcessor(registry, keywordFallback, { 
          confidenceThreshold: 0.7, 
          executor,
          llmConfig
        });

        if (useLLM) {
          logger.info(`意图解析模式: 优先 LLM (provider=${llmConfig.provider}, model=${llmConfig.model})`);
        } else {
          logger.info(`意图解析模式: 规则匹配 (LLM 未配置)`);
        }

        const nlResult = await nlProcessor.parse({ 
          input: text, 
          options: { useLLM } 
        });

        let steps: Step[] = [];

        if (nlResult.success && nlResult.taskList && nlResult.taskList.tasks.length > 0) {
          logger.info(`识别到意图: ${nlResult.intent || nlResult.taskList.intent}`);
          let stepIndex = 1;
          for (const task of nlResult.taskList.tasks) {
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
        }

        if (steps.length === 0) {
          logger.error('❌ 无法解析意图，请尝试更明确的输入！');
          process.exit(1);
        }

        if (options.dryRun) {
          if (options.json) {
            console.log(JSON.stringify({
              ok: true,
              dryRun: true,
              intent: nlResult.intent || nlResult.taskList?.intent,
              steps: steps.map(s => ({
                cli: s.cli,
                args: s.args ?? []
              }))
            }, null, 2));
          } else {
            logger.info('\n📋 将要执行的命令:');
            for (const s of steps) {
              logger.info(`  ${s.cli} ${(s.args ?? []).join(' ')}`);
            }
            logger.info('\nDry-run: 未执行任何命令。');
          }
          restoreEnvValue('VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          process.exit(0);
          return;
        }

        workflow = await (await getWorkflowEngine()).createWorkflow(
          `intent_${Date.now()}`,
          steps
        );

        logger.info(`创建工作流，包含 ${steps.length} 个步骤`);

        if (options.save) {
          await getStorage().saveWorkflow(workflow);
          logger.info('工作流已保存');
        }
      } else {
        logger.error('❌ 请提供自然语言描述或使用 --file 选项指定工作流文件');
        process.exit(1);
      }

      
      let shouldRetry = true;
      while (shouldRetry) {
        shouldRetry = false;
        logger.info('执行工作流...');
        const result = await (await getWorkflowEngine()).execute(workflow!, { 
          mode: options.mode, 
          dryRun: options.dryRun,
          onProgress: createProgressCallback(workflow!.steps.length),
        });

        const recordManager = createRecordManager();
        const metadata: ExecutionMetadata = {
          source: options.file ? 'file' : 'nl',
          nlInput: options.file ? undefined : (intent.length > 0 ? intent.join(' ') : undefined),
          sourceFile: options.file ? path.resolve(options.file) : undefined,
          cwd: process.cwd(),
        };
        const recordToSave: Record<string, unknown> = { ...result };
        recordToSave.startedAt = (recordToSave.startedAt as Date).toISOString();
        if (recordToSave.endedAt) {
          recordToSave.endedAt = (recordToSave.endedAt as Date).toISOString();
        }
        recordToSave.metadata = metadata as unknown as Record<string, unknown>;
        await recordManager.save(recordToSave as unknown as ExecRecord);

        if (options.json) {
          console.log(JSON.stringify({
            ok: result.status === 'COMPLETED',
            status: result.status,
            duration: result.duration,
            steps: result.steps.map(s => ({
              stepId: s.stepId,
              status: s.status,
              output: s.output,
              error: s.error
            }))
          }, null, 2));
        } else {
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
        }

        if (result.status === 'FAILED') {
          const llmConfig = createLLMConfig();
          if (llmConfig && !options.dryRun) {
            shouldRetry = await runSelfHealingLoop(result, workflow!, llmConfig);
            if (shouldRetry) {
              logger.info('🔄 正在重试工作流...');
              continue;
            }
          }
          process.exit(1);
        }
        break;
      }
    
    } catch (error) {
      logger.error(`错误: ${error instanceof Error ? error.message : '未知错误'}`);
      logger.debug(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    }
  });
