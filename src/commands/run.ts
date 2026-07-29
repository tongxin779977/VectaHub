import { Command } from 'commander';
import { createWorkflowEngine, type ProgressInfo } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { isFirstRun, loadConfig, saveConfig } from '../setup/first-run-wizard.js';
import { createDefaultInstaller } from '../setup/priority-installer.js';
import { orchestrateIntent } from '../nl/orchestrator.js';
import { formatDryRunText, formatExecutionResultText } from '../nl/capabilities/user-report.js';
import type { Workflow } from '../types/index.js';
import type { ExecutionPlan } from '../nl/capabilities/types.js';
import type { ExecutionMetadata, ExecutionRecord as ExecRecord } from '../execution/types.js';
import { createSystemWorkflows } from '../workflow/system-workflows.js';

import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { markCliOutputHandled } from '../infrastructure/cli-output.js';
import { createRecordManager } from '../execution/record-manager.js';
import { createRunDispatch, formatRunDispatchText } from './run-dispatch.js';
import { interpolateStep, type InterpolationContext } from '../workflow/interpolation.js';
import { resolveRunTaskContract } from './run-task-contract-resolver.js';
import { writeAgentTaskContractFile } from './agent-task-contract-file.js';
import { resolveTaskContractAction, buildDispatchFeedbackText, type TaskContractAction } from '../nl/task-contract-runtime.js';
import {
  buildReplyEnvelope,
  buildClarifyEnvelope,
  buildBlockedEnvelope,
  buildPlanEnvelope,
  buildWorkflowDraftEnvelope,
  buildStepsEnvelope,
  getModeDescription,
  type CliMode,
} from './run-dry-run-envelope.js';
import {
  buildValidationErrorResponse,
} from '../machine-response/index.js';
import { stepsToWorkflowDraft, workflowToDraft } from '../orchestration-plan/workflow-draft-adapter.js';
import { buildNLRequestEnvelope } from '../nl/core/input-normalizer.js';
import { validateNLRequestEnvelope } from '../nl/core/nl-request-validator.js';

interface RunCommandOutput {
  json(payload: unknown, options?: { space?: number }): void;
  write(message: string): void;
}

function createRunCommandOutput(): RunCommandOutput {
  return {
    json(payload: unknown, options?: { space?: number }): void {
      process.stdout.write(`${JSON.stringify(payload, null, options?.space ?? 2)}\n`);
    },
    write(message: string): void {
      process.stdout.write(message);
    },
  };
}

function exitWithError(
  logger: ReturnType<InfrastructureContext['logger']['getLogger']>,
  output: RunCommandOutput,
  message: string,
  code: string,
  jsonMode?: boolean,
): never {
  if (jsonMode) {
    output.json(buildValidationErrorResponse(message, [code]));
  } else {
    logger.error(message);
  }
  const error = new VectaHubError(message, ErrorType.RUNTIME, { code });
  throw markCliOutputHandled(error);
}

function restoreEnvValue(context: InfrastructureContext, name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    context.environment.deleteEnv(name);
  } else {
    context.environment.setEnv(name, previousValue);
  }
}

interface PresentOptions {
  dryRun?: boolean;
  json?: boolean;
  recognizedIntent?: string;
}

class TaskContractUiPresenter {
  constructor(
    private logger: ReturnType<InfrastructureContext['logger']['getLogger']>,
    private output: RunCommandOutput,
  ) {}

  public present(tcAction: TaskContractAction, options: PresentOptions): void {
    if (options.json) {
      this.presentJson(tcAction, options);
    } else {
      this.presentConsole(tcAction, options);
    }
  }

  private presentJson(tcAction: TaskContractAction, options: PresentOptions): void {
    if (options.dryRun) {
      if (tcAction.kind === 'reply') {
        this.output.json(buildReplyEnvelope(tcAction.reply ?? '', options.recognizedIntent));
      } else if (tcAction.kind === 'clarify') {
        this.output.json(buildClarifyEnvelope(tcAction.question));
      } else if (tcAction.kind === 'blocked') {
        this.output.json(buildBlockedEnvelope(tcAction.reason, { kind: 'blocked', executable: false, reason: tcAction.reason }));
      } else if (tcAction.kind === 'execute-dispatch-feedback') {
        this.output.json(buildBlockedEnvelope(tcAction.feedback, tcAction.dispatch));
      } else {
        this.output.json(buildBlockedEnvelope('', { kind: 'blocked', executable: false, reason: '' }));
      }
    } else {
      if (tcAction.kind === 'reply') {
        this.output.json({ ok: true, reply: tcAction.reply, intent: options.recognizedIntent });
      } else if (tcAction.kind === 'clarify') {
        this.output.json({ ok: false, reason: tcAction.question });
      } else {
        const dispatch = tcAction.kind === 'execute-dispatch-feedback' ? tcAction.dispatch : undefined;
        const reason = tcAction.kind === 'execute-dispatch-feedback' ? tcAction.feedback : '';
        this.output.json({ ok: false, reason, ...(dispatch ? { dispatch } : {}) });
      }
    }
  }

  private presentConsole(tcAction: TaskContractAction, options: PresentOptions): void {
    if (tcAction.kind === 'reply') {
      this.logger.info(`\n🤖 VectaHub Expert:\n\n${tcAction.reply}\n`);
    } else if (tcAction.kind === 'clarify') {
      if (options.dryRun) {
        for (const line of tcAction.summaryLines) {
          this.logger.info(line);
        }
      } else {
        exitWithError(this.logger, this.output, '❌ 无法解析意图，请尝试更明确的输入！', 'INTENT_PARSE_FAILED', options.json);
      }
    } else {
      if (options.dryRun) {
        for (const line of tcAction.summaryLines) {
          this.logger.info(line);
        }
      } else {
        if (tcAction.kind === 'execute-dispatch-feedback') {
          this.logger.info(`\n${tcAction.feedback}`);
        } else {
          for (const line of tcAction.summaryLines) {
            this.logger.info(line);
          }
        }
      }
    }

    if (options.dryRun) {
      this.logger.info('\nDry-run: 未执行任何命令。');
    }
  }
}

function convertDateToString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

interface WorkflowExecutionRecord {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  mode: string;
  startedAt: Date | string;
  endedAt?: Date | string;
  duration?: number;
  steps: unknown[];
  warnings: string[];
  logs: string[];
}

function normalizeStepRecord(step: Record<string, unknown>): Record<string, unknown> {
  return {
    stepId: step.stepId,
    stepName: step.stepName || step.stepId,
    command: step.command || '',
    status: step.status,
    startedAt: step.startAt ? convertDateToString(step.startAt) : undefined,
    finishedAt: step.endAt ? convertDateToString(step.endAt) : undefined,
    duration: step.duration ?? (step.startAt && step.endAt
      ? new Date(step.endAt as string | Date).getTime() - new Date(step.startAt as string | Date).getTime()
      : undefined),
    exitCode: step.exitCode,
    output: Array.isArray(step.output) ? step.output.map(String).join('\n') : step.output,
    error: step.error,
  };
}

function normalizeExecutionRecord(record: WorkflowExecutionRecord, metadata: ExecutionMetadata): ExecRecord {
  const normalizedSteps = (record.steps as Record<string, unknown>[]).map(normalizeStepRecord);
  return {
    ...record,
    startedAt: convertDateToString(record.startedAt),
    finishedAt: record.endedAt ? convertDateToString(record.endedAt) : undefined,
    steps: normalizedSteps,
    metadata,
  } as unknown as ExecRecord;
}

function isValidVariableValue(valueParts: string[]): boolean {
  return valueParts.length > 0 && valueParts.join('=').trim() !== '';
}

function buildInitialVariables(variableOption?: string[]): Record<string, unknown> {
  const initialVariables: Record<string, unknown> = {};
  if (variableOption) {
    for (const v of variableOption) {
      const [key, ...valueParts] = v.split('=');
      if (key && isValidVariableValue(valueParts)) {
        initialVariables[key] = valueParts.join('=');
      }
    }
  }
  return initialVariables;
}

function toInterpolationContext(initialVariables: Record<string, unknown>): InterpolationContext {
  const variables: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(initialVariables)) {
    if (Array.isArray(value)) {
      variables[key] = value.map(String);
    } else {
      variables[key] = [String(value)];
    }
  }
  return { variables, previousOutputs: {} };
}

function createProgressCallback(totalSteps: number, output: RunCommandOutput, jsonMode?: boolean): (info: ProgressInfo) => void {
  return (info: ProgressInfo) => {
    if (jsonMode) return;
    const percentage = Math.round((info.currentStep / info.totalSteps) * 100);
    const statusIcon = info.status === 'starting' ? '▶' : info.status === 'completed' ? '✓' : '✗';
    const statusText = info.status === 'starting' ? '执行中' : info.status === 'completed' ? '完成' : '失败';
    const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    output.write(`\r[${progressBar}] ${percentage}% | ${statusIcon} 步骤 ${info.currentStep}/${info.totalSteps}: ${info.stepId} (${statusText})`);
    if (info.status === 'completed' || info.status === 'failed') {
      output.write('\n');
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

/**
 * 创建运行命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createRunCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('run');
  const output = createRunCommandOutput();
  const firstRunWizardDeps = {
    environment: context.environment,
    logger: context.logger.getLogger('setup'),
  };

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
          exitWithError(logger, output, `❌ 无效的运行模式: ${options.mode}。可选值为: strict, relaxed, consensus`, 'INVALID_MODE', options.json);
        }

        if (options.dryRun) {
          context.environment.setEnv('VECTAHUB_AUDIT_DISABLED', '1');
        }

        if (!options.dryRun && isFirstRun(firstRunWizardDeps)) {
          logger.info('首次运行，启动优先级安装流程...');
          const installer = createDefaultInstaller(context);
          if (installer) {
            const summary = await installer.run();
            if (summary.overallSuccess) {
              const config = loadConfig(firstRunWizardDeps);
              config.first_run_completed = true;
              saveConfig(config, firstRunWizardDeps);
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
        storage ??= createStorage({ environment: context.environment, logger });
        return storage;
      };

      const getWorkflowEngine = async (): Promise<ReturnType<typeof createWorkflowEngine>> => {
        if (!workflowEngine) {
          workflowEngine = createWorkflowEngine({
            audit: context.audit.getHelper(),
            environment: context.environment,
            logger,
          });
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
            const workflowsDir = context.environment.getPath('workflows');
            const fallbackPath = context.environment.resolvePath(workflowsDir, options.file);
            if (context.environment.exists(fallbackPath)) {
              filepath = fallbackPath;
            }
          }
          
          logger.info(`从文件加载工作流: ${filepath}`);
          workflow = await getStorage().loadWorkflowFromFile(filepath);
          
          if (!workflow) {
            exitWithError(logger, output, `❌ 无法加载工作流: ${options.file}`, 'WORKFLOW_LOAD_FAILED', options.json);
          }
        }
        
        logger.info(`✅ 工作流加载成功: ${workflow.name}`);

        if (options.dryRun) {
          const interpolationCtx = toInterpolationContext(buildInitialVariables(options.variable));
          const interpolatedSteps = workflow.steps.map(s => interpolateStep(s, interpolationCtx));
          const mode = options.mode || 'relaxed';
          if (options.json) {
            const { draft } = workflowToDraft(
              { name: workflow.name, steps: interpolatedSteps },
              { mode: mode as CliMode },
            );
            output.json(buildWorkflowDraftEnvelope(draft, mode));
          } else {
            logger.info(`\n📋 将要执行的命令 (模式: ${mode}):`);
            for (const step of interpolatedSteps) {
              logger.info(`  ${step.cli || step.type} ${(step.args ?? []).join(' ')}`);
            }
            logger.info(`\n⚙️ ${getModeDescription(mode as CliMode)}`);
            logger.info('\nDry-run: 未执行任何命令。');
          }
          restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          return;
        }
      } else if (intent.length > 0) {
        const text = intent.join(' ');

        // Build and validate NL request envelope as contract boundary
        const requestEnvelope = buildNLRequestEnvelope({
          source: 'run',
          mode: options.dryRun ? 'dry-run' : 'execute',
          dryRun: !!options.dryRun,
          json: !!options.json,
          cwd: context.environment.getCwd(),
          userInput: text,
        });

        const requestValidation = validateNLRequestEnvelope(requestEnvelope);
        if (!requestValidation.valid) {
          const errorDetails = requestValidation.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
          exitWithError(logger, output, `❌ NL request validation failed: ${errorDetails}`, 'INVALID_REQUEST', options.json);
        }

        logger.info(`解析意图: "${text}"`);

        const result = await orchestrateIntent(text, {
          cwd: requestEnvelope.cwd,
          auditHelper: context.audit.getHelper(),
          logger,
        });
        const { steps: orchestrateSteps, plan, intentRecognitionMethod, matchedCapability, score, recognizedIntent } = result;

        // doc-task-edit 在 TaskContract 之前前置检查
        const preliminaryDispatch = createRunDispatch({
          text,
          steps: orchestrateSteps,
          reply: result.reply,
        });
        if (preliminaryDispatch.kind === 'doc-task-edit') {
          if (options.dryRun) {
            if (options.json) {
              output.json(buildClarifyEnvelope(preliminaryDispatch.reason, preliminaryDispatch));
            } else {
              logger.info(`\n${formatRunDispatchText(preliminaryDispatch)}`);
              logger.info('\nDry-run: 未执行任何命令。');
            }
          } else if (options.json) {
            output.json({ ok: false, dispatch: preliminaryDispatch });
          } else {
            logger.info(`\n${formatRunDispatchText(preliminaryDispatch)}`);
          }
          restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          return;
        }

        // TaskContract-first 路由
        const envelope = resolveRunTaskContract(result, text);
        const tcAction = resolveTaskContractAction(envelope, text, 'run');

        if (!options.dryRun && tcAction.kind === 'execute-dispatch-feedback' && tcAction.dispatch.kind === 'agent-task' && envelope.taskContract.kind === 'execute') {
          const generated = writeAgentTaskContractFile(context, envelope.taskContract);
          tcAction.dispatch.suggestedAction = generated.suggestedAction;
          tcAction.feedback = buildDispatchFeedbackText(tcAction.summaryLines, tcAction.dispatch, 'run');
        }

        if (tcAction.kind !== 'execute-continue' && tcAction.kind !== 'execute-bridge') {
          const presenter = new TaskContractUiPresenter(logger, output);
          presenter.present(tcAction, {
            dryRun: options.dryRun,
            json: options.json,
            recognizedIntent,
          });
          restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          return;
        }

        // execute-bridge: 使用合同命令，不回退到 legacy steps
        if (tcAction.kind === 'execute-bridge') {
          const bridgeArgs = tcAction.bridgeCommand.split(/\s+/);
          const bridgeSteps = [{
            id: 'bridge_step',
            description: `vectahub ${tcAction.bridgeCommand}`,
            status: 'PENDING',
            cli: 'vectahub',
            args: bridgeArgs,
            type: 'exec' as const,
          }];

          if (options.dryRun) {
            const interpolationCtx = toInterpolationContext(buildInitialVariables(options.variable));
            const interpolatedSteps = bridgeSteps.map(s => interpolateStep(s, interpolationCtx));
            const mode = options.mode || 'relaxed';
            if (options.json) {
              const { draft } = stepsToWorkflowDraft(
                interpolatedSteps.map(s => ({ cli: s.cli || 'vectahub', args: s.args ?? [] })),
                { mode: mode as CliMode },
              );
              output.json(buildStepsEnvelope(draft, mode));
            } else {
              logger.info(`\n📋 将要执行的命令 (模式: ${mode}):`);
              for (const s of interpolatedSteps) {
                logger.info(`  ${s.cli} ${(s.args ?? []).join(' ')}`);
              }
              logger.info(`\n⚙️ ${getModeDescription(mode as CliMode)}`);
              logger.info('\nDry-run: 未执行任何命令。');
            }
            restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
            return;
          }

          // 非 dry-run：创建 workflow 后进入执行流程
          workflow = await (await getWorkflowEngine()).createWorkflow(
            `intent_${Date.now()}`,
            bridgeSteps,
            { persist: options.save === true }
          );
          logger.info(`创建工作流，包含 ${bridgeSteps.length} 个步骤`);
          if (options.save) {
            logger.info('工作流已保存');
          }
        } else {
          // execute-continue: 回退到 legacy workflow 逻辑
        
        if (intentRecognitionMethod === 'capability' && plan) {
          logger.info(`能力路由: ${matchedCapability} (score=${score?.toFixed(2)})`);
          currentPlan = plan;

          if (options.dryRun) {
            const mode = options.mode || 'relaxed';
            if (options.json) {
              output.json(buildPlanEnvelope(plan, undefined, mode));
            } else {
              logger.info(formatDryRunText(plan));
              logger.info(`\n⚙️ ${getModeDescription(mode as CliMode)}`);
            }
            restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
            return;
          }
        } else if (intentRecognitionMethod !== 'none') {
          logger.info(`意图解析模式: ${intentRecognitionMethod}`);
          logger.info(`识别到意图: ${recognizedIntent}`);
        }

        const dispatch = preliminaryDispatch;

        if (!dispatch.executable) {
          if (options.dryRun) {
            if (options.json) {
              if (dispatch.kind === 'blocked') {
                output.json(buildBlockedEnvelope(dispatch.reason, dispatch));
              } else {
                output.json(buildClarifyEnvelope(dispatch.reason, dispatch));
              }
            } else {
              logger.info(`\n${formatRunDispatchText(dispatch)}`);
              logger.info('\nDry-run: 未执行任何命令。');
            }
          } else if (options.json) {
            output.json({
              ok: false,
              dispatch,
            });
          } else {
            logger.info(`\n${formatRunDispatchText(dispatch)}`);
          }
          restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
          return;
        }

        if (options.dryRun) {
          const interpolationCtx = toInterpolationContext(buildInitialVariables(options.variable));
          const interpolatedSteps = orchestrateSteps.map(s => interpolateStep(s, interpolationCtx));
          const mode = options.mode || 'relaxed';
          if (options.json) {
            const { draft } = stepsToWorkflowDraft(
              interpolatedSteps.map(s => ({
                cli: s.cli || s.type || '',
                args: s.args ?? []
              })),
              { mode: mode as CliMode },
            );
            output.json(buildStepsEnvelope(draft, mode));
          } else {
            logger.info(`\n📋 将要执行的命令 (模式: ${mode}):`);
            for (const s of interpolatedSteps) {
              logger.info(`  ${s.cli} ${(s.args ?? []).join(' ')}`);
            }
            logger.info(`\n⚙️ ${getModeDescription(mode as CliMode)}`);
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
        }
      } else {
        exitWithError(logger, output, '❌ 请提供自然语言描述或使用 --file 选项指定工作流文件', 'NO_INPUT', options.json);
      }

      // 处理初始变量
      const initialVariables = buildInitialVariables(options.variable);

      logger.info('执行工作流...');
      const result = await (await getWorkflowEngine()).execute(workflow!, { 
        mode: options.mode, 
        dryRun: options.dryRun,
        onProgress: createProgressCallback(workflow!.steps.length, output, options.json),
      }, initialVariables);

      const recordManager = createRecordManager(context.environment.getPath('executions'));
      const metadata: ExecutionMetadata = {
        source: options.file ? 'file' : 'nl',
        nlInput: options.file ? undefined : (intent.length > 0 ? intent.join(' ') : undefined),
        sourceFile: options.file ? context.environment.resolvePath(options.file) : undefined,
        cwd: context.environment.getCwd(),
      };
      const recordToSave = normalizeExecutionRecord(result, metadata);
      await recordManager.save(recordToSave);

      if (options.json) {
        output.json({
          ok: result.status === 'COMPLETED',
          status: result.status,
          duration: result.duration,
          steps: result.steps.map(s => ({
            stepId: s.stepId,
            status: s.status,
            output: s.output,
            error: s.error
          }))
        });
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
        if (!options.dryRun && !options.json && context.environment.getEnv('CI') !== '1') {
          logger.warn('工作流执行失败，self-healing 已移除，待 ACP 模式接入');
        }
        restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
        throw new VectaHubError('Workflow execution failed', ErrorType.RUNTIME);
      }
  
      restoreEnvValue(context, 'VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
    
      } catch (error) {
        if (!options.json) {
          const message = error instanceof Error ? error.message : '未知错误';
          const stackTrace = error instanceof Error ? error.stack : String(error);
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

/**
 * 获取已绑定的运行命令（已弃用）
 * @returns 已绑定的运行命令
 * @throws Error 如果命令上下文未绑定
 * @deprecated 请使用 createRunCmd(context) 代替
 */
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
