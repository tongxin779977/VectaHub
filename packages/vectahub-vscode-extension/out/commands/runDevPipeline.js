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
exports.registerRunDevPipelineCommand = registerRunDevPipelineCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_js_1 = require("../ui/output.js");
const planRunner_js_1 = require("../execution/planRunner.js");
const detector_js_1 = require("../project/detector.js");
const devPipeline_js_1 = require("../execution/devPipeline.js");
const planBuilder_js_1 = require("../execution/planBuilder.js");
const taskHistory_js_1 = require("../project/taskHistory.js");
async function runPlansSequentially(plans, runner, token) {
    for (const plan of plans) {
        if (token.isCancellationRequested) {
            throw new Error('cancelled');
        }
        await runner.run(plan);
    }
}
function hasNodeModules() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder)
        return false;
    return fs.existsSync(path.join(workspaceFolder, 'node_modules'));
}
function registerRunDevPipelineCommand(context, tasksProvider) {
    const disposable = vscode.commands.registerCommand('vectahubTasks.runDevPipeline', async () => {
        const tasks = await (0, detector_js_1.detectProjectTasks)();
        const result = (0, devPipeline_js_1.createDevPipeline)(tasks);
        if (result.plans.length === 0) {
            const skipped = result.skipped.length > 0 ? `跳过: ${result.skipped.join(', ')}` : '';
            vscode.window.showWarningMessage(`无可执行的开发任务链。${skipped}`);
            return;
        }
        const runner = new planRunner_js_1.PlanRunner((0, output_js_1.getOutputChannel)());
        if (!hasNodeModules()) {
            const installTask = tasks.find(t => t.kind === 'install');
            if (installTask) {
                const choice = await vscode.window.showWarningMessage('未检测到 node_modules 目录，是否先执行 install？', { modal: true }, '先 install', '跳过继续');
                if (choice === '先 install') {
                    const installPlan = planBuilder_js_1.PlanBuilder.createProjectTaskPlan(installTask);
                    if (installPlan) {
                        try {
                            await runner.run(installPlan);
                        }
                        catch {
                            vscode.window.showErrorMessage('❌ install 失败，开发任务链已终止');
                            return;
                        }
                    }
                }
            }
        }
        if (result.skipped.length > 0) {
            vscode.window.showInformationMessage(`跳过不可用任务: ${result.skipped.join(', ')}`);
        }
        const startedAt = new Date();
        let status = 'success';
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'VectaHub 开发任务链...',
            cancellable: true
        }, async (_progress, token) => {
            try {
                await runPlansSequentially(result.plans, runner, token);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (message.includes('cancelled')) {
                    status = 'cancelled';
                    vscode.window.showInformationMessage('⏸ 开发任务链已取消');
                }
                else {
                    status = 'failed';
                    vscode.window.showErrorMessage(`❌ 开发任务链在某步失败: ${message}`);
                }
            }
        });
        const endedAt = new Date();
        const summary = `开发链: ${result.included.map(t => t.label).join(' → ')}`;
        (0, taskHistory_js_1.addTaskRecord)({
            id: `dev-pipeline-${Date.now()}`,
            label: '开发任务链',
            kind: 'dev-pipeline',
            source: 'vectahub',
            status,
            command: summary,
            startedAt,
            endedAt
        });
        tasksProvider.refresh();
        if (status === 'success') {
            vscode.window.showInformationMessage('✅ 开发任务链完成');
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=runDevPipeline.js.map