import { Command } from 'commander';
import { createWorkflowEngine, type ProgressInfo } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { isFirstRun, loadConfig, saveConfig } from '../setup/first-run-wizard.js';
import { createDefaultInstaller } from '../setup/priority-installer.js';
import { createLLMConfig } from '../nl/llm.js';
import { orchestrateIntent } from '../nl/orchestrator.js';
import { formatDryRunText, formatJsonReport, formatExecutionResultText } from '../nl/capabilities/user-report.js';
import type { Workflow } from '../types/index.js';
import type { ExecutionPlan } from '../nl/capabilities/types.js';
import type { ExecutionMetadata, ExecutionRecord as ExecRecord } from '../execution/types.js';
import { createSystemWorkflows } from '../workflow/system-workflows.js';

import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { createRecordManager } from '../execution/record-manager.js';
import { runSelfHealingLoop } from './self-healing.js';
import { getVectaHubPath } from '../infrastructure/paths/index.js';

function exitWithError(
  logger: ReturnType<InfrastructureContext['logger']['getLogger']>,
  message: string,
  code: string,
  jsonMode?: boolean,
): never {
  if (jsonMode) {
    console.log(JSON.stringify({
      ok: false,
      error: {
        code,
        message
      }
    }, null, 2));
  } else {
    logger.error(message);
  }
  throw new VectaHubError(message, ErrorType.RUNTIME, { code });
}

function restoreEnvValue(context: InfrastructureContext, name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    context.environment.deleteEnv(name);
  } else {
    context.environment.setEnv(name, previousValue);
  }
}

function isValidVariableValue(valueParts: string[]): boolean {
  return valueParts.length > 0 && valueParts.join('=').trim() !== '';
}

function createProgressCallback(totalSteps: number, jsonMode?: boolean): (info: ProgressInfo) => void {
  return (info: ProgressInfo) => {
    if (jsonMode) return;
    const percentage = Math.round((info.currentStep / info.totalSteps) * 100);
    const statusIcon = info.status === 'starting' ? '▶' : info.status === 'completed' ? '✓' : '✗';
    const statusText = info.status === 'starting' ? '执行中' : info.status === 'completed' ? '完成' : '失败';
    const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    // Progress output remains direct for CLI UX, but through environment abstraction eventually
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
  variable?: string[];
}

export function createRunCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('run');

  return new Command('run')
    .description('Run a workflow from natural language or file')
    .argument('[intent...]', 'Natural language description')
    .option('-f, --file <file>', 'Run workflow from YAML/JSON file')
    .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)', 'relaxed')
    .option('-s, --save', 'Save workflow after execution')
    .option('-y, --yes', 'Skip confirmation')
    .option('--no-edit', 'Skip command review')
    .option('--dry-run', 'Show what would be executed without running')
    .option('--json', 'Output results in JSON format')
    .option('--variable <key=value>', 'Pass initial variables to the workflow (multiple allowed)', (val, memo: string[]) => {
      memo.push(val);
      return memo;
    }, [])
    .action(async (intent: string[], options: RunCommandOptions & { json?: boolean }) => {
      const wasMuted = context.logger.isMuted();
      const previousAuditDisabled = context.environment.getEnv('VECTAHUB_AUDIT_DISABLED');
      try {
        if (options.json) {
          context.logger.setMuted(true);
        }

        // Validate mode
        if (options.mode && !['strict', 'relaxed', 'consensus'].includes(options.mode)) {
          exitWithError(logger, `❌ 无效的运行模式: ${options.mode}。可选值为: strict, relaxed, consensus`, 'INVALID_MODE', options.json);
        }

        if (options.dryRun) {
          context.environment.setEnv('VECTAHUB_AUDIT_DISABLED', '1');
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
        let currentPlan: ExecutionPlan | null = null;
        let storage: ReturnType<typeof createStorage> | null = null;
        let workflowEngine: ReturnType<typeof createWorkflowEngine> | null = null;

      const getStorage = (): ReturnType<typeof createStorage> => {
        storage ??= createStorage({ environment: context.environment });
        return storage;
      };

      const getWorkflowEngine = async (): Promise<ReturnType<typeof createWorkflowEngine>> => {
        if (!workflowEngine) {
          workflowEngine = createWorkflowEngine({ audit: context.audit.getHelper(), environment: context.environment });
          await workflowEngine.loadWorkflows();
        }
        return workflowEngine;
      };

      if (options.file) {
        const systemWorkflows = createSystemWorkflows(context.environment);
        if (systemWorkflows[options.file]) {
          logger.info(`加载系统工作流: ${options.file}`);
          workflow = systemWorkflows[options.file];
        } else {
          // 否则尝试从文件加载
          let filepath = context.environment.resolvePath(options.file);
          
          if (!context.environment.exists(filepath)) {
            const workflowsDir = getVectaHubPath('workflows');
            const fallbackPath = context.environment.resolvePath(workflowsDir, options.file);
            if (context.environment.exists(fallbackPath)) {
              filepath = fallbackPath;
            }
          }
          
          logger.info(`从文件加载工作流: ${filepath}`);
          workflow = await getStorage().loadWorkflowFromFile(filepath);
          
          if (!workflow) {
            exitWithError(logger, `❌ 无法加载工作流: ${options.file}`, 'WORKFLOW_LOAD_FAILED', options.json);
          }
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
          restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          return;
        }
      } else if (intent.length > 0) {
        const text = intent.join(' ');
        logger.info(`解析意图: "${text}"`);

        const result = await orchestrateIntent(text, { cwd: context.environment.getCwd() });
        const { steps: orchestrateSteps, plan, intentRecognitionMethod, matchedCapability, score, recognizedIntent } = result;
        
        if (intentRecognitionMethod === 'capability' && plan) {
          logger.info(`能力路由: ${matchedCapability} (score=${score?.toFixed(2)})`);
          currentPlan = plan;

          if (options.dryRun) {
            if (options.json) {
              console.log(JSON.stringify({
                ok: true,
                dryRun: true,
                ...formatJsonReport(plan),
              }, null, 2));
            } else {
              logger.info(formatDryRunText(plan));
            }
            restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
            return;
          }
        } else if (intentRecognitionMethod !== 'none') {
          if (intentRecognitionMethod === 'llm') {
            const llmConfig = createLLMConfig();
            logger.info(`意图解析模式: 优先 LLM (provider=${llmConfig?.provider}, model=${llmConfig?.model})`);
          } else {
            logger.info(`意图解析模式: 规则匹配 (LLM 未配置)`);
          }
          logger.info(`识别到意图: ${recognizedIntent}`);
        }

        if (result.reply) {
          if (options.json) {
            if (orchestrateSteps.length === 0) {
              console.log(JSON.stringify({
                ok: true,
                reply: result.reply,
                intent: recognizedIntent,
              }, null, 2));
              restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
              return;
            }
          } else {
            logger.info(`\n🤖 VectaHub Expert:\n\n${result.reply}\n`);
          }
        }

        if (orchestrateSteps.length === 0) {
          if (result.reply) {
            // 已显示回复，直接退出
            restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
            return;
          }
          exitWithError(logger, '❌ 无法解析意图，请尝试更明确的输入！', 'INTENT_PARSE_FAILED', options.json);
        }

        if (options.dryRun) {
          if (options.json) {
            console.log(JSON.stringify({
              ok: true,
              dryRun: true,
              steps: orchestrateSteps.map(s => ({
                cli: s.cli,
                args: s.args ?? []
              }))
            }, null, 2));
          } else {
            logger.info('\n📋 将要执行的命令:');
            for (const s of orchestrateSteps) {
              logger.info(`  ${s.cli} ${(s.args ?? []).join(' ')}`);
            }
            logger.info('\nDry-run: 未执行任何命令。');
          }
          restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          return;
        }

        workflow = await (await getWorkflowEngine()).createWorkflow(
          `intent_${Date.now()}`,
          orchestrateSteps,
          { persist: options.save === true }
        );

        logger.info(`创建工作流，包含 ${orchestrateSteps.length} 个步骤`);

        if (options.save) {
          logger.info('工作流已保存');
        }
      } else {
        exitWithError(logger, '❌ 请提供自然语言描述或使用 --file 选项指定工作流文件', 'NO_INPUT', options.json);
      }

      // 处理初始变量
      const initialVariables: Record<string, unknown> = {};
      if (options.variable) {
        for (const v of options.variable) {
          const [key, ...valueParts] = v.split('=');
          if (key && isValidVariableValue(valueParts)) {
            initialVariables[key] = valueParts.join('=');
          }
        }
      }

      
      let shouldRetry = true;
      while (shouldRetry) {
        shouldRetry = false;
        logger.info('执行工作流...');
        const result = await (await getWorkflowEngine()).execute(workflow!, { 
          mode: options.mode, 
          dryRun: options.dryRun,
          onProgress: createProgressCallback(workflow!.steps.length, options.json),
        }, initialVariables);

        const recordManager = createRecordManager();
        const metadata: ExecutionMetadata = {
          source: options.file ? 'file' : 'nl',
          nlInput: options.file ? undefined : (intent.length > 0 ? intent.join(' ') : undefined),
          sourceFile: options.file ? context.environment.resolvePath(options.file) : undefined,
          cwd: context.environment.getCwd(),
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

          if (currentPlan) {
            const reportText = formatExecutionResultText(currentPlan, result.steps.map(s => ({
              stepId: s.stepId,
              status: s.status,
              output: s.output?.map(l => String(l)),
              error: s.error,
            })));
            logger.info(`\n${reportText}`);
          } else if (result.steps.length > 0) {
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
          if (llmConfig && !options.dryRun && !options.json && context.environment.getEnv('CI') !== '1') {
            shouldRetry = await runSelfHealingLoop(result, workflow!, llmConfig);
            if (shouldRetry) {
              logger.info('🔄 正在重试工作流...');
              continue;
            }
          }
          restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          throw new VectaHubError('Workflow execution failed', ErrorType.RUNTIME);
        }
        break;
      }
    
      restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
    
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        const stackTrace = error instanceof Error ? error.stack : String(error);
        
        if (options.json) {
          console.log(JSON.stringify({
            ok: false,
            error: {
              code: 'RUNTIME_ERROR',
              message,
              stack: stackTrace
            }
          }, null, 2));
        } else {
          logger.error(`错误: ${message}`);
          logger.debug(stackTrace);
        }
        restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
        throw error;
      } finally {
        context.logger.setMuted(wasMuted);
      }
    });
}

const boundRunCmd: Command | null = null;

export function getRunCmd(): Command {
  if (!boundRunCmd) {
    throw new Error('Run command context is not bound. Use createRunCmd(context) instead.');
  }
  return boundRunCmd;
}

/**
 * @deprecated Legacy static export. Kept for backwards compatibility.
 * Use createRunCmd(context) through composition root instead.
 */
export const runCmd = new Proxy({} as Command, {
  get(target, prop) {
    return Reflect.get(getRunCmd(), prop);
  }
});
