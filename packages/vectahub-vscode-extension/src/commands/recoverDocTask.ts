/**
 * P6 Self-Healing & Recovery — Plugin Recovery Command
 *
 * Registers `vectahubTasks.recoverDocTask` command.
 * Builds recovery input from the latest failed run record,
 * runs deterministic decision, and for retry_direct calls CLI recover-task.
 *
 * See docs/specs/recovery-loop.md.
 */

import * as vscode from 'vscode';
import { runCli, getActiveWorkspaceFolder } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { DocTask, TasksViewProvider } from '../views/tasksView.js';
import { createDocTaskRunStore } from '../project/docTaskRunStore.js';
import {
  buildRecoveryInput,
  classifyRecoveryOutcome,
  decideRecoveryWithHashGuard,
  createRecoveryRecord,
  createRecoveryRunId,
  isRecoveryEligible,
  type RecoveryDecision,
} from '../project/docTaskRecovery.js';
import { createRootTraceContext, startSpan } from '../trace/index.js';
import { setTaskDisplayState, createRunId, safeUpdateRun, computeCurrentInstructionHashForRecovery } from './docTaskRunHelpers.js';
import { resolveRecoveryInstructionHash } from './recoverDocTaskHash.js';

interface RecoverCliResult {
  ok: boolean;
  recoveryRunId?: string;
  sourceRunId?: string;
  taskId?: string;
  decision?: RecoveryDecision;
  sourceTraceId?: string;
  recoveryTraceId?: string;
  runResult?: {
    ok: boolean;
    command?: string;
    output?: string;
    displayOutput?: string;
    outputTruncated?: boolean;
    verification?: {
      ok: boolean;
      isSystemError?: boolean;
    };
  };
  status?: string;
  failureKind?: string;
  recoveryRecord?: {
    status: string;
  };
  error?: string;
}

export function registerRecoverDocTaskCommand(
  context: vscode.ExtensionContext,
  tasksProvider: TasksViewProvider,
): void {
  const workspaceRoot = getActiveWorkspaceFolder();
  const runStore = workspaceRoot ? createDocTaskRunStore(workspaceRoot) : undefined;
  const warnRunStore = (message: string) => logToOutput(message, 'warn');

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.recoverDocTask', async (task: DocTask) => {
      if (!runStore) {
        vscode.window.showErrorMessage('无法初始化运行记录存储。');
        return;
      }

      // 1. Get latest run record for this task
      const latestRecord = await runStore.getLatestByTaskId(task.id);
      if (!latestRecord) {
        vscode.window.showWarningMessage(`任务 ${task.id} 没有运行记录，无法恢复。`);
        return;
      }

      // 2. Check eligibility
      if (!isRecoveryEligible(latestRecord.status)) {
        vscode.window.showWarningMessage(`任务 ${task.id} 当前状态为 ${latestRecord.status}，不需要恢复。`);
        return;
      }

      // 3. Build recovery input from run record (strips sensitive data)
      // Compute current instructionHash with full contract factors for drift detection (§7.5)
      let currentHash: string | undefined;
      const currentDocPath = tasksProvider.getSelectedDocPath() || latestRecord.docPath;
      try {
        currentHash = await computeCurrentInstructionHashForRecovery({
          taskId: task.id,
          label: task.label,
          docPath: currentDocPath,
          projectRoot: workspaceRoot,
          tool: latestRecord.agentCli,
        });
      } catch { /* ignore and let hash guard block when needed */ }
      const recoveryInput = buildRecoveryInput(latestRecord, currentHash);
      const recoveryInstructionHash = resolveRecoveryInstructionHash({
        currentHash,
        latestInstructionHash: latestRecord.instructionHash,
      });

      // 4. Deterministic recovery decision
      const decision = decideRecoveryWithHashGuard(recoveryInput);

      logToOutput(`[recovery] 任务 ${task.id} 恢复决策: kind=${decision.kind}, mode=${decision.mode}, reason=${decision.reason}`);
      logToOutput(`[recovery] 摘要: ${decision.summary}`);

      // Persist the recovery record (decision is now known)
      const recoveryRunId = createRecoveryRunId();
      const recoveryRecordForPersistence = createRecoveryRecord({
        recoveryRunId,
        sourceRunId: latestRecord.runId,
        taskId: task.id,
        decision,
        sourceTraceId: latestRecord.traceId,
        retryOfRunId: latestRecord.runId,
      });

      // 5. Handle blocked
      if (decision.kind === 'blocked') {
        recoveryRecordForPersistence.status = 'blocked';
        recoveryRecordForPersistence.updatedAt = new Date().toISOString();
        recoveryRecordForPersistence.endedAt = recoveryRecordForPersistence.updatedAt;
        try {
          await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
        } catch { /* best-effort */ }
        vscode.window.showWarningMessage(
          `任务 ${task.id} 无法自动恢复: ${decision.summary}`,
          { modal: true, detail: decision.suggestedActions.join('\n') },
        );
        return;
      }

      // 6. Handle suggest_fix (V1: guidance only)
      if (decision.kind === 'suggest_fix') {
        recoveryRecordForPersistence.status = 'planned';
        recoveryRecordForPersistence.updatedAt = new Date().toISOString();
        try {
          await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
        } catch { /* best-effort */ }
        const actions = decision.suggestedActions.map((a, i) => `${i + 1}. ${a}`).join('\n');
        await vscode.window.showInformationMessage(
          `任务 ${task.id} 恢复建议: ${decision.summary}`,
          { modal: true, detail: actions },
          '了解',
        );
        // V1 does not auto-execute fix tasks
        return;
      }

      // 7. Handle retry_direct — require user confirmation
      if (decision.kind === 'retry_direct') {
        if (decision.mode === 'confirm_required') {
          const confirmed = await vscode.window.showWarningMessage(
            `是否重试任务 ${task.id}?\n${decision.summary}`,
            { modal: true },
            '确认重试',
            '取消',
          );
          if (confirmed !== '确认重试') {
            logToOutput(`[recovery] 用户取消重试任务 ${task.id}`);
            return;
          }
        }

        // Update recovery record with trace info once we have it
        const agentCli = tasksProvider.getSelectedAgentCli();
        if (!agentCli) {
          vscode.window.showWarningMessage('请先选择 Agent CLI 执行器。');
          return;
        }

        const docPath = tasksProvider.getSelectedDocPath();

        // Start recovery trace
        const traceContext = createRootTraceContext();
        const recoverySpan = startSpan('vscode.docTask.recover', {
          context: traceContext,
          source: 'vscode',
          attributes: {
            recovery: true,
            recoveryKind: decision.kind,
            sourceRunId: latestRecord.runId,
            sourceTraceId: latestRecord.traceId,
            sourceFailureKind: latestRecord.failureKind ?? 'unknown',
            taskId: task.id,
            taskLabel: task.label,
          },
        });

        // Update recovery record with trace info
        recoveryRecordForPersistence.recoveryTraceId = traceContext.traceId;
        recoveryRecordForPersistence.status = 'running';
        recoveryRecordForPersistence.updatedAt = new Date().toISOString();
        try {
          await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
        } catch { /* best-effort */ }

        // Update task display
        task.lastFailureKind = undefined;
        setTaskDisplayState(task, 'running');
        tasksProvider.refresh();

        logToOutput(`[recovery] 正在重试任务 ${task.id}...`);

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `正在恢复任务 ${task.id}: ${task.label}`,
              cancellable: false,
            },
            async () => {
              const args = [
                'recover-task',
                '--run-id', latestRecord.runId,
                '--task-id', task.id,
                '--task-label', task.label,
                '--tool', agentCli,
                '--trace-id', latestRecord.traceId ?? '',
                '--source-failure-kind', latestRecord.failureKind ?? 'unknown',
                '--decision-kind', decision.kind,
                '--json',
              ];
              if (docPath) {
                args.push('--doc', docPath);
              }
              if (latestRecord.command) {
                args.push('--command', latestRecord.command);
              }
              if (latestRecord.instructionHash) {
                args.push('--previous-instruction-hash', latestRecord.instructionHash);
              }
              if (currentHash) {
                args.push('--current-instruction-hash', currentHash);
              }

              const result = await runCli<RecoverCliResult>(args, {
                timeout: 600000,
                traceContext: {
                  traceId: traceContext.traceId,
                  parentSpanId: recoverySpan.spanId,
                  source: 'vscode',
                },
              });

              if (result.ok && result.data?.ok) {
                // Recovery succeeded — write new run record
                const newRunId = createRunId(task.id);
                const runResult = result.data.runResult;
                const classification = classifyRecoveryOutcome({
                  ok: result.data.ok,
                  status: result.data.status,
                  failureKind: result.data.failureKind,
                  runResult,
                  error: result.data.error,
                });

                task.lastRunId = newRunId;
                task.lastTraceId = result.data.recoveryTraceId;
                task.lastFailureKind = classification.failureKind;
                setTaskDisplayState(task, classification.status);
                tasksProvider.refresh();

                try {
                  const newRunRecord = await runStore.startRun({
                    runId: newRunId,
                    taskId: task.id,
                    taskLabel: task.label,
                    docPath,
                    agentCli,
                    status: classification.status,
                    command: runResult?.command,
                    traceId: result.data.recoveryTraceId,
                    retryOfRunId: latestRecord.runId,
                  });
                  newRunRecord.outputSummary = runResult?.output?.slice(0, 2000);
                  newRunRecord.outputTruncated = runResult?.outputTruncated;
                  newRunRecord.failureKind = classification.failureKind;
                  newRunRecord.instructionHash = recoveryInstructionHash;
                  newRunRecord.endedAt = new Date().toISOString();
                  newRunRecord.updatedAt = newRunRecord.endedAt;
                  await safeUpdateRun(runStore, newRunRecord, 'recovery result', warnRunStore);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  warnRunStore(`[recovery] 写入新 run record 失败: ${msg}`);
                }

                // Update persisted recovery record
                recoveryRecordForPersistence.status = runResult?.ok ? 'success' : 'failed';
                recoveryRecordForPersistence.recoveryTraceId = result.data.recoveryTraceId ?? recoveryRecordForPersistence.recoveryTraceId;
                recoveryRecordForPersistence.updatedAt = new Date().toISOString();
                recoveryRecordForPersistence.endedAt = recoveryRecordForPersistence.updatedAt;
                try {
                  await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
                } catch { /* best-effort */ }

                await recoverySpan.end({
                  recoveryStatus: classification.status,
                  recoveryRunId: result.data.recoveryRunId,
                });

                if (classification.status === 'success') {
                  vscode.window.showInformationMessage(`任务 ${task.id} 恢复成功！`);
                } else {
                  vscode.window.showWarningMessage(`任务 ${task.id} 恢复重试后仍然失败。`);
                }
              } else {
                // Recovery CLI returned failure
                const errMsg = result.data?.error || result.error?.message || '恢复失败';
                const classification = classifyRecoveryOutcome({
                  ok: result.data?.ok,
                  status: result.data?.status,
                  failureKind: result.data?.failureKind,
                  runResult: result.data?.runResult,
                  error: errMsg,
                });
                recoveryRecordForPersistence.status = 'failed';
                recoveryRecordForPersistence.updatedAt = new Date().toISOString();
                recoveryRecordForPersistence.endedAt = recoveryRecordForPersistence.updatedAt;
                try {
                  await runStore.saveRecoveryRecord(recoveryRecordForPersistence);
                } catch { /* best-effort */ }
                const newRunId = createRunId(task.id);
                task.lastRunId = newRunId;
                task.lastTraceId = result.data?.recoveryTraceId ?? traceContext.traceId;
                task.lastFailureKind = classification.failureKind;
                setTaskDisplayState(task, classification.status);
                tasksProvider.refresh();
                try {
                  const newRunRecord = await runStore.startRun({
                    runId: newRunId,
                    taskId: task.id,
                    taskLabel: task.label,
                    docPath,
                    agentCli,
                    status: classification.status,
                    command: latestRecord.command,
                    traceId: result.data?.recoveryTraceId ?? traceContext.traceId,
                    retryOfRunId: latestRecord.runId,
                  });
                  newRunRecord.failureKind = classification.failureKind;
                  newRunRecord.errorMessage = errMsg.slice(0, 1000);
                  newRunRecord.outputSummary = result.data?.runResult?.output?.slice(0, 2000);
                  newRunRecord.outputTruncated = result.data?.runResult?.outputTruncated;
                  newRunRecord.instructionHash = recoveryInstructionHash;
                  newRunRecord.endedAt = new Date().toISOString();
                  newRunRecord.updatedAt = newRunRecord.endedAt;
                  await safeUpdateRun(runStore, newRunRecord, 'recovery failed result', warnRunStore);
                } catch (persistErr) {
                  const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
                  warnRunStore(`[recovery] 写入失败 run record 失败: ${msg}`);
                }

                await recoverySpan.fail(new Error(errMsg), {
                  recoveryStatus: 'failed',
                });

                vscode.window.showErrorMessage(`任务 ${task.id} 恢复失败: ${errMsg}`);
              }
            },
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const classification = classifyRecoveryOutcome({ error: msg });
          logToOutput(`[recovery] 恢复异常: ${msg}`, 'error');
          const newRunId = createRunId(task.id);
          task.lastRunId = newRunId;
          task.lastTraceId = traceContext.traceId;
          task.lastFailureKind = classification.failureKind;
          setTaskDisplayState(task, classification.status);
          tasksProvider.refresh();
          try {
            const newRunRecord = await runStore.startRun({
              runId: newRunId,
              taskId: task.id,
              taskLabel: task.label,
              docPath,
              agentCli,
              status: classification.status,
              command: latestRecord.command,
              traceId: traceContext.traceId,
              retryOfRunId: latestRecord.runId,
            });
            newRunRecord.failureKind = classification.failureKind;
            newRunRecord.errorMessage = msg.slice(0, 1000);
            newRunRecord.instructionHash = recoveryInstructionHash;
            newRunRecord.endedAt = new Date().toISOString();
            newRunRecord.updatedAt = newRunRecord.endedAt;
            await safeUpdateRun(runStore, newRunRecord, 'recovery exception result', warnRunStore);
          } catch (persistErr) {
            const persistMsg = persistErr instanceof Error ? persistErr.message : String(persistErr);
            warnRunStore(`[recovery] 写入异常 run record 失败: ${persistMsg}`);
          }
          await recoverySpan.fail(err, { recoveryStatus: 'exception' });
          vscode.window.showErrorMessage(`任务 ${task.id} 恢复异常: ${msg}`);
        }
      }
    }),
  );
}
