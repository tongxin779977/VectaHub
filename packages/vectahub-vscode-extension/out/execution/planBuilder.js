"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanBuilder = void 0;
const plan_1 = require("./plan");
const settings_1 = require("../config/settings");
class PlanBuilder {
    static buildIntentPlan(intent, label) {
        return {
            id: `intent-${Date.now()}`,
            type: 'intent',
            label: label || `Intent: ${intent}`,
            intent,
            source: 'manual',
            mode: (0, settings_1.getExecutionMode)(),
            cwd: (0, plan_1.getWorkspaceCwd)()
        };
    }
    static buildCommandPlan(cli, args, label, source) {
        return {
            id: `cmd-${Date.now()}`,
            type: 'command',
            label,
            command: { cli, args },
            source,
            mode: (0, settings_1.getExecutionMode)(),
            cwd: (0, plan_1.getWorkspaceCwd)()
        };
    }
    static buildWorkflowFilePlan(filePath, label) {
        return {
            id: `wf-${Date.now()}`,
            type: 'workflowFile',
            label: label || `Workflow: ${filePath}`,
            file: filePath,
            source: 'workflow-file',
            mode: (0, settings_1.getExecutionMode)(),
            cwd: (0, plan_1.getWorkspaceCwd)()
        };
    }
    static createProjectTaskPlan(task) {
        if (!task.command)
            return undefined;
        let cli;
        let args;
        if (typeof task.command === 'string') {
            // 向后兼容：处理字符串格式的命令
            const parts = task.command.split(' ');
            cli = parts[0];
            args = parts.slice(1);
        }
        else {
            // 新格式：对象格式的命令
            cli = task.command.cli;
            args = task.command.args;
        }
        return this.buildCommandPlan(cli, args, task.label, task.source === 'package-json' ? 'package-json' : 'git');
    }
}
exports.PlanBuilder = PlanBuilder;
//# sourceMappingURL=planBuilder.js.map