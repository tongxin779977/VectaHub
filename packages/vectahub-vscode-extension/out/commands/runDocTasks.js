"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDocTaskCommands = registerDocTaskCommands;
const vscode = __importStar(require("vscode"));
const fs_1 = require("fs");
const adapter_js_1 = require("../cli/adapter.js");
const output_js_1 = require("../ui/output.js");
const index_js_1 = require("../trace/index.js");
const docTaskState_js_1 = require("../project/docTaskState.js");
const docTaskRunStore_js_1 = require("../project/docTaskRunStore.js");
const docTaskContract_js_1 = require("../project/docTaskContract.js");
const docTaskRunHelpers_js_1 = require("./docTaskRunHelpers.js");
const docTaskStatusHelpers_js_1 = require("./docTaskStatusHelpers.js");
const riskUI_js_1 = require("../security/riskUI.js");
const CRITICAL_RISK_PATTERNS = [
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
const HIGH_RISK_PATTERNS = [
    /^iptables/i,
    /^ip6tables/i,
    /^ufw/i,
    /^firewall-cmd/i,
    /^mv\s+\/\s+/i,
    />\s*\/etc\//i,
    />>\s*\/etc\//i,
    /^mount\s+.*--bind/i,
];
function assessValidationCommandRisk(cmd) {
    for (const pattern of CRITICAL_RISK_PATTERNS) {
        if (pattern.test(cmd))
            return { level: 'critical', ruleName: 'critical-risk-pattern' };
    }
    for (const pattern of HIGH_RISK_PATTERNS) {
        if (pattern.test(cmd))
            return { level: 'high', ruleName: 'high-risk-pattern' };
    }
    return { level: 'safe' };
}
async function collectBatchRiskItems(tasks, contractSummaries) {
    const items = [];
    for (const task of tasks) {
        const contract = contractSummaries.get(task.id);
        if (!contract?.validationCommands)
            continue;
        for (const cmd of contract.validationCommands) {
            const risk = assessValidationCommandRisk(cmd);
            if (risk.level === 'high' || risk.level === 'critical') {
                items.push({ taskId: task.id, taskLabel: task.label, cmd, level: risk.level, ruleName: risk.ruleName });
            }
        }
    }
    return items;
}
async function showBatchRiskDialog(riskItems) {
    const summary = riskItems
        .map(r => `[${r.level.toUpperCase()}] ${r.taskId}: ${r.cmd}`)
        .join('\n');
    const result = await vscode.window.showWarningMessage(`检测到 ${riskItems.length} 个高风险验证命令`, { modal: true, detail: summary }, '全部继续', '全部跳过高风险', '取消批量');
    if (result === '全部继续')
        return 'continue';
    if (result === '全部跳过高风险')
        return 'skip';
    return 'cancel';
}
function resolveStructuredError(result) {
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
function normalizeAgentCliInfo(raw) {
    return {
        name: raw.name ?? '',
        installed: raw.installed === true,
        version: raw.version,
        configured_enabled: raw.configured_enabled === true,
        has_permission: raw.has_permission === true,
        invocable: raw.invocable === true,
        // Fail-closed for old CLI payloads missing ready.
        ready: raw.ready === true,
    };
}
function formatAgentAvailabilityMessage(agents) {
    const available = agents.filter(a => a.installed && a.configured_enabled && a.has_permission && a.invocable && a.ready).map(a => a.name);
    const installedButDisabled = agents.filter(a => a.installed && !a.configured_enabled).map(a => a.name);
    const installedButNoPermission = agents.filter(a => a.installed && !a.has_permission).map(a => a.name);
    const installedButNotInvocable = agents.filter(a => a.installed && a.has_permission && !a.invocable).map(a => a.name);
    const installedButNotReady = agents
        .filter(a => a.installed && a.has_permission && a.invocable && !a.ready)
        .map(a => a.name);
    const notInstalled = agents.filter(a => !a.installed).map(a => a.name);
    const parts = [];
    if (available.length > 0)
        parts.push(`可用: ${available.join(', ')}`);
    if (installedButDisabled.length > 0)
        parts.push(`已安装但未启用: ${installedButDisabled.join(', ')}`);
    if (installedButNoPermission.length > 0)
        parts.push(`已安装但未授权: ${installedButNoPermission.join(', ')}`);
    if (installedButNotInvocable.length > 0)
        parts.push(`已安装但不可调用: ${installedButNotInvocable.join(', ')}`);
    if (installedButNotReady.length > 0)
        parts.push(`已安装但未就绪: ${installedButNotReady.join(', ')}`);
    if (notInstalled.length > 0)
        parts.push(`未安装: ${notInstalled.join(', ')}`);
    if (parts.length === 0) {
        return '未检测到可用的 AI Agent CLI，请先安装并授权 gemini/claude/codex/aider 等工具';
    }
    return `未检测到可用的 AI Agent CLI。${parts.join('；')}`;
}
async function readDocContentOnce(docPath) {
    if (!docPath)
        return undefined;
    try {
        return await fs_1.promises.readFile(docPath, 'utf8');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        (0, output_js_1.logToOutput)(`[batch] 合同预检读取文档失败，降级串行: ${msg}`, 'warn');
        return undefined;
    }
}
function applyContractSummary(runRecord, resultSummary, fallbackSummary) {
    if (!runRecord)
        return;
    runRecord.agentTaskContract = (0, docTaskContract_js_1.toRunContractSummary)(resultSummary ?? fallbackSummary);
}
function applyVerificationToRunRecord(runRecord, verification) {
    if (!runRecord || !verification)
        return;
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
function registerDocTaskCommands(context, tasksProvider) {
    const workspaceRoot = (0, adapter_js_1.getActiveWorkspaceFolder)();
    const runStore = workspaceRoot ? (0, docTaskRunStore_js_1.createDocTaskRunStore)(workspaceRoot) : undefined;
    const warnRunStore = (message) => (0, output_js_1.logToOutput)(message, 'warn');
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.selectDocFile', async () => {
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
        if (!uris || uris.length === 0)
            return;
        const filePath = uris[0].fsPath;
        tasksProvider.setSelectedDocPath(filePath);
        tasksProvider.setDocTasks([]);
        tasksProvider.setIsDocParsing(false);
        tasksProvider.refresh();
        (0, output_js_1.logToOutput)(`已选择文档: ${filePath}`);
        await vscode.commands.executeCommand('vectahubTasks.parseDocTasks');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.parseDocTasks', async () => {
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
                const result = await (0, adapter_js_1.runCli)(['parse-doc', docPath, '--json'], { timeout: 120000 });
                if (result.ok && result.data?.tasks) {
                    const docContent = await readDocContentOnce(docPath);
                    const tasksWithState = await (0, docTaskRunHelpers_js_1.applyLatestRunState)(runStore, result.data.tasks, warnRunStore, docContent, workspaceRoot);
                    tasksProvider.setDocTasks(tasksWithState);
                    (0, output_js_1.logToOutput)(`解析完成，共 ${tasksWithState.length} 个任务`);
                    vscode.window.showInformationMessage(`解析完成，共 ${tasksWithState.length} 个任务`);
                }
                else {
                    const errMsg = result.data?.error || result.error?.message || '解析失败';
                    (0, output_js_1.logToOutput)(`解析失败: ${errMsg}`, 'error');
                    vscode.window.showErrorMessage(`解析失败: ${errMsg}`);
                }
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            (0, output_js_1.logToOutput)(`解析异常: ${msg}`, 'error');
            vscode.window.showErrorMessage(`解析异常: ${msg}`);
        }
        finally {
            tasksProvider.setIsDocParsing(false);
            tasksProvider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.selectAgentCli', async () => {
        const result = await (0, adapter_js_1.runCli)(['tools', 'agents', '--json']);
        const items = [];
        if (result.ok && result.data?.agents) {
            const normalizedAgents = result.data.agents.map(agent => normalizeAgentCliInfo(agent));
            const installedAgents = normalizedAgents
                .filter(a => a.installed && a.configured_enabled && a.has_permission && a.invocable && a.ready);
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
        if (!selected)
            return;
        if (selected.label === '手动输入') {
            const customName = await vscode.window.showInputBox({
                prompt: '输入 Agent CLI 名称',
                placeHolder: 'aider'
            });
            if (customName) {
                tasksProvider.setSelectedAgentCli(customName);
                tasksProvider.refresh();
            }
        }
        else {
            tasksProvider.setSelectedAgentCli(selected.label);
            tasksProvider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.runDocTask', async (task) => {
        if (task.status === 'running')
            return;
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
            const traceContext = (0, index_js_1.createRootTraceContext)();
            let runRecord;
            const runId = (0, docTaskRunHelpers_js_1.createRunId)(task.id);
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
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                (0, output_js_1.logToOutput)(`[doc-task-run-store] startRun 失败: ${msg}`, 'warn');
            }
            task.lastRunId = runId;
            task.lastTraceId = traceContext.traceId;
            task.lastFailureKind = undefined;
            (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, 'preflight');
            tasksProvider.refresh();
            if (runRecord) {
                runRecord.status = 'preflight';
                runRecord.updatedAt = new Date().toISOString();
                await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'preflight update', warnRunStore);
            }
            const singleSpan = (0, index_js_1.startSpan)('vscode.docTask.runSingle', {
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
                (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, 'running');
                tasksProvider.refresh();
                if (runRecord) {
                    runRecord.status = 'running';
                    runRecord.updatedAt = new Date().toISOString();
                    await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'running update', warnRunStore);
                }
                (0, output_js_1.logToOutput)(`开始执行任务: ${task.id} - ${task.label} (工具: ${agentCli})`);
                const result = await (0, adapter_js_1.runCli)(args, {
                    timeout: 600000,
                    token,
                    traceContext: { traceId: traceContext.traceId, parentSpanId: singleSpan.spanId, source: 'vscode' },
                });
                // Check if CLI returned a high-risk assessment requiring user confirmation
                if (result.ok && result.data?.riskAssessment?.needsConfirmation) {
                    const risk = result.data.riskAssessment;
                    const confirmed = await (0, riskUI_js_1.confirmHighRiskCommand)({ level: risk.level, ruleName: risk.ruleName, needsConfirmation: true }, `${task.id}: ${task.label}`);
                    if (!confirmed) {
                        (0, output_js_1.logToOutput)(`任务 ${task.id} 用户拒绝高风险命令执行`, 'warn');
                        (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, 'cancelled');
                        tasksProvider.refresh();
                        if (runRecord) {
                            runRecord.status = 'cancelled';
                            runRecord.updatedAt = new Date().toISOString();
                            runRecord.endedAt = runRecord.updatedAt;
                            runRecord.durationMs = Date.now() - startedAtMs;
                            await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'risk-cancelled update', warnRunStore);
                        }
                        await singleSpan.end({ taskId: task.id, status: 'cancelled' });
                        return;
                    }
                    (0, output_js_1.logToOutput)(`任务 ${task.id} 用户确认高风险命令继续执行`, 'warn');
                }
                if (result.ok) {
                    const output = result.data?.output || '';
                    const gitChanges = result.data?.gitChanges;
                    const changedFiles = gitChanges?.changedFiles ?? [];
                    const resolved = (0, docTaskStatusHelpers_js_1.resolveVerificationStatus)(changedFiles, result.data?.verification);
                    const finalStatus = resolved.status;
                    task.lastRunId = runId;
                    task.lastTraceId = traceContext.traceId;
                    task.lastFailureKind = resolved.failureKind;
                    (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, finalStatus);
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
                        runRecord.outputSummary = (0, docTaskRunHelpers_js_1.summarizeOutput)(output);
                        runRecord.outputTruncated = result.data?.outputTruncated === true;
                        (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, result.data?.agentTaskContract);
                        applyContractSummary(runRecord, result.data?.agentTaskContract);
                        applyVerificationToRunRecord(runRecord, result.data?.verification);
                        await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'success update', warnRunStore);
                    }
                    if (finalStatus === 'failed_test') {
                        (0, output_js_1.logToOutput)(`任务 ${task.id} Agent 成功但验证失败`, 'warn');
                        vscode.window.showWarningMessage(`任务 ${task.id} 验证失败`);
                    }
                    else {
                        (0, output_js_1.logToOutput)(`任务 ${task.id} 执行成功`);
                        if (output) {
                            (0, output_js_1.logToOutput)(output);
                        }
                        vscode.window.showInformationMessage(`任务 ${task.id} 执行成功`);
                    }
                    await singleSpan.end({
                        taskId: task.id,
                        taskLabel: task.label,
                        status: finalStatus,
                        agentCli: agentCli || '',
                    });
                }
                else {
                    const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
                    const resolved = (0, docTaskStatusHelpers_js_1.resolveVerificationStatus)(changedFiles, result.data?.verification);
                    const verificationFailed = resolved.failureKind === 'test' || resolved.failureKind === 'system_internal';
                    task.lastRunId = runId;
                    task.lastTraceId = traceContext.traceId;
                    if (verificationFailed) {
                        const finalStatus = resolved.status;
                        task.lastFailureKind = resolved.failureKind;
                        (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, finalStatus);
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
                            runRecord.outputSummary = (0, docTaskRunHelpers_js_1.summarizeOutput)(result.data?.output);
                            runRecord.outputTruncated = result.data?.outputTruncated === true;
                            (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, result.data?.agentTaskContract);
                            applyContractSummary(runRecord, result.data?.agentTaskContract);
                            applyVerificationToRunRecord(runRecord, result.data?.verification);
                            await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'verification failed update', warnRunStore);
                        }
                        (0, output_js_1.logToOutput)(`任务 ${task.id} Agent 成功但验证失败`, 'warn');
                        await singleSpan.end({
                            taskId: task.id,
                            taskLabel: task.label,
                            status: finalStatus,
                            agentCli: agentCli || '',
                        });
                        vscode.window.showWarningMessage(`任务 ${task.id} 验证失败`);
                    }
                    else {
                        const resolvedError = resolveStructuredError(result);
                        const errMsg = resolvedError.errorMessage || result.data?.output || '执行失败';
                        const classified = (0, docTaskState_js_1.classifyDocTaskFailure)({
                            ok: result.ok,
                            exitCode: result.exitCode ?? undefined,
                            errorCode: resolvedError.errorCode,
                            errorMessage: errMsg,
                            output: result.stderr || result.data?.output || result.stdout
                        });
                        task.lastFailureKind = classified.kind;
                        (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, classified.status);
                        tasksProvider.refresh();
                        if (runRecord) {
                            runRecord.status = classified.status;
                            runRecord.failureKind = classified.kind;
                            runRecord.errorMessage = errMsg;
                            runRecord.updatedAt = new Date().toISOString();
                            runRecord.endedAt = runRecord.updatedAt;
                            runRecord.durationMs = Date.now() - startedAtMs;
                            runRecord.command = result.data?.command || runRecord.command;
                            runRecord.outputSummary = (0, docTaskRunHelpers_js_1.summarizeOutput)(resolvedError.outputSummarySource || result.data?.output || result.stderr || result.stdout);
                            runRecord.outputTruncated = result.data?.outputTruncated === true;
                            const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
                            runRecord.gitChanges = {
                                changedFileCount: changedFiles.length,
                                changedFiles,
                                shortStat: result.data?.gitChanges?.shortStat
                            };
                            (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, result.data?.agentTaskContract);
                            applyContractSummary(runRecord, result.data?.agentTaskContract);
                            await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'failed update', warnRunStore);
                        }
                        (0, output_js_1.logToOutput)(`任务 ${task.id} 执行失败: ${errMsg}`, 'error');
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const classified = (0, docTaskState_js_1.classifyDocTaskFailure)({
                ok: false,
                cancelled: msg.includes('cancel'),
                errorMessage: msg
            });
            task.lastFailureKind = classified.kind;
            (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, classified.status);
            tasksProvider.refresh();
            (0, output_js_1.logToOutput)(`任务 ${task.id} 执行异常: ${msg}`, 'error');
            vscode.window.showErrorMessage(`任务执行异常: ${msg}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('vectahubTasks.runAllDocTasks', async () => {
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
        const requestedMaxConcurrent = config.get('maxConcurrentTasks', 3);
        const docContent = await readDocContentOnce(docPath);
        const contractSummaries = (0, docTaskContract_js_1.buildAgentTaskContractSummaries)({
            tasks,
            docContent,
            projectRoot: workspaceRoot || '',
        });
        const concurrencyDecision = (0, docTaskContract_js_1.decideDocTaskBatchConcurrency)({
            contracts: contractSummaries,
            requestedMaxConcurrent,
        });
        const maxConcurrent = concurrencyDecision.effectiveMaxConcurrent;
        const concurrencyLabel = concurrencyDecision.mode === 'parallel'
            ? `并行执行（最大并发: ${maxConcurrent}）`
            : `串行执行（原因: ${concurrencyDecision.reason}）`;
        (0, output_js_1.logToOutput)(`[batch] 边界预检完成: ${concurrencyDecision.mode}, ${concurrencyDecision.reason}, effectiveMaxConcurrent=${maxConcurrent}`);
        const confirm = await vscode.window.showInformationMessage(`即将${concurrencyLabel} ${tasks.length} 个任务`, { modal: true }, '确认启动', '取消');
        if (confirm !== '确认启动')
            return;
        const batchTraceContext = (0, index_js_1.createRootTraceContext)();
        const batchRunId = (0, docTaskRunHelpers_js_1.createBatchRunId)();
        const batchSpan = (0, index_js_1.startSpan)('vscode.docTask.runBatch', {
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
        const queue = [...tasks];
        let completedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        const totalTasks = tasks.length;
        let cancelled = false;
        let globalFailureAfterBatch;
        let batchRecord;
        const runRecordMap = new Map();
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
                        agentCli: agentCli,
                        traceId: batchTraceContext.traceId,
                        totalCount: totalTasks
                    })
                    : undefined;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                (0, output_js_1.logToOutput)(`[doc-task-run-store] startBatch 失败: ${msg}`, 'warn');
            }
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `批量执行任务 (0/${totalTasks})`,
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    cancelled = true;
                    (0, output_js_1.logToOutput)('[batch] 用户取消批量执行');
                });
                function updateProgress(taskId, label) {
                    const activeCount = tasks.filter(t => t.status === 'running').length;
                    progress.report({
                        message: `${completedCount}/${totalTasks} 完成, ${activeCount} 运行中, ${failedCount} 失败, ${skippedCount} 跳过`,
                        increment: (1 / totalTasks) * 100
                    });
                    (0, output_js_1.logToOutput)(`[batch] 任务 ${taskId} ${label} (${completedCount}/${totalTasks}, 失败: ${failedCount}, 跳过: ${skippedCount})`);
                }
                async function finalizeBatchSnapshot() {
                    if (!batchRecord)
                        return;
                    batchRecord.completedCount = completedCount;
                    batchRecord.failedCount = failedCount;
                    batchRecord.skippedCount = skippedCount;
                    batchRecord.updatedAt = new Date().toISOString();
                    await (0, docTaskRunHelpers_js_1.safeUpdateBatch)(runStore, batchRecord, 'batch update', warnRunStore);
                }
                async function runSingleTask(task) {
                    if (cancelled)
                        return;
                    const taskContractSummary = contractSummaries.get(task.id);
                    const runId = (0, docTaskRunHelpers_js_1.createRunId)(task.id);
                    const startedAtMs = Date.now();
                    task.lastRunId = runId;
                    task.lastTraceId = batchTraceContext.traceId;
                    task.lastFailureKind = undefined;
                    (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, 'preflight');
                    tasksProvider.refresh();
                    const args = [
                        'run-task', '--tool', agentCli,
                        '--task-id', task.id,
                        '--task-label', task.label,
                        '--json'
                    ];
                    if (docPath)
                        args.push('--doc', docPath);
                    let runRecord;
                    try {
                        runRecord = runStore
                            ? await runStore.startRun({
                                runId,
                                batchRunId,
                                taskId: task.id,
                                taskLabel: task.label,
                                docPath,
                                agentCli: agentCli,
                                status: 'ready',
                                command: args.join(' '),
                                traceId: batchTraceContext.traceId,
                                agentTaskContract: (0, docTaskContract_js_1.toRunContractSummary)(taskContractSummary)
                            })
                            : undefined;
                    }
                    catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        (0, output_js_1.logToOutput)(`[doc-task-run-store] batch startRun 失败: ${msg}`, 'warn');
                    }
                    if (runRecord) {
                        runRecordMap.set(task.id, runRecord);
                        runRecord.status = 'preflight';
                        runRecord.updatedAt = new Date().toISOString();
                        await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'batch preflight update', warnRunStore);
                    }
                    const taskSpan = (0, index_js_1.startSpan)('vscode.docTask.runSingle', {
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
                    (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, 'running');
                    notStartedTaskIds.delete(task.id);
                    tasksProvider.refresh();
                    if (runRecord) {
                        runRecord.status = 'running';
                        runRecord.updatedAt = new Date().toISOString();
                        await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'batch running update', warnRunStore);
                    }
                    try {
                        const result = await (0, adapter_js_1.runCli)(args, {
                            timeout: 600000,
                            token,
                            traceContext: { traceId: batchTraceContext.traceId, parentSpanId: taskSpan.spanId, source: 'vscode' },
                        });
                        if (result.ok) {
                            const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
                            const resolved = (0, docTaskStatusHelpers_js_1.resolveVerificationStatus)(changedFiles, result.data?.verification);
                            const finalStatus = resolved.status;
                            task.lastFailureKind = resolved.failureKind;
                            (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, finalStatus);
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
                                runRecord.outputSummary = (0, docTaskRunHelpers_js_1.summarizeOutput)(result.data?.output);
                                runRecord.outputTruncated = result.data?.outputTruncated === true;
                                (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, result.data?.agentTaskContract);
                                applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                                applyVerificationToRunRecord(runRecord, result.data?.verification);
                                await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'batch success update', warnRunStore);
                            }
                            await taskSpan.end({
                                taskId: task.id,
                                taskLabel: task.label,
                                status: finalStatus,
                                agentCli: agentCli || '',
                            });
                            if (finalStatus === 'failed_test') {
                                (0, output_js_1.logToOutput)(`[batch] 任务 ${task.id} Agent 成功但验证失败`, 'warn');
                                updateProgress(task.id, '验证失败');
                            }
                            else {
                                updateProgress(task.id, '完成');
                            }
                        }
                        else {
                            const changedFiles = result.data?.gitChanges?.changedFiles ?? [];
                            const resolved = (0, docTaskStatusHelpers_js_1.resolveVerificationStatus)(changedFiles, result.data?.verification);
                            const verificationFailed = resolved.failureKind === 'test' || resolved.failureKind === 'system_internal';
                            if (verificationFailed) {
                                const finalStatus = resolved.status;
                                task.lastFailureKind = resolved.failureKind;
                                (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, finalStatus);
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
                                    runRecord.outputSummary = (0, docTaskRunHelpers_js_1.summarizeOutput)(result.data?.output);
                                    runRecord.outputTruncated = result.data?.outputTruncated === true;
                                    (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, result.data?.agentTaskContract);
                                    applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                                    applyVerificationToRunRecord(runRecord, result.data?.verification);
                                    await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'batch verification failed update', warnRunStore);
                                }
                                (0, output_js_1.logToOutput)(`[batch] 任务 ${task.id} Agent 成功但验证失败`, 'warn');
                                await taskSpan.end({
                                    taskId: task.id,
                                    taskLabel: task.label,
                                    status: finalStatus,
                                    agentCli: agentCli || '',
                                });
                                updateProgress(task.id, '验证失败');
                            }
                            else {
                                const resolvedError = resolveStructuredError(result);
                                const errMsg = resolvedError.errorMessage || result.data?.output || result.error?.message || '执行失败';
                                const classified = (0, docTaskState_js_1.classifyDocTaskFailure)({
                                    ok: result.ok,
                                    exitCode: result.exitCode ?? undefined,
                                    errorCode: resolvedError.errorCode,
                                    errorMessage: errMsg,
                                    output: result.stderr || result.data?.output || result.stdout
                                });
                                task.lastFailureKind = classified.kind;
                                (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, classified.status);
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
                                    runRecord.outputSummary = (0, docTaskRunHelpers_js_1.summarizeOutput)(resolvedError.outputSummarySource || result.data?.output || result.stderr || result.stdout);
                                    runRecord.outputTruncated = result.data?.outputTruncated === true;
                                    (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, result.data?.agentTaskContract);
                                    applyContractSummary(runRecord, result.data?.agentTaskContract, taskContractSummary);
                                    await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'batch failed update', warnRunStore);
                                }
                                (0, output_js_1.logToOutput)(`[batch] 任务 ${task.id} 失败: ${errMsg}`, 'error');
                                await taskSpan.fail(new Error(errMsg), {
                                    taskId: task.id,
                                    taskLabel: task.label,
                                    status: classified.status,
                                    agentCli: agentCli || '',
                                });
                                updateProgress(task.id, '失败');
                            }
                        }
                    }
                    catch (err) {
                        const errMsg = err instanceof Error ? err.message : String(err);
                        const classified = (0, docTaskState_js_1.classifyDocTaskFailure)({
                            ok: false,
                            cancelled: cancelled || errMsg.includes('cancel'),
                            errorMessage: errMsg
                        });
                        task.lastFailureKind = classified.kind;
                        (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, classified.status);
                        failedCount++;
                        if (runRecord) {
                            runRecord.status = classified.status;
                            runRecord.failureKind = classified.kind;
                            runRecord.errorMessage = errMsg;
                            runRecord.updatedAt = new Date().toISOString();
                            runRecord.endedAt = runRecord.updatedAt;
                            runRecord.durationMs = Date.now() - startedAtMs;
                            (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, undefined);
                            applyContractSummary(runRecord, undefined, taskContractSummary);
                            await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'batch exception update', warnRunStore);
                        }
                        (0, output_js_1.logToOutput)(`[batch] 任务 ${task.id} 异常: ${errMsg}`, 'error');
                        await taskSpan.fail(err, {
                            taskId: task.id,
                            taskLabel: task.label,
                            status: classified.status,
                            agentCli: agentCli || '',
                        });
                        updateProgress(task.id, '异常');
                    }
                    finally {
                        completedCount++;
                        tasksProvider.refresh();
                        await finalizeBatchSnapshot();
                    }
                }
                async function runWithConcurrency() {
                    const active = [];
                    while (queue.length > 0 && !cancelled) {
                        while (active.length < maxConcurrent && queue.length > 0 && !cancelled) {
                            const task = queue.shift();
                            const p = runSingleTask(task).finally(() => {
                                const idx = active.indexOf(p);
                                if (idx >= 0)
                                    active.splice(idx, 1);
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
                }
                else {
                    // Batch risk assessment: collect all high-risk validation commands upfront
                    const riskItems = await collectBatchRiskItems(tasks, contractSummaries);
                    if (riskItems.length > 0) {
                        const riskDecision = await showBatchRiskDialog(riskItems);
                        if (riskDecision === 'cancel') {
                            cancelled = true;
                        }
                        else if (riskDecision === 'skip') {
                            (0, output_js_1.logToOutput)(`[batch] 用户选择跳过 ${riskItems.length} 个高风险验证命令`, 'warn');
                            // mark skipped tasks and remove them from queue
                            const skipTaskIds = new Set(riskItems.map(r => r.taskId));
                            for (const task of [...queue]) {
                                if (skipTaskIds.has(task.id)) {
                                    (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, 'changed');
                                    skippedCount++;
                                    completedCount++;
                                    const idx = queue.indexOf(task);
                                    if (idx >= 0)
                                        queue.splice(idx, 1);
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
                    const finalStatus = cancelled && !globalFailureAfterBatch ? 'cancelled' : (globalFailureAfterBatch?.status ?? 'failed_config');
                    const now = new Date().toISOString();
                    for (const task of tasks) {
                        if (!notStartedTaskIds.has(task.id))
                            continue;
                        const taskContractSummary = contractSummaries.get(task.id);
                        task.lastFailureKind = finalStatus === 'cancelled'
                            ? 'cancelled'
                            : (globalFailureAfterBatch?.kind === 'config' ? 'config' : 'unknown');
                        (0, docTaskRunHelpers_js_1.setTaskDisplayState)(task, finalStatus);
                        skippedCount++;
                        completedCount++;
                        let runRecord = runRecordMap.get(task.id);
                        if (!runRecord) {
                            const runId = task.lastRunId || (0, docTaskRunHelpers_js_1.createRunId)(task.id);
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
                                        agentTaskContract: (0, docTaskContract_js_1.toRunContractSummary)(taskContractSummary)
                                    })
                                    : undefined;
                            }
                            catch (err) {
                                const msg = err instanceof Error ? err.message : String(err);
                                (0, output_js_1.logToOutput)(`[doc-task-run-store] batch补录 startRun 失败: ${msg}`, 'warn');
                            }
                        }
                        if (runRecord) {
                            runRecord.status = finalStatus;
                            runRecord.failureKind = task.lastFailureKind;
                            runRecord.errorMessage = globalFailureAfterBatch?.message;
                            runRecord.updatedAt = now;
                            runRecord.endedAt = now;
                            runRecord.durationMs = 0;
                            (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, undefined);
                            applyContractSummary(runRecord, undefined, taskContractSummary);
                            await (0, docTaskRunHelpers_js_1.safeUpdateRun)(runStore, runRecord, 'batch finalize pending update', warnRunStore);
                        }
                    }
                    await finalizeBatchSnapshot();
                    tasksProvider.refresh();
                }
                const successCount = tasks.filter(t => t.status === 'success' || t.status === 'changed').length;
                const msg = failedCount === 0
                    ? `批量执行完成: ${successCount} 成功, ${skippedCount} 跳过`
                    : `批量执行完成: ${successCount} 成功, ${failedCount} 失败, ${skippedCount} 跳过`;
                (0, output_js_1.logToOutput)(`[batch] ${msg}`);
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
                    }
                    else {
                        vscode.window.showWarningMessage(`批量执行已取消 (${successCount} 成功, ${failedCount} 失败)`);
                    }
                }
                else if (failedCount === 0) {
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
                }
                else {
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
        }
        finally {
            tasksProvider.setIsBatchRunning(false);
            tasksProvider.refresh();
        }
    }));
}
//# sourceMappingURL=runDocTasks.js.map