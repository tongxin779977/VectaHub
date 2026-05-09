"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPlanCommand = renderPlanCommand;
exports.renderPlanPreview = renderPlanPreview;
const settings_js_1 = require("../config/settings.js");
function renderPlanCommand(plan) {
    if (plan.type === 'intent') {
        return `${(0, settings_js_1.getCliPath)()} run --mode ${plan.mode} "${escapeDoubleQuotes(plan.intent)}"`;
    }
    if (plan.type === 'workflowFile') {
        return `${(0, settings_js_1.getCliPath)()} run -f "${escapeDoubleQuotes(plan.file)}" --mode ${plan.mode}`;
    }
    if (plan.type === 'capability') {
        // 对于已经解析好的能力计划，通常是重新运行触发该能力的原始意图，
        // 或者在这里展示其核心步骤。目前暂时展示第一个命令步骤或 label。
        const firstCommand = plan.steps.find(s => s.type === 'command' && s.command);
        if (firstCommand?.command) {
            return [firstCommand.command.cli, ...firstCommand.command.args].map(shellQuote).join(' ');
        }
        return `echo "Executing ${plan.label}..."`;
    }
    return [plan.command.cli, ...plan.command.args].map(shellQuote).join(' ');
}
function renderPlanPreview(plan) {
    if (plan.type === 'intent') {
        return `Intent: ${plan.intent}`;
    }
    if (plan.type === 'workflowFile') {
        return `Workflow file: ${plan.file}`;
    }
    if (plan.type === 'capability') {
        return `Capability [${plan.capabilityId}]: ${plan.label} (${plan.steps.length} steps)`;
    }
    return `Command: ${plan.command.cli} ${plan.command.args.join(' ')}`;
}
function escapeDoubleQuotes(value) {
    return value.replace(/"/g, '\\"');
}
function shellQuote(value) {
    if (/^[a-zA-Z0-9_./:-]+$/.test(value))
        return value;
    return `"${escapeDoubleQuotes(value)}"`;
}
//# sourceMappingURL=planRenderer.js.map