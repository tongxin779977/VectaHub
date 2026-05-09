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
exports.registerRunProjectTaskCommand = registerRunProjectTaskCommand;
const vscode = __importStar(require("vscode"));
const output_js_1 = require("../ui/output.js");
const planBuilder_js_1 = require("../execution/planBuilder.js");
const planRunner_js_1 = require("../execution/planRunner.js");
const taskHistory_js_1 = require("../project/taskHistory.js");
const settings_js_1 = require("../config/settings.js");
const dangerDetection_js_1 = require("../cli/dangerDetection.js");
const adapter_js_1 = require("../cli/adapter.js");
const readiness_js_1 = require("../cli/readiness.js");
const SAFE_TASK_KINDS = new Set([
    'test', 'lint', 'typecheck', 'build', 'dev', 'start', 'serve',
    'preview', 'watch', 'format', 'format:check', 'coverage',
    'check', 'validate', 'storybook', 'install', 'git-status', 'doctor'
]);
function buildCommandString(task) {
    if (!task.command)
        return '';
    return `${task.command.cli} ${task.command.args.join(' ')}`.trim();
}
async function confirmHighRisk(task, reason) {
    const choice = await vscode.window.showWarningMessage(`⚠️ 高风险任务: ${task.label}\n${reason}`, { modal: true }, '确认执行', '取消');
    return choice === '确认执行';
}
async function performDryRunCheck(task) {
    if (!task.command)
        return { safe: true };
    const args = ['run-command', '--dry-run', '--json', '--', task.command.cli, ...task.command.args];
    const result = await (0, adapter_js_1.runCli)(args);
    if (!result.ok) {
        const reason = result.error?.message || result.stderr || 'dry-run 检测失败';
        return { safe: false, reason };
    }
    return { safe: true };
}
function registerRunProjectTaskCommand(context, tasksProvider) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.runProjectTask', async (task) => {
        (0, output_js_1.logToOutput)(`[DEBUG] runProjectTask 开始执行，task: ${task.label}`);
        const startedAt = new Date();
        const plan = planBuilder_js_1.PlanBuilder.createProjectTaskPlan(task);
        if (!plan) {
            vscode.window.showWarningMessage('该任务缺少可执行命令。');
            return;
        }
        const isSafeKind = SAFE_TASK_KINDS.has(task.kind);
        const commandStr = buildCommandString(task);
        if (!isSafeKind && commandStr) {
            const dangerousMatch = (0, dangerDetection_js_1.getDangerousMatch)(commandStr);
            if (dangerousMatch) {
                (0, output_js_1.logToOutput)(`[runProjectTask] 危险命令检测命中: ${dangerousMatch}`);
                const confirmed = await confirmHighRisk(task, `命令包含危险模式: "${dangerousMatch}"`);
                if (!confirmed) {
                    (0, taskHistory_js_1.addTaskRecord)({
                        id: `task-${Date.now()}`,
                        label: task.label,
                        kind: task.kind,
                        source: task.source,
                        status: 'cancelled',
                        command: commandStr,
                        startedAt,
                        endedAt: new Date()
                    });
                    return;
                }
            }
            else {
                const ready = await (0, readiness_js_1.waitForCliReady)();
                if (ready) {
                    const dryRun = await performDryRunCheck(task);
                    if (!dryRun.safe) {
                        (0, output_js_1.logToOutput)(`[runProjectTask] dry-run 检测不安全: ${dryRun.reason}`);
                        const confirmed = await confirmHighRisk(task, `dry-run 检测: ${dryRun.reason}`);
                        if (!confirmed) {
                            (0, taskHistory_js_1.addTaskRecord)({
                                id: `task-${Date.now()}`,
                                label: task.label,
                                kind: task.kind,
                                source: task.source,
                                status: 'cancelled',
                                command: commandStr,
                                startedAt,
                                endedAt: new Date()
                            });
                            return;
                        }
                    }
                }
            }
        }
        if ((0, settings_js_1.getPreviewBeforeRun)() && !isSafeKind) {
            (0, output_js_1.logToOutput)(`[runProjectTask] previewBeforeRun=true, 非安全任务先预览: ${task.label}`);
            const runner = new planRunner_js_1.PlanRunner((0, output_js_1.getOutputChannel)());
            try {
                const previewResult = await runner.preview(plan);
                if (!previewResult || previewResult.ok === false) {
                    const errMsg = previewResult?.error?.message || '预览失败';
                    vscode.window.showErrorMessage(`预览失败: ${errMsg}`);
                    return;
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`预览失败: ${msg}`);
                return;
            }
            const confirm = await vscode.window.showInformationMessage(`预览通过，确认执行: "${task.label}"?`, { modal: true }, '确认执行');
            if (confirm !== '确认执行')
                return;
        }
        const runner = new planRunner_js_1.PlanRunner((0, output_js_1.getOutputChannel)());
        let status = 'success';
        try {
            await runner.run(plan);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            status = message.includes('cancelled') ? 'cancelled' : 'failed';
        }
        finally {
            const endedAt = new Date();
            (0, taskHistory_js_1.addTaskRecord)({
                id: `task-${Date.now()}`,
                label: task.label,
                kind: task.kind,
                source: task.source,
                status,
                command: task.command ? `${task.command.cli} ${task.command.args.join(' ')}` : undefined,
                startedAt,
                endedAt
            });
            tasksProvider.refresh();
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=runProjectTask.js.map