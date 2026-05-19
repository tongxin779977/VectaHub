/**
 * P6 Self-Healing & Recovery — CLI recover-task Command
 *
 * Executes recovery for a failed doc-task.
 * First version: supports `retry_direct` only.
 * `suggest_fix` returns structured guidance without auto-execution.
 * `blocked` returns explanation and stops.
 *
 * See docs/specs/recovery-loop.md.
 */

import { Command } from 'commander';
import { getLogger } from '../utils/logger.js';
import { startSpan, createChildEnv } from '../infrastructure/trace/index.js';
import { runTask, formatRunTaskJson, type RunTaskResult } from './run-task.js';
import { getDefaultContext, VectaHubError, ErrorType } from '../infrastructure/index.js';
import {
  decideRecovery,
  createRecoveryRecord,
  type DocTaskRecoveryInput,
  type RecoveryDecision,
  type RecoveryDecisionKind,
  type DocTaskRecoveryRecord,
} from '../types/recovery.js';
import type { DocTaskFailureKind, DocTaskRunStatus } from '../types/doc-task.js';

const logger = getLogger('recover-task');
const ctx = getDefaultContext();

export interface RecoverTaskOptions {
  runId: string;
  taskId: string;
  taskLabel: string;
  tool: string;
  doc?: string;
  traceId?: string;
  sourceFailureKind?: string;
  decisionKind?: string;
  command?: string;
  previousInstructionHash?: string;
  currentInstructionHash?: string;
  json?: boolean;
}

export interface RecoverTaskResult {
  ok: boolean;
  recoveryRunId: string;
  sourceRunId: string;
  taskId: string;
  decision: RecoveryDecision;
  sourceTraceId?: string;
  recoveryTraceId?: string;
  runResult?: RunTaskResult;
  recoveryRecord?: DocTaskRecoveryRecord;
  status?: 'planned' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  failureKind?: DocTaskFailureKind;
  error?: string;
}

export async function recoverTask(options: RecoverTaskOptions): Promise<RecoverTaskResult> {
  const recoveryRunId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceRunId = options.runId;

  // Build a minimal recovery input from the provided CLI arguments.
  const failureKind: DocTaskFailureKind = isValidFailureKind(options.sourceFailureKind)
    ? options.sourceFailureKind!
    : 'unknown';
  const status: DocTaskRunStatus = failureKindToStatus(failureKind);

  const input: DocTaskRecoveryInput = {
    runId: sourceRunId,
    taskId: options.taskId,
    taskLabel: options.taskLabel,
    docPath: options.doc,
    traceId: options.traceId,
    failureKind,
    status,
    command: options.command,
    previousInstructionHash: options.previousInstructionHash,
    currentInstructionHash: options.currentInstructionHash,
  };

  const localDecision = decideRecovery(input);
  let decision: RecoveryDecision;
  if (localDecision.kind === 'blocked' && localDecision.reason === 'instruction-changed') {
    decision = localDecision;
  } else if (options.decisionKind && isValidDecisionKind(options.decisionKind)) {
    decision = buildDecisionFromKind(options.decisionKind as RecoveryDecisionKind, failureKind);
  } else {
    decision = localDecision;
  }

  logger.info(`恢复决策: kind=${decision.kind}, mode=${decision.mode}, reason=${decision.reason}`);
  logger.info(`恢复摘要: ${decision.summary}`);

  const recoverySpan = startSpan('cli.recover-task', {
    source: 'cli',
    attributes: {
      recovery: true,
      recoveryKind: decision.kind,
      sourceRunId,
      sourceTraceId: options.traceId,
      sourceFailureKind: failureKind,
      taskId: options.taskId,
      taskLabel: options.taskLabel,
    },
  });

  const recoveryTraceId = recoverySpan.traceId;

  const recoveryRecord = createRecoveryRecord({
    recoveryRunId,
    sourceRunId,
    taskId: options.taskId,
    decision,
    sourceTraceId: options.traceId,
    recoveryTraceId,
    retryOfRunId: sourceRunId,
  });

  if (decision.kind === 'blocked') {
    recoveryRecord.status = 'blocked';
    recoveryRecord.updatedAt = new Date().toISOString();
    recoveryRecord.endedAt = recoveryRecord.updatedAt;
    await recoverySpan.end({ recoveryStatus: 'blocked' });

    logger.info('恢复被阻断，请人工处理。');
    for (const action of decision.suggestedActions) {
      logger.info(`  → ${action}`);
    }

    return {
      ok: false,
      recoveryRunId,
      sourceRunId,
      taskId: options.taskId,
      decision,
      sourceTraceId: options.traceId,
      recoveryTraceId,
      recoveryRecord,
      status: recoveryRecord.status,
      failureKind,
      error: decision.summary,
    };
  }

  if (decision.kind === 'suggest_fix') {
    recoveryRecord.status = 'planned';
    recoveryRecord.updatedAt = new Date().toISOString();
    await recoverySpan.end({ recoveryStatus: 'planned' });

    logger.info('建议修复模式：当前版本不自动执行修复任务，请参考以下建议。');
    for (const action of decision.suggestedActions) {
      logger.info(`  → ${action}`);
    }

    return {
      ok: false,
      recoveryRunId,
      sourceRunId,
      taskId: options.taskId,
      decision,
      sourceTraceId: options.traceId,
      recoveryTraceId,
      recoveryRecord,
      status: recoveryRecord.status,
      failureKind,
      error: decision.summary,
    };
  }

  if (decision.kind === 'retry_direct') {
    recoveryRecord.status = 'running';
    recoveryRecord.updatedAt = new Date().toISOString();

    logger.info(`正在重新执行任务 ${options.taskId}...`);

    try {
      const recoveryTraceContext = {
        traceId: recoverySpan.traceId,
        parentSpanId: recoverySpan.spanId,
        source: 'cli' as const,
      };
      const childEnv = createChildEnv(recoveryTraceContext, recoverySpan.spanId);
      const originalEnv: Record<string, string | undefined> = {};
      const allEnv = ctx.environment.getAllEnv();
      
      for (const [key, value] of Object.entries(childEnv)) {
        originalEnv[key] = allEnv[key];
        if (value !== undefined) {
          ctx.environment.setEnv(key, value);
        }
      }

      let runResult: RunTaskResult;
      try {
        runResult = await runTask({
          tool: options.tool,
          taskId: options.taskId,
          taskLabel: options.taskLabel,
          doc: options.doc,
        });
      } finally {
        for (const [key, value] of Object.entries(originalEnv)) {
          if (value === undefined) {
            ctx.environment.deleteEnv(key);
          } else {
            ctx.environment.setEnv(key, value);
          }
        }
      }

      const success = runResult.success;
      const failure = success ? undefined : classifyFailureFromRunTaskResult(runResult);
      recoveryRecord.status = success ? 'success' : 'failed';
      recoveryRecord.updatedAt = new Date().toISOString();
      recoveryRecord.endedAt = recoveryRecord.updatedAt;

      await recoverySpan.end({
        recoveryStatus: recoveryRecord.status,
        retrySuccess: success,
      });

      return {
        ok: success,
        recoveryRunId,
        sourceRunId,
        taskId: options.taskId,
        decision,
        sourceTraceId: options.traceId,
        recoveryTraceId,
        runResult,
        recoveryRecord,
        status: recoveryRecord.status,
        failureKind: failure?.kind,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const failure = classifyFailureFromErrorMessage(errMsg);
      recoveryRecord.status = 'failed';
      recoveryRecord.updatedAt = new Date().toISOString();
      recoveryRecord.endedAt = recoveryRecord.updatedAt;

      await recoverySpan.fail(error, { recoveryStatus: 'failed' });

      return {
        ok: false,
        recoveryRunId,
        sourceRunId,
        taskId: options.taskId,
        decision,
        sourceTraceId: options.traceId,
        recoveryTraceId,
        recoveryRecord,
        status: recoveryRecord.status,
        failureKind: failure.kind,
        error: errMsg,
      };
    }
  }

  recoveryRecord.status = 'blocked';
  recoveryRecord.updatedAt = new Date().toISOString();
  recoveryRecord.endedAt = recoveryRecord.updatedAt;
  await recoverySpan.end({ recoveryStatus: 'blocked-unsupported' });

  return {
    ok: false,
    recoveryRunId,
    sourceRunId,
    taskId: options.taskId,
    decision,
    sourceTraceId: options.traceId,
    recoveryTraceId,
    recoveryRecord,
    status: recoveryRecord.status,
    failureKind,
    error: `不支持的恢复类型: ${decision.kind}`,
  };
}

const VALID_FAILURE_KINDS: DocTaskFailureKind[] = [
  'config', 'agent', 'json_protocol', 'timeout', 'test', 'conflict', 'system_internal', 'cancelled', 'unknown',
];

const VALID_DECISION_KINDS: RecoveryDecisionKind[] = [
  'retry_direct', 'suggest_fix', 'blocked',
];

function isValidFailureKind(value: string | undefined): value is DocTaskFailureKind {
  return !!value && VALID_FAILURE_KINDS.includes(value as DocTaskFailureKind);
}

function isValidDecisionKind(value: string | undefined): value is RecoveryDecisionKind {
  return !!value && VALID_DECISION_KINDS.includes(value as RecoveryDecisionKind);
}

function failureKindToStatus(kind: DocTaskFailureKind): DocTaskRunStatus {
  const map: Record<DocTaskFailureKind, DocTaskRunStatus> = {
    config: 'failed_config',
    agent: 'failed_agent',
    json_protocol: 'failed_json_protocol',
    timeout: 'failed_timeout',
    test: 'failed_test',
    conflict: 'failed_conflict',
    system_internal: 'failed_system_internal',
    cancelled: 'cancelled',
    unknown: 'failed_agent',
  };
  return map[kind] ?? 'failed_agent';
}

function buildDecisionFromKind(kind: RecoveryDecisionKind, failureKind: DocTaskFailureKind): RecoveryDecision {
  const templates: Record<RecoveryDecisionKind, RecoveryDecision> = {
    retry_direct: {
      kind: 'retry_direct',
      mode: 'confirm_required',
      reason: 'plugin-precomputed',
      summary: '建议直接重试任务。',
      suggestedActions: ['确认后重新执行任务'],
      needsNewTrace: true,
      canReusePreviousCommand: true,
    },
    suggest_fix: {
      kind: 'suggest_fix',
      mode: 'confirm_required',
      reason: 'plugin-precomputed',
      summary: '建议基于失败上下文生成修复任务。',
      suggestedActions: ['检查失败摘要', '确认后生成修复任务'],
      needsNewTrace: true,
      canReusePreviousCommand: false,
    },
    blocked: {
      kind: 'blocked',
      mode: 'manual_only',
      reason: 'plugin-precomputed',
      summary: '需要人工处理。',
      suggestedActions: ['检查任务状态', '手动确认恢复策略'],
      needsNewTrace: false,
      canReusePreviousCommand: false,
    },
  };
  return templates[kind];
}

interface ClassifiedFailure {
  kind: DocTaskFailureKind;
  status: DocTaskRunStatus;
}

function classifyFailureFromRunTaskResult(runResult: RunTaskResult): ClassifiedFailure {
  const verification = runResult.verification;
  if (verification && !verification.ok) {
    if (verification.isSystemError) {
      return { kind: 'system_internal', status: 'failed_system_internal' };
    }
    return { kind: 'test', status: 'failed_test' };
  }
  return classifyFailureFromErrorMessage(runResult.output);
}

function classifyFailureFromErrorMessage(errorMessage: string): ClassifiedFailure {
  const text = errorMessage.toLowerCase();
  if (text.includes('timeout') || text.includes('timed out') || text.includes('超时')) {
    return { kind: 'timeout', status: 'failed_timeout' };
  }
  if (text.includes('json') && text.includes('parse')) {
    return { kind: 'json_protocol', status: 'failed_json_protocol' };
  }
  if (
    text.includes('merge conflict')
    || text.includes('<<<<<<<')
    || text.includes('>>>>>>>')
    || text.includes('冲突')
  ) {
    return { kind: 'conflict', status: 'failed_conflict' };
  }
  if (
    text.includes('not configured')
    || text.includes('未配置')
    || text.includes('permission denied')
    || text.includes('no such file')
    || text.includes('eacces')
    || text.includes('enoent')
  ) {
    return { kind: 'config', status: 'failed_config' };
  }
  if (text.includes('system') || text.includes('io error') || text.includes('emfile') || text.includes('enfile')) {
    return { kind: 'system_internal', status: 'failed_system_internal' };
  }
  if (text.includes('cancel') || text.includes('取消')) {
    return { kind: 'cancelled', status: 'cancelled' };
  }
  return { kind: 'agent', status: 'failed_agent' };
}

export const recoverTaskCmd = new Command('recover-task')
  .description('恢复失败的文档任务')
  .requiredOption('--run-id <id>', '原始失败运行 ID')
  .requiredOption('--task-id <id>', '任务编号')
  .requiredOption('--task-label <label>', '任务描述')
  .requiredOption('--tool <name>', 'Agent CLI 工具名称')
  .option('--doc <path>', '参考文档路径')
  .option('--trace-id <id>', '原始失败 trace ID')
  .option('--source-failure-kind <kind>', '原始失败分类')
  .option('--decision-kind <kind>', '预计算的恢复决策（插件侧已决定）')
  .option('--command <cmd>', '原始执行命令摘要')
  .option('--previous-instruction-hash <hash>', '原始失败运行的 instructionHash')
  .option('--current-instruction-hash <hash>', '当前恢复时计算的 instructionHash')
  .option('--json', '以 JSON 格式输出')
  .action(async (options: RecoverTaskOptions) => {
    try {
      const result = await recoverTask(options);

      if (options.json) {
        const jsonOutput: Record<string, unknown> = {
          ok: result.ok,
          recoveryRunId: result.recoveryRunId,
          sourceRunId: result.sourceRunId,
          taskId: result.taskId,
          decision: result.decision,
          sourceTraceId: result.sourceTraceId,
          recoveryTraceId: result.recoveryTraceId,
          status: result.status,
          failureKind: result.failureKind,
        };
        if (result.runResult) {
          jsonOutput.runResult = formatRunTaskJson(result.runResult);
        }
        if (result.recoveryRecord) {
          jsonOutput.recoveryRecord = result.recoveryRecord;
        }
        if (result.error) {
          jsonOutput.error = result.error;
        }
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else if (!result.ok) {
        if (result.error) {
          logger.error(`恢复失败: ${result.error}`);
        }
        if (result.decision.suggestedActions.length > 0) {
          logger.info('建议操作:');
          for (const action of result.decision.suggestedActions) {
            logger.info(`  → ${action}`);
          }
        }
        throw new VectaHubError(`恢复失败${result.error ? `: ${result.error}` : ''}`, ErrorType.RUNTIME);
      } else {
        logger.info(`恢复成功: 任务 ${result.taskId}`);
        if (result.runResult) {
          logger.info(`输出: ${result.runResult.output.substring(0, 200)}`);
        }
      }
    } catch (error) {
      if (error instanceof VectaHubError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: message }, null, 2));
      } else {
        logger.error(`恢复执行失败: ${message}`);
      }
      throw new VectaHubError(`恢复执行失败: ${message}`, ErrorType.RUNTIME, error);
    }
  });
