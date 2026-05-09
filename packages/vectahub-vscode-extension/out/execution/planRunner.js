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
exports.PlanRunner = void 0;
const vscode = __importStar(require("vscode"));
const adapter_js_1 = require("../cli/adapter.js");
class PlanRunner {
    outputChannel;
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    async run(plan) {
        this.outputChannel.appendLine(`\n[PlanRunner] Running Plan: ${plan.label}`);
        this.outputChannel.appendLine(`[PlanRunner] Type: ${plan.type}, Mode: ${plan.mode}`);
        try {
            let result;
            switch (plan.type) {
                case 'intent':
                    result = await (0, adapter_js_1.runCli)([
                        'run',
                        '--mode', plan.mode,
                        '--json',
                        plan.intent
                    ], { cwd: plan.cwd });
                    break;
                case 'command':
                    result = await (0, adapter_js_1.runCli)([
                        'run-command',
                        '--mode', plan.mode,
                        '--json',
                        '--',
                        plan.command.cli,
                        ...plan.command.args
                    ], { cwd: plan.cwd });
                    break;
                case 'workflowFile':
                    result = await (0, adapter_js_1.runCli)([
                        'run',
                        '--mode', plan.mode,
                        '--json',
                        plan.file
                    ], { cwd: plan.cwd });
                    break;
                case 'capability':
                    result = await (0, adapter_js_1.runCli)([
                        'run',
                        '--mode', plan.mode,
                        '--json',
                        plan.goal?.originalInput || plan.label
                    ], { cwd: plan.cwd });
                    break;
            }
            this.outputChannel.appendLine(`[PlanRunner] Result: ${JSON.stringify(result, null, 2)}`);
            if (result && result.ok === false) {
                const error = result.error || { message: 'Unknown error' };
                const errorCode = error.code || 'N/A';
                vscode.window.showErrorMessage(`Task Failed: ${error.message} (${errorCode})`);
            }
            else {
                vscode.window.showInformationMessage(`Task Completed: ${plan.label}`);
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[PlanRunner] Error: ${msg}`);
            vscode.window.showErrorMessage(`Execution Error: ${msg}`);
        }
    }
    async preview(plan) {
        this.outputChannel.appendLine(`\n[PlanRunner] Previewing Plan: ${plan.label}`);
        switch (plan.type) {
            case 'intent':
                return (0, adapter_js_1.runCli)([
                    'run',
                    '--dry-run',
                    '--json',
                    plan.intent
                ], { cwd: plan.cwd });
            case 'command':
                return (0, adapter_js_1.runCli)([
                    'run-command',
                    '--dry-run',
                    '--json',
                    '--',
                    plan.command.cli,
                    ...plan.command.args
                ], { cwd: plan.cwd });
            case 'workflowFile':
                return (0, adapter_js_1.runCli)([
                    'run',
                    '--dry-run',
                    '--json',
                    plan.file
                ], { cwd: plan.cwd });
            case 'capability':
                return (0, adapter_js_1.runCli)([
                    'run',
                    '--dry-run',
                    '--json',
                    plan.goal?.originalInput || plan.label
                ], { cwd: plan.cwd });
        }
    }
}
exports.PlanRunner = PlanRunner;
//# sourceMappingURL=planRunner.js.map