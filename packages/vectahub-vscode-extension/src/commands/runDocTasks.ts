import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import { getActiveWorkspaceFolder, runCli } from '../cli/adapter.js';
import { logToOutput } from '../ui/output.js';
import { DocTask, TasksViewProvider } from '../views/tasksView.js';
import { createRootTraceContext, startSpan } from '../trace/index.js';
import { classifyDocTaskFailure, type DocTaskRunStatus } from '../project/docTaskState.js';
import { createDocTaskRunStore, type DocTaskBatchRunRecord, type DocTaskRunRecord } from '../project/docTaskRunStore.js';
import {
  buildAgentTaskContractSummaries,
  decideDocTaskBatchConcurrency,
  toRunContractSummary,
  type AgentTaskContractSummary,
} from '../project/docTaskContract.js';
import {
  applyLatestRunState,
  createBatchRunId,
  createRunId,
  safeUpdateBatch,
  safeUpdateRun,
  setTaskDisplayState,
  summarizeOutput,
} from './docTaskRunHelpers.js';
import { persistContractHashFromCliResult, resolveVerificationStatus } from './docTaskStatusHelpers.js';
import { type RiskLevel } from '../security/riskUI.js';
import { resolveRunTaskExecutionSemantics } from './runTaskResultSemantics.js';
import {
  formatAgentAvailabilityMessage,
  getSelectableAgents,
  normalizeAgentCliInfo,
  type AgentCliInfo,
} from './agentAvailability.js';

const CRITICAL_RISK_PATTERNS: RegExp[] = [
  /^sudo\s+/i,
  /^rm\s+[^\s]*-rf?\s+\//i,
  /^chmod\s+777/i,
  /^dd\s+.*of=\//i,
  /^mkfs/i,
  /^shutdown/i,
  /^reboot/i,
  /^halt/i,
  /^poweroff/i,
];

const HIGH_RISK_PATTERNS: RegExp[] = [
  /^iptables/i,
  /^ip6tables/i,
  /^ufw/i,
  /^firewall-cmd/i,
  /^mv\s+\/\s+/i,
  />\s*\/etc\//i,
  />>\s*\/etc\//i,
  /^mount\s+.*--bind/i,
];

function assessValidationCommandRisk(cmd: string): { level: RiskLevel; ruleName?: string } {
  for (const pattern of CRITICAL_RISK_PATTERNS) {
    if (pattern.test(cmd)) return { level: 'critical', ruleName: 'critical-risk-pattern' };
  }
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(cmd)) return { level: 'high', ruleName: 'high-risk-pattern' };
  }
  return { level: 'safe' };
}

interface RiskItem {
  taskId: string;
  taskLabel: string;
  cmd: string;
  level: RiskLevel;
  ruleName?: string;
}

async function collectBatchRiskItems(
  tasks: Array<{ id: string; label: string }>,
  contractSummaries: Map<string, { validationCommands?: string[] } | undefined>,
): Promise<RiskItem[]> {
  const items: RiskItem[] = [];
  for (const task of tasks) {
    const contract = contractSummaries.get(task.id);
    if (!contract?.validationCommands) continue;
    for (const cmd of contract.validationCommands) {
      const risk = assessValidationCommandRisk(cmd);
      if (risk.level === 'high' || risk.level === 'critical') {
        items.push({ taskId: task.id, taskLabel: task.label, cmd, level: risk.level, ruleName: risk.ruleName });
      }
    }
  }
  return items;
}

async function showBatchRiskDialog(riskItems: RiskItem[]): Promise<'continue' | 'skip' | 'cancel'> {
  const summary = riskItems
    .map(r => `[${r.level.toUpperCase()}] ${r.taskId}: ${r.cmd}`)
    .join('\n');
  const result = await vscode.window.showWarningMessage(
    `检测到 ${riskItems.length} 个高风险验证命令`,
    { modal: true, detail: summary },
    '全部继续',
    '全部跳过高风险',
    '取消批量',
  );
  if (result === '全部继续') return 'continue';
  if (result === '全部跳过高风险') return 'skip';
  return 'cancel';
}

interface ParseDocResult {
  ok: boolean;
  tasks?: DocTask[];
  error?: string;
}

interface RunTaskResult {
  ok: boolean;
  command?: string;
  output?: string;
  outputTruncated?: boolean;
  agentExecutionOutcome?: 'implemented' | 'planned_only';
  agentTaskContract?: AgentTaskContractSummary;
  gitChanges?: {
    shortStat?: string;
    changedFiles?: string[];
  };
  verification?: {
    ok: boolean;
    isSystemError?: boolean;
    commands: Array<{
      command: string;
      ok: boolean;
      exitCode: number | null;
      durationMs: number;
      stdoutSummary?: string;
      stderrSummary?: string;
      outputTruncated?: boolean;
    }>;
  };
  riskAssessment?: {
    level: string;
    ruleName?: string;
    needsConfirmation: boolean;
    enforcement?: 'blocked' | 'confirm_required';
    phase?: 'command' | 'verification';
    blockedCommand?: string;
    confirmationSource?: 'preflight' | 'post-execution';
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string | {
    code?: string;
    message?: string;
  };
}

function resolveStructuredError(result: { data?: RunTaskResult; error?: { code: string; message: string } }): {
  errorCode?: string;
  errorMessage?: string;
  outputSummarySource?: string;
} {
  const dataError = result.data?.error;
  if (typeof dataError === 'string') {
    return {
      errorCode: result.error?.code,
      errorMessage: dataError,
      outputSummarySource: dataError,
    };
  }
  if (dataError && typeof dataError === 'object') {
    return {
      errorCode: dataError.code || result.error?.code,
      errorMessage: dataError.message || result.error?.message,
      outputSummarySource: dataError.message || result.data?.output,
    };
  }
  return {
    errorCode: result.error?.code,
    errorMessage: result.error?.message,
    outputSummarySource: result.data?.output,
  };
}

interface AgentsListResult {
  ok: boolean;
  agents: AgentCliInfo[];
}

async function readDocContentOnce(docPath: string | undefined): Promise<string | undefined> {
  if (!docPath) return undefined;
  try {
    return await fsp.readFile(docPath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logToOutput(`[batch] 合同预检读取文档失败，降级串行: ${msg}`, 'warn');
    return undefined;
  }
}

function applyContractSummary(
  runRecord: DocTaskRunRecord | undefined,
  resultSummary?: AgentTaskContractSummary,
  fallbackSummary?: AgentTaskContractSummary,
): void {
  if (!runRecord) return;
  runRecord.agentTaskContract = toRunContractSummary(resultSummary ?? fallbackSummary);
}

function applyVerificationToRunRecord(
  runRecord: DocTaskRunRecord | undefined,
  verification?: RunTaskResult['verification'],
): void {
  if (!runRecord || !verification) return;
  const failed = verification.commands.filter(c => !c.ok);
  runRecord.verification = {
    ok: verification.ok,
    totalCommands: verification.commands.length,
    passedCommands: verification.commands.filter(c => c.ok).length,
    failedCommands: failed.length,
    failedCommandSummary: failed.length > 0
      ? failed.map(c => c.command).slice(0, 3).join('; ')
      : undefined,
  };
}

function applyExecutionSemanticsToRunRecord(
  runRecord: DocTaskRunRecord | undefined,
  semantics: ReturnType<typeof resolveRunTaskExecutionSemantics>,
): void {
  if (!runRecord) return;
  runRecord.confirmationSource = semantics.confirmationSource;
  runRecord.unclosedExecution = semantics.unclosedExecution || undefined;
}

export function registerDocTaskCommands(context: vscode.ExtensionContext, tasksProvider: TasksViewProvider) {
  const workspaceRoot = getActiveWorkspaceFolder();
  const runStore = workspaceRoot ? createDocTaskRunStore(workspaceRoot) : undefined;
  const warnRunStore = (message: string) => logToOutput(message, 'warn');
  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.selectDocFile', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          '文档文件': ['md', 'txt', 'rst', 'adoc'],
          '所有文件': ['*']
        },
        title: '选择开发文档'
      });

      if (!uris || uris.length === 0) return;

      const filePath = uris[0].fsPath;
      tasksProvider.setSelectedDocPath(filePath);
      tasksProvider.setDocTasks([]);
      tasksProvider.setIsDocParsing(false);
      tasksProvider.refresh();

      logToOutput(`已选择文档: ${filePath}`);

      await vscode.commands.executeCommand('vectahubTasks.parseDocTasks');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.parseDocTasks', async () => {
      if (tasksProvider.getIsDocParsing()) {
        vscode.window.showWarningMessage('文档正在解析中，请稍候...');
        return;
      }

      const docPath = tasksProvider.getSelectedDocPath();
      if (!docPath) {
        vscode.window.showWarningMessage('请先选择文档文件');
        return;
      }

      tasksProvider.setIsDocParsing(true);
      tasksProvider.refresh();

      try {
          await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '正在解析文档任务...',
          cancellable: false
        }, async () => {
          const result = await runCli<ParseDocResult>(['parse-doc', docPath, '--json'], { timeout: 120000 });

          if (result.ok && result.data?.tasks) {
            const docContent = await readDocContentOnce(docPath);
            const tasksWithState = await applyLatestRunState(
              runStore,
              result.data.tasks,
              warnRunStore,
              docContent,
              workspaceRoot,
            );
            tasksProvider.setDocTasks(tasksWithState);
            logToOutput(`解析完成，共 ${tasksWithState.length} 个任务`);
            vscode.window.showInformationMessage(`解析完成，共 ${tasksWithState.length} 个任务`);
          } else {
            const errMsg = result.data?.error || result.error?.message || '解析失败';
            logToOutput(`解析失败: ${errMsg}`, 'error');
            vscode.window.showErrorMessage(`解析失败: ${errMsg}`);
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logToOutput(`解析异常: ${msg}`, 'error');
        vscode.window.showErrorMessage(`解析异常: ${msg}`);
      } finally {
        tasksProvider.setIsDocParsing(false);
        tasksProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.selectAgentCli', async () => {
      const result = await runCli<AgentsListResult>(['tools', 'agents', '--json', '--sync-config']);

      const items: vscode.QuickPickItem[] = [];

      if (result.ok && result.data?.agents) {
        const normalizedAgents = result.data.agents.map(agent => normalizeAgentCliInfo(agent));
        const installedAgents = getSelectableAgents(normalizedAgents);

        if (installedAgents.length === 0) {
          vscode.window.showWarningMessage(formatAgentAvailabilityMessage(normalizedAgents));
        }

        for (const agent of installedAgents) {
          items.push({
            label: agent.name,
            description: agent.version
          });
        }
      }

      items.push({
        label: '手动输入',
        description: '输入自定义 Agent CLI 名称'
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择 Agent CLI 执行器',
        title: '选择执行文档任务的 Agent CLI'
      });

      if (!selected) return;

      if (selected.label === '手动输入') {
        const customName = await vscode.window.showInputBox({
          prompt: '输入 Agent CLI 名称',
          placeHolder: 'aider'
        });
        if (customName) {
          tasksProvider.setSelectedAgentCli(customName);
          tasksProvider.refresh();
        }
      } else {
        tasksProvider.setSelectedAgentCli(selected.label);
        tasksProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.runDocTask', async (task: DocTask) => {
      if (task.status === 'running') return;

      const docPath = tasksProvider.getSelectedDocPath();
      let agentCli = tasksProvider.getSelectedAgentCli();

      if (!agentCli) {
        await vscode.commands.executeCommand('vectahubTasks.selectAgentCli');
        agentCli = tasksProvider.getSelectedAgentCli();
        if (!agentCli) {
          vscode.window.showWarningMessage('请先选择 Agent CLI 执行器');
          return;
        }
      }

      const args = [
        'run-task',
        '--tool', agentCli,
        '--task-id', task.id,
        '--task-label', task.label,
        '--json'
      ];

      if (docPath) {
        args.push('--doc', docPath);
      }

      try {
        const traceContext = createRootTraceContext();
        let runRecord: DocTaskRunRecord | undefined;
        const runId = createRunId(task.id);
        const startedAtMs = Date.now();

        try {
          runRecord = runStore
            ? await runStore.startRun({
                runId,
                taskId: task.id,
                taskLabel: task.label,
                docPath,
                agentCli,
                status: 'ready',
                command: args.join(' '),
                traceId: traceContext.traceId
              })
            : undefined;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logToOutput(`[doc-task-run-store] startRun 失败: ${msg}`, 'warn');
        }

        task.lastRunId = runId;
        task.lastTraceId = traceContext.traceId;
        task.lastFailureKind = undefined;
        setTaskDisplayState(task, 'preflight');
        tasksProvider.refresh();
        if (runRecord) {
          runRecord.status = 'preflight';
          runRecord.updatedAt = new Date().toISOString();
          await safeUpdateRun(runStore, runRecord, 'preflight update', warnRunStore);
        }

        const singleSpan = startSpan('vscode.docTask.runSingle', {
          context: traceContext,
          source: 'vscode',
          attributes: {
            taskId: task.id,
            taskLabel: task.label,
            status: 'started',
            agentCli: agentCli || '',
          },
        });
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `正在执行任务 ${task.id}: ${task.label}`,
          cancellable: true
        }, async (_progress, token) => {
          setTaskDisplayState(task, 'running');
          tasksProvider.refresh();
          if (runRecord) {
            runRecord.status = 'running';
            runRecord.updatedAt = new Date().toISOString();
            await safeUpdateRun(runStore, runRecord, 'running update', warnRunStore);
          }

          logToOutput(`开始执行任务: ${task.id} - ${task.label} (工具: ${agentCli})`);

          const result = await runCli<RunTaskResult>(args, {
            timeout: 600000,
            token,
            traceContext: { traceId: traceContext.traceId, parentSpanId: singleSpan.spanId, source: 'vscode' },
          });
          const semantics = resolveRunTaskExecutionSemantics(result);

          if (semantics.needsConfirmation) {
            const source = semantics.confirmationSource;
            const status: DocTaskRunStatus = source === 'post-execution' ? 'changed' : 'preflight';
            task.lastFailureKind = undefined;
            setTaskDisplayState(task, 'needs_confirmation');
            tasksProvider.refresh();
            if (runRecord) {
              const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
              runRecord.status = 'needs_confirmation';
              runRecord.failureKind = undefined;
              runRecord.updatedAt = new Date().toISOString();
              runRecord.endedAt = runRecord.updatedAt;
              runRecord.durationMs = Date.now() - startedAtMs;
              runRecord.command = result.data?.command || runRecord.command;
              runRecord.gitChanges = {
                changedFileCount: changedFiles.length,
                changedFiles,
                shortStat: result.data?.gitChanges?.shortStat,
              };
              runRecord.outputSummary = summarizeOutput(result.data?.output || '');
              runRecord.outputTruncated = result.data?.outputTruncated === true;
              persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
              applyContractSummary(runRecord, result.data?.agentTaskContract);
              applyExecutionSemanticsToRunRecord(runRecord, semantics);
              await safeUpdateRun(runStore, runRecord, 'needs confirmation update', warnRunStore);
            }
            await singleSpan.end({
              taskId: task.id,
              taskLabel: task.label,
              status: 'needs_confirmation',
              agentCli: agentCli || '',
              confirmationSource: source || 'unknown',
              confirmationStageStatus: status,
            });
            logToOutput(`任务 ${task.id} 需要人工确认（来源: ${source || 'unknown'}）`, 'warn');
            vscode.window.showWarningMessage(`任务 ${task.id} 需要人工确认（${source === 'post-execution' ? '执行后确认' : '执行前确认'}）`);
            return;
          }

          if (result.ok) {
            const output = result.data?.output || '';
            const gitChanges = result.data?.gitChanges;
            const changedFiles = gitChanges?.changedFiles ?? [];
            const resolved = resolveVerificationStatus(changedFiles, result.data?.verification, result.data?.agentExecutionOutcome);
            const finalStatus = resolved.status;

            task.lastRunId = runId;
            task.lastTraceId = traceContext.traceId;
            task.lastFailureKind = resolved.failureKind;
            setTaskDisplayState(task, finalStatus);
            tasksProvider.refresh();

            if (runRecord) {
              runRecord.status = finalStatus;
              runRecord.failureKind = resolved.failureKind;
              runRecord.updatedAt = new Date().toISOString();
              runRecord.endedAt = runRecord.updatedAt;
              runRecord.durationMs = Date.now() - startedAtMs;
              runRecord.command = result.data?.command || runRecord.command;
              runRecord.gitChanges = {
                changedFileCount: changedFiles.length,
                changedFiles,
                shortStat: gitChanges?.shortStat
              };
              runRecord.outputSummary = summarizeOutput(output);
              runRecord.outputTruncated = result.data?.outputTruncated === true;
              persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
              applyContractSummary(runRecord, result.data?.agentTaskContract);
              applyVerificationToRunRecord(runRecord, result.data?.verification);
              applyExecutionSemanticsToRunRecord(runRecord, semantics);
              await safeUpdateRun(runStore, runRecord, 'success update', warnRunStore);
            }

            if (finalStatus === 'failed_test') {
              logToOutput(`任务 ${task.id} Agent 成功但验证失败`, 'warn');
              vscode.window.showWarningMessage(`任务 ${task.id} 验证失败`);
            } else {
              logToOutput(`任务 ${task.id} 执行成功`);
              if (output) {
                logToOutput(output);
              }
              vscode.window.showInformationMessage(`任务 ${task.id} 执行成功`);
            }
            await singleSpan.end({
              taskId: task.id,
              taskLabel: task.label,
              status: finalStatus,
              agentCli: agentCli || '',
            });
          } else {
            if (result.data?.agentExecutionOutcome === 'planned_only') {
              task.lastFailureKind = undefined;
              setTaskDisplayState(task, 'ready');
              tasksProvider.refresh();
              if (runRecord) {
                runRecord.status = 'ready';
                runRecord.failureKind = undefined;
                runRecord.updatedAt = new Date().toISOString();
                runRecord.endedAt = runRecord.updatedAt;
                runRecord.durationMs = Date.now() - startedAtMs;
                runRecord.command = result.data?.command || runRecord.command;
                runRecord.outputSummary = summarizeOutput(result.data?.output);
                runRecord.outputTruncated = result.data?.outputTruncated === true;
                persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                applyContractSummary(runRecord, result.data?.agentTaskContract);
                applyExecutionSemanticsToRunRecord(runRecord, semantics);
                await safeUpdateRun(runStore, runRecord, 'planned-only reset update', warnRunStore);
              }
              logToOutput(`任务 ${task.id} 仅输出计划，未执行实现，已回退为 ready`, 'warn');
              await singleSpan.end({
                taskId: task.id,
                taskLabel: task.label,
                status: 'ready',
                agentCli: agentCli || '',
              });
              vscode.window.showWarningMessage(`任务 ${task.id} 仅输出计划，未执行实现`);
              return;
            }
            const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
            const resolved = resolveVerificationStatus(changedFiles, result.data?.verification, result.data?.agentExecutionOutcome);
            const verificationFailed = resolved.failureKind === 'test' || resolved.failureKind === 'system_internal';

            task.lastRunId = runId;
            task.lastTraceId = traceContext.traceId;

            if (verificationFailed) {
              const finalStatus = resolved.status;
              task.lastFailureKind = resolved.failureKind;
              setTaskDisplayState(task, finalStatus);
              tasksProvider.refresh();

              if (runRecord) {
                runRecord.status = finalStatus;
                runRecord.failureKind = resolved.failureKind;
                runRecord.updatedAt = new Date().toISOString();
                runRecord.endedAt = runRecord.updatedAt;
                runRecord.durationMs = Date.now() - startedAtMs;
                runRecord.command = result.data?.command || runRecord.command;
                runRecord.gitChanges = {
                  changedFileCount: changedFiles.length,
                  changedFiles,
                  shortStat: result.data?.gitChanges?.shortStat
                };
                runRecord.outputSummary = summarizeOutput(result.data?.output);
                runRecord.outputTruncated = result.data?.outputTruncated === true;
                persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                applyContractSummary(runRecord, result.data?.agentTaskContract);
                applyVerificationToRunRecord(runRecord, result.data?.verification);
                applyExecutionSemanticsToRunRecord(runRecord, semantics);
                await safeUpdateRun(runStore, runRecord, 'verification failed update', warnRunStore);
              }

              logToOutput(`任务 ${task.id} Agent 成功但验证失败`, 'warn');
              await singleSpan.end({
                taskId: task.id,
                taskLabel: task.label,
                status: finalStatus,
                agentCli: agentCli || '',
              });
              vscode.window.showWarningMessage(`任务 ${task.id} 验证失败`);
            } else {
              const resolvedError = resolveStructuredError(result);
              const errMsg = resolvedError.errorMessage || result.data?.output || '执行失败';
              const classified = classifyDocTaskFailure({
                ok: result.ok,
                exitCode: result.exitCode ?? undefined,
                errorCode: resolvedError.errorCode,
                errorMessage: errMsg,
                output: result.stderr || result.data?.output || result.stdout
              });

              task.lastFailureKind = classified.kind;
              setTaskDisplayState(task, classified.status);
              tasksProvider.refresh();

              if (runRecord) {
                runRecord.status = classified.status;
                runRecord.failureKind = classified.kind;
                runRecord.errorMessage = errMsg;
                runRecord.updatedAt = new Date().toISOString();
                runRecord.endedAt = runRecord.updatedAt;
                runRecord.durationMs = Date.now() - startedAtMs;
                runRecord.command = result.data?.command || runRecord.command;
                runRecord.outputSummary = summarizeOutput(resolvedError.outputSummarySource || result.data?.output || result.stderr || result.stdout);
                runRecord.outputTruncated = result.data?.outputTruncated === true;
                const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
                runRecord.gitChanges = {
                  changedFileCount: changedFiles.length,
                  changedFiles,
                  shortStat: result.data?.gitChanges?.shortStat
                };
                persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                applyContractSummary(runRecord, result.data?.agentTaskContract);
                applyExecutionSemanticsToRunRecord(runRecord, semantics);
                await safeUpdateRun(runStore, runRecord, 'failed update', warnRunStore);
              }

              logToOutput(`任务 ${task.id} 执行失败: ${errMsg}`, 'error');
              await singleSpan.fail(new Error(errMsg), {
                taskId: task.id,
                taskLabel: task.label,
                status: 'failed',
                agentCli: agentCli || '',
              });
              vscode.window.showErrorMessage(`任务 ${task.id} 执行失败: ${errMsg}`);
            }
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const classified = classifyDocTaskFailure({
          ok: false,
          cancelled: msg.includes('cancel'),
          errorMessage: msg
        });
        task.lastFailureKind = classified.kind;
        setTaskDisplayState(task, classified.status);
        tasksProvider.refresh();
        logToOutput(`任务 ${task.id} 执行异常: ${msg}`, 'error');
        vscode.window.showErrorMessage(`任务执行异常: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vectahubTasks.runAllDocTasks', async () => {
      if (tasksProvider.getIsBatchRunning()) {
        vscode.window.showWarningMessage('批量任务正在执行中，请稍候...');
        return;
      }

      const tasks = tasksProvider.getDocTasks();
      if (!tasks || tasks.length === 0) {
        vscode.window.showWarningMessage('当前没有解析到的任务，请先解析文档');
        return;
      }

      const runningTasks = tasks.filter(t => t.status === 'running');
      if (runningTasks.length > 0) {
        vscode.window.showWarningMessage(`当前有 ${runningTasks.length} 个任务正在执行中，请等待完成后再试`);
        return;
      }

      const docPath = tasksProvider.getSelectedDocPath();
      let agentCli = tasksProvider.getSelectedAgentCli();

      if (!agentCli) {
        await vscode.commands.executeCommand('vectahubTasks.selectAgentCli');
        agentCli = tasksProvider.getSelectedAgentCli();
        if (!agentCli) {
          vscode.window.showWarningMessage('请先选择 Agent CLI 执行器');
          return;
        }
      }

      const config = vscode.workspace.getConfiguration('vectahubTasks');
      const requestedMaxConcurrent = config.get<number>('maxConcurrentTasks', 3);
      const docContent = await readDocContentOnce(docPath);
      const contractSummaries = buildAgentTaskContractSummaries({
        tasks,
        docContent,
        projectRoot: workspaceRoot || '',
      });
      const concurrencyDecision = decideDocTaskBatchConcurrency({
        contracts: contractSummaries,
        requestedMaxConcurrent,
      });
      const maxConcurrent = concurrencyDecision.effectiveMaxConcurrent;
      const concurrencyLabel = concurrencyDecision.mode === 'parallel'
        ? `并行执行（最大并发: ${maxConcurrent}）`
        : `串行执行（原因: ${concurrencyDecision.reason}）`;
      logToOutput(`[batch] 边界预检完成: ${concurrencyDecision.mode}, ${concurrencyDecision.reason}, effectiveMaxConcurrent=${maxConcurrent}`);

      const confirm = await vscode.window.showInformationMessage(
        `即将${concurrencyLabel} ${tasks.length} 个任务`,
        { modal: true },
        '确认启动',
        '取消'
      );

      if (confirm !== '确认启动') return;

      const batchTraceContext = createRootTraceContext();
      const batchRunId = createBatchRunId();
      const batchSpan = startSpan('vscode.docTask.runBatch', {
        context: batchTraceContext,
        source: 'vscode',
        attributes: {
          taskId: 'batch',
          taskLabel: `count:${tasks.length}`,
          status: 'started',
          agentCli: agentCli || '',
          concurrencyMode: concurrencyDecision.mode,
          concurrencyReason: concurrencyDecision.reason,
          maxConcurrent,
        },
      });

      tasksProvider.setIsBatchRunning(true);
      runStore?.beginBatchWrites();
      let batchFlushError: unknown;

      const queue = [...tasks];
      let completedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const totalTasks = tasks.length;
      let cancelled = false;
      let globalFailureAfterBatch: { message: string; status: DocTaskRunStatus; kind?: string } | undefined;
      let batchRecord: DocTaskBatchRunRecord | undefined;
      const runRecordMap = new Map<string, DocTaskRunRecord>();
      const notStartedTaskIds = new Set(tasks.map(task => task.id));

      for (const task of tasks) {
        task.status = 'pending';
      }
      tasksProvider.setDocTasks(tasks);
      tasksProvider.refresh();

      try {
        try {
          batchRecord = runStore
            ? await runStore.startBatch({
                batchRunId,
                docPath,
                agentCli: agentCli!,
                traceId: batchTraceContext.traceId,
                totalCount: totalTasks
              })
            : undefined;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logToOutput(`[doc-task-run-store] startBatch 失败: ${msg}`, 'warn');
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `批量执行任务 (0/${totalTasks})`,
          cancellable: true
        }, async (progress, token) => {
          token.onCancellationRequested(() => {
            cancelled = true;
            logToOutput('[batch] 用户取消批量执行');
          });

          function updateProgress(taskId: string, label: string) {
            const activeCount = tasks.filter(t => t.status === 'running').length;
            progress.report({
              message: `${completedCount}/${totalTasks} 完成, ${activeCount} 运行中, ${failedCount} 失败, ${skippedCount} 跳过`,
              increment: (1 / totalTasks) * 100
          });
          logToOutput(`[batch] 任务 ${taskId} ${label} (${completedCount}/${totalTasks}, 失败: ${failedCount}, 跳过: ${skippedCount})`);
        }

        async function finalizeBatchSnapshot(): Promise<void> {
          if (!batchRecord) return;
          batchRecord.completedCount = completedCount;
          batchRecord.failedCount = failedCount;
          batchRecord.skippedCount = skippedCount;
          batchRecord.updatedAt = new Date().toISOString();
          await safeUpdateBatch(runStore, batchRecord, 'batch update', warnRunStore);
        }

        async function runSingleTask(task: DocTask): Promise<void> {
          if (cancelled) return;
          const taskContractSummary = contractSummaries.get(task.id);
          const runId = createRunId(task.id);
          const startedAtMs = Date.now();
          task.lastRunId = runId;
          task.lastTraceId = batchTraceContext.traceId;
          task.lastFailureKind = undefined;
          setTaskDisplayState(task, 'preflight');
          tasksProvider.refresh();

          const args = [
            'run-task', '--tool', agentCli!,
            '--task-id', task.id,
            '--task-label', task.label,
            '--json'
          ];
          if (docPath) args.push('--doc', docPath);

          let runRecord: DocTaskRunRecord | undefined;
          try {
            runRecord = runStore
              ? await runStore.startRun({
                  runId,
                  batchRunId,
                  taskId: task.id,
                  taskLabel: task.label,
                  docPath,
                  agentCli: agentCli!,
                  status: 'ready',
                  command: args.join(' '),
                  traceId: batchTraceContext.traceId,
                  agentTaskContract: toRunContractSummary(taskContractSummary)
                })
              : undefined;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logToOutput(`[doc-task-run-store] batch startRun 失败: ${msg}`, 'warn');
          }
          if (runRecord) {
            runRecordMap.set(task.id, runRecord);
            runRecord.status = 'preflight';
            runRecord.updatedAt = new Date().toISOString();
            await safeUpdateRun(runStore, runRecord, 'batch preflight update', warnRunStore);
          }

          const taskSpan = startSpan('vscode.docTask.runSingle', {
            context: batchTraceContext,
            parentSpanId: batchSpan.spanId,
            source: 'vscode',
            attributes: {
              taskId: task.id,
              taskLabel: task.label,
              status: 'running',
              agentCli: agentCli || '',
              boundaryConfidence: taskContractSummary?.boundaryConfidence || 'none',
              allowedFileCount: taskContractSummary?.allowedFiles.length || 0,
            },
          });

          setTaskDisplayState(task, 'running');
          notStartedTaskIds.delete(task.id);
          tasksProvider.refresh();
          if (runRecord) {
            runRecord.status = 'running';
            runRecord.updatedAt = new Date().toISOString();
            await safeUpdateRun(runStore, runRecord, 'batch running update', warnRunStore);
          }

          try {
            const result = await runCli<RunTaskResult>(args, {
              timeout: 600000,
              token,
              traceContext: { traceId: batchTraceContext.traceId, parentSpanId: taskSpan.spanId, source: 'vscode' },
            });
            const semantics = resolveRunTaskExecutionSemantics(result);

            if (semantics.needsConfirmation) {
              const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
              task.lastFailureKind = undefined;
              setTaskDisplayState(task, 'needs_confirmation');
              failedCount++;
              if (runRecord) {
                runRecord.status = 'needs_confirmation';
                runRecord.failureKind = undefined;
                runRecord.updatedAt = new Date().toISOString();
                runRecord.endedAt = runRecord.updatedAt;
                runRecord.durationMs = Date.now() - startedAtMs;
                runRecord.command = result.data?.command || runRecord.command;
                runRecord.gitChanges = {
                  changedFileCount: changedFiles.length,
                  changedFiles,
                  shortStat: result.data?.gitChanges?.shortStat
                };
                runRecord.outputSummary = summarizeOutput(result.data?.output || '');
                runRecord.outputTruncated = result.data?.outputTruncated === true;
                persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                applyExecutionSemanticsToRunRecord(runRecord, semantics);
                await safeUpdateRun(runStore, runRecord, 'batch needs confirmation update', warnRunStore);
              }
              await taskSpan.end({
                taskId: task.id,
                taskLabel: task.label,
                status: 'needs_confirmation',
                agentCli: agentCli || '',
                confirmationSource: semantics.confirmationSource || 'unknown',
              });
              logToOutput(`[batch] 任务 ${task.id} 需要人工确认（来源: ${semantics.confirmationSource || 'unknown'}）`, 'warn');
              updateProgress(task.id, '需确认');
              return;
            }

            if (result.ok) {
              const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
              const resolved = resolveVerificationStatus(changedFiles, result.data?.verification, result.data?.agentExecutionOutcome);
              const finalStatus = resolved.status;
              task.lastFailureKind = resolved.failureKind;
              setTaskDisplayState(task, finalStatus);
              if (resolved.status === 'failed_test') {
                failedCount++;
              }
              if (runRecord) {
                runRecord.status = finalStatus;
                runRecord.failureKind = resolved.failureKind;
                runRecord.updatedAt = new Date().toISOString();
                runRecord.endedAt = runRecord.updatedAt;
                runRecord.durationMs = Date.now() - startedAtMs;
                runRecord.command = result.data?.command || runRecord.command;
                runRecord.gitChanges = {
                  changedFileCount: changedFiles.length,
                  changedFiles,
                  shortStat: result.data?.gitChanges?.shortStat
                };
                runRecord.outputSummary = summarizeOutput(result.data?.output);
                runRecord.outputTruncated = result.data?.outputTruncated === true;
                persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                applyVerificationToRunRecord(runRecord, result.data?.verification);
                applyExecutionSemanticsToRunRecord(runRecord, semantics);
                await safeUpdateRun(runStore, runRecord, 'batch success update', warnRunStore);
              }
              await taskSpan.end({
                taskId: task.id,
                taskLabel: task.label,
                status: finalStatus,
                agentCli: agentCli || '',
              });
              if (finalStatus === 'failed_test') {
                logToOutput(`[batch] 任务 ${task.id} Agent 成功但验证失败`, 'warn');
                updateProgress(task.id, '验证失败');
              } else {
                updateProgress(task.id, '完成');
              }
            } else {
              if (result.data?.agentExecutionOutcome === 'planned_only') {
                task.lastFailureKind = undefined;
                setTaskDisplayState(task, 'ready');
                skippedCount++;
                if (runRecord) {
                  runRecord.status = 'ready';
                  runRecord.failureKind = undefined;
                  runRecord.updatedAt = new Date().toISOString();
                  runRecord.endedAt = runRecord.updatedAt;
                  runRecord.durationMs = Date.now() - startedAtMs;
                  runRecord.command = result.data?.command || runRecord.command;
                  runRecord.outputSummary = summarizeOutput(result.data?.output);
                  runRecord.outputTruncated = result.data?.outputTruncated === true;
                  persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                  applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                  applyExecutionSemanticsToRunRecord(runRecord, semantics);
                  await safeUpdateRun(runStore, runRecord, 'batch planned-only reset update', warnRunStore);
                }
                logToOutput(`[batch] 任务 ${task.id} 仅输出计划，未执行实现，已回退为 ready`, 'warn');
                await taskSpan.end({
                  taskId: task.id,
                  taskLabel: task.label,
                  status: 'ready',
                  agentCli: agentCli || '',
                });
                updateProgress(task.id, '待执行');
                return;
              }
              const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
              const resolved = resolveVerificationStatus(changedFiles, result.data?.verification, result.data?.agentExecutionOutcome);
              const verificationFailed = resolved.failureKind === 'test' || resolved.failureKind === 'system_internal';

              if (verificationFailed) {
                const finalStatus = resolved.status;
                task.lastFailureKind = resolved.failureKind;
                setTaskDisplayState(task, finalStatus);
                failedCount++;
                if (runRecord) {
                  runRecord.status = finalStatus;
                  runRecord.failureKind = resolved.failureKind;
                  runRecord.updatedAt = new Date().toISOString();
                  runRecord.endedAt = runRecord.updatedAt;
                  runRecord.durationMs = Date.now() - startedAtMs;
                  runRecord.command = result.data?.command || runRecord.command;
                  runRecord.gitChanges = {
                    changedFileCount: changedFiles.length,
                    changedFiles,
                    shortStat: result.data?.gitChanges?.shortStat
                  };
                  runRecord.outputSummary = summarizeOutput(result.data?.output);
                  runRecord.outputTruncated = result.data?.outputTruncated === true;
                  persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                  applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                  applyVerificationToRunRecord(runRecord, result.data?.verification);
                  applyExecutionSemanticsToRunRecord(runRecord, semantics);
                  await safeUpdateRun(runStore, runRecord, 'batch verification failed update', warnRunStore);
                }
                logToOutput(`[batch] 任务 ${task.id} Agent 成功但验证失败`, 'warn');
                await taskSpan.end({
                  taskId: task.id,
                  taskLabel: task.label,
                  status: finalStatus,
                  agentCli: agentCli || '',
                });
                updateProgress(task.id, '验证失败');
              } else {
                const resolvedError = resolveStructuredError(result);
                const errMsg = resolvedError.errorMessage || result.data?.output || result.error?.message || '执行失败';
                const classified = classifyDocTaskFailure({
                  ok: result.ok,
                  exitCode: result.exitCode ?? undefined,
                  errorCode: resolvedError.errorCode,
                  errorMessage: errMsg,
                  output: result.stderr || result.data?.output || result.stdout
                });
                task.lastFailureKind = classified.kind;
                setTaskDisplayState(task, classified.status);
                failedCount++;
                if (runRecord) {
                  runRecord.status = classified.status;
                  runRecord.failureKind = classified.kind;
                  runRecord.errorMessage = errMsg;
                  runRecord.updatedAt = new Date().toISOString();
                  runRecord.endedAt = runRecord.updatedAt;
                  runRecord.durationMs = Date.now() - startedAtMs;
                  runRecord.command = result.data?.command || runRecord.command;
                  const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
                  runRecord.gitChanges = {
                    changedFileCount: changedFiles.length,
                    changedFiles,
                    shortStat: result.data?.gitChanges?.shortStat
                  };
                  runRecord.outputSummary = summarizeOutput(resolvedError.outputSummarySource || result.data?.output || result.stderr || result.stdout);
                  runRecord.outputTruncated = result.data?.outputTruncated === true;
                  persistContractHashFromCliResult(runRecord, result.data?.agentTaskContract);
                  applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                  applyExecutionSemanticsToRunRecord(runRecord, semantics);
                  await safeUpdateRun(runStore, runRecord, 'batch failed update', warnRunStore);
                }
                logToOutput(`[batch] 任务 ${task.id} 失败: ${errMsg}`, 'error');
                await taskSpan.fail(new Error(errMsg), {
                  taskId: task.id,
                  taskLabel: task.label,
                  status: classified.status,
                  agentCli: agentCli || '',
                });
                updateProgress(task.id, '失败');
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const classified = classifyDocTaskFailure({
              ok: false,
              cancelled: cancelled || errMsg.includes('cancel'),
              errorMessage: errMsg
            });
            task.lastFailureKind = classified.kind;
            setTaskDisplayState(task, classified.status);
            failedCount++;
            if (runRecord) {
              runRecord.status = classified.status;
              runRecord.failureKind = classified.kind;
              runRecord.errorMessage = errMsg;
              runRecord.updatedAt = new Date().toISOString();
              runRecord.endedAt = runRecord.updatedAt;
              runRecord.durationMs = Date.now() - startedAtMs;
              persistContractHashFromCliResult(runRecord, undefined);
              applyContractSummary(runRecord, undefined, taskContractSummary);
              await safeUpdateRun(runStore, runRecord, 'batch exception update', warnRunStore);
            }
            logToOutput(`[batch] 任务 ${task.id} 异常: ${errMsg}`, 'error');
            await taskSpan.fail(err, {
              taskId: task.id,
              taskLabel: task.label,
              status: classified.status,
              agentCli: agentCli || '',
            });
            updateProgress(task.id, '异常');
          } finally {
            completedCount++;
            tasksProvider.refresh();
            await finalizeBatchSnapshot();
          }
        }

        async function runWithConcurrency(): Promise<void> {
          const active: Promise<void>[] = [];

          while (queue.length > 0 && !cancelled) {
            while (active.length < maxConcurrent && queue.length > 0 && !cancelled) {
              const task = queue.shift()!;
              const p = runSingleTask(task).finally(() => {
                const idx = active.indexOf(p);
                if (idx >= 0) active.splice(idx, 1);
              });
              active.push(p);
            }
            if (active.length > 0) {
              await Promise.race(active);
            }
          }

          await Promise.allSettled(active);
        }

        if (!agentCli) {
          globalFailureAfterBatch = {
            message: '未选择 Agent CLI 执行器',
            status: 'failed_config',
            kind: 'config'
          };
          cancelled = true;
        } else {
          // Batch risk assessment: collect all high-risk validation commands upfront
          const riskItems = await collectBatchRiskItems(tasks, contractSummaries);
          if (riskItems.length > 0) {
            const riskDecision = await showBatchRiskDialog(riskItems);
            if (riskDecision === 'cancel') {
              cancelled = true;
            } else if (riskDecision === 'skip') {
              logToOutput(`[batch] 用户选择跳过 ${riskItems.length} 个高风险验证命令`, 'warn');
              // mark skipped tasks and remove them from queue
              const skipTaskIds = new Set(riskItems.map(r => r.taskId));
              for (const task of [...queue]) {
                if (skipTaskIds.has(task.id)) {
                  setTaskDisplayState(task, 'changed');
                  skippedCount++;
                  completedCount++;
                  const idx = queue.indexOf(task);
                  if (idx >= 0) queue.splice(idx, 1);
                  notStartedTaskIds.delete(task.id);
                }
              }
              tasksProvider.refresh();
            }
          }
          if (!cancelled) {
            await runWithConcurrency();
          }
        }

        if (notStartedTaskIds.size > 0) {
          const finalStatus: DocTaskRunStatus = cancelled && !globalFailureAfterBatch ? 'cancelled' : (globalFailureAfterBatch?.status ?? 'failed_config');
          const now = new Date().toISOString();
          for (const task of tasks) {
            if (!notStartedTaskIds.has(task.id)) continue;
            const taskContractSummary = contractSummaries.get(task.id);
            task.lastFailureKind = finalStatus === 'cancelled'
              ? 'cancelled'
              : (globalFailureAfterBatch?.kind === 'config' ? 'config' : 'unknown');
            setTaskDisplayState(task, finalStatus);
            skippedCount++;
            completedCount++;
            let runRecord = runRecordMap.get(task.id);
            if (!runRecord) {
              const runId = task.lastRunId || createRunId(task.id);
              task.lastRunId = runId;
              task.lastTraceId = batchTraceContext.traceId;
              try {
                runRecord = runStore
                  ? await runStore.startRun({
                      runId,
                      batchRunId,
                      taskId: task.id,
                      taskLabel: task.label,
                      docPath,
                      agentCli: agentCli || '',
                      status: 'ready',
                      traceId: batchTraceContext.traceId,
                      agentTaskContract: toRunContractSummary(taskContractSummary)
                    })
                  : undefined;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logToOutput(`[doc-task-run-store] batch补录 startRun 失败: ${msg}`, 'warn');
              }
            }
            if (runRecord) {
              runRecord.status = finalStatus;
              runRecord.failureKind = task.lastFailureKind;
              runRecord.errorMessage = globalFailureAfterBatch?.message;
              runRecord.updatedAt = now;
              runRecord.endedAt = now;
              runRecord.durationMs = 0;
              persistContractHashFromCliResult(runRecord, undefined);
              applyContractSummary(runRecord, undefined, taskContractSummary);
              await safeUpdateRun(runStore, runRecord, 'batch finalize pending update', warnRunStore);
            }
          }
          await finalizeBatchSnapshot();
          tasksProvider.refresh();
        }

        const successCount = tasks.filter(t => t.status === 'success' || t.status === 'changed').length;
        const msg = failedCount === 0
          ? `批量执行完成: ${successCount} 成功, ${skippedCount} 跳过`
          : `批量执行完成: ${successCount} 成功, ${failedCount} 失败, ${skippedCount} 跳过`;

        logToOutput(`[batch] ${msg}`);

        if (cancelled) {
          if (batchRecord) {
            batchRecord.status = globalFailureAfterBatch ? 'failed' : 'cancelled';
            batchRecord.endedAt = new Date().toISOString();
            await finalizeBatchSnapshot();
          }
          await batchSpan.fail(new Error('Command was cancelled by user'), {
            taskId: 'batch',
            taskLabel: `count:${tasks.length}`,
            status: globalFailureAfterBatch ? 'failed' : 'cancelled',
            agentCli: agentCli || '',
          });
          if (globalFailureAfterBatch) {
            vscode.window.showWarningMessage(`批量执行失败: ${globalFailureAfterBatch.message}`);
          } else {
            vscode.window.showWarningMessage(`批量执行已取消 (${successCount} 成功, ${failedCount} 失败)`);
          }
        } else if (failedCount === 0) {
          if (batchRecord) {
            batchRecord.status = 'success';
            batchRecord.endedAt = new Date().toISOString();
            await finalizeBatchSnapshot();
          }
          await batchSpan.end({
            taskId: 'batch',
            taskLabel: `count:${tasks.length}`,
            status: 'success',
            agentCli: agentCli || '',
          });
          vscode.window.showInformationMessage(msg);
        } else {
          if (batchRecord) {
            batchRecord.status = 'failed';
            batchRecord.endedAt = new Date().toISOString();
            await finalizeBatchSnapshot();
          }
          await batchSpan.fail(new Error(msg), {
            taskId: 'batch',
            taskLabel: `count:${tasks.length}`,
            status: 'failed',
            agentCli: agentCli || '',
          });
          vscode.window.showWarningMessage(msg);
        }
      });
      } finally {
        try {
          await runStore?.endBatchWrites();
        } catch (err) {
          batchFlushError = err;
          const msg = err instanceof Error ? err.message : String(err);
          warnRunStore(`[doc-task-run-store] batch flush 失败: ${msg}`);
        }
        tasksProvider.setIsBatchRunning(false);
        tasksProvider.refresh();
      }
      if (batchFlushError) {
        throw batchFlushError;
      }
    })
  );
}
