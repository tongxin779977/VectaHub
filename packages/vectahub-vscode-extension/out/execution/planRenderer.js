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
    return [plan.command.cli, ...plan.command.args].map(shellQuote).join(' ');
}
function renderPlanPreview(plan) {
    if (plan.type === 'intent') {
        return `Intent: ${plan.intent}`;
    }
    if (plan.type === 'workflowFile') {
        return `Workflow file: ${plan.file}`;
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