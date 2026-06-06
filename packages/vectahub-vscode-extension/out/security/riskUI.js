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
exports.confirmHighRiskCommand = confirmHighRiskCommand;
const vscode = __importStar(require("vscode"));
/**
 * Show a VS Code warning dialog for high-risk commands.
 * Returns true if the user confirms, false if they cancel.
 */
async function confirmHighRiskCommand(assessment, taskLabel) {
    const riskEmoji = assessment.level === 'critical' ? '🔴' : '🟠';
    const title = `${riskEmoji} 高风险命令确认`;
    const detail = [
        taskLabel ? `任务: ${taskLabel}` : '',
        assessment.ruleName ? `触发规则: ${assessment.ruleName}` : '',
        assessment.reason ? `原因: ${assessment.reason}` : '',
        assessment.suggestion || '',
    ].filter(Boolean).join('\n');
    const confirm = await vscode.window.showWarningMessage(title, { modal: true, detail }, '确认执行', '取消');
    return confirm === '确认执行';
}
//# sourceMappingURL=riskUI.js.map