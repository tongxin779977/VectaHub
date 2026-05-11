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
exports.getGlobalCliPath = getGlobalCliPath;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const discovery_js_1 = require("./cli/discovery.js");
const statusBar_js_1 = require("./ui/statusBar.js");
const installCli_js_1 = require("./commands/installCli.js");
const settings_js_1 = require("./config/settings.js");
const output_js_1 = require("./ui/output.js");
const adapter_js_1 = require("./cli/adapter.js");
const readiness_js_1 = require("./cli/readiness.js");
const tasksView_js_1 = require("./views/tasksView.js");
const advancedView_js_1 = require("./views/advancedView.js");
const doctor_js_1 = require("./commands/doctor.js");
const previewIntent_js_1 = require("./commands/previewIntent.js");
const runIntent_js_1 = require("./commands/runIntent.js");
const runCommonTask_js_1 = require("./commands/runCommonTask.js");
const listTools_js_1 = require("./commands/listTools.js");
const previewCurrentWorkflow_js_1 = require("./commands/previewCurrentWorkflow.js");
const runCurrentWorkflow_js_1 = require("./commands/runCurrentWorkflow.js");
const openWorkflow_js_1 = require("./commands/openWorkflow.js");
const testSecurity_js_1 = require("./commands/testSecurity.js");
const refreshProjectTasks_js_1 = require("./commands/refreshProjectTasks.js");
const previewProjectTask_js_1 = require("./commands/previewProjectTask.js");
const runProjectTask_js_1 = require("./commands/runProjectTask.js");
const listPackageScripts_js_1 = require("./commands/listPackageScripts.js");
const fetchGhErrors_js_1 = require("./commands/fetchGhErrors.js");
const diagnostic_bridge_js_1 = require("./project/diagnostic-bridge.js");
const processAllQueue_js_1 = require("./commands/processAllQueue.js");
const configLlm_js_1 = require("./commands/configLlm.js");
const runCheckPipeline_js_1 = require("./commands/runCheckPipeline.js");
const runDevPipeline_js_1 = require("./commands/runDevPipeline.js");
const startDevServer_js_1 = require("./commands/startDevServer.js");
const stopRunningTask_js_1 = require("./commands/stopRunningTask.js");
const runDocTasks_js_1 = require("./commands/runDocTasks.js");
function getGlobalCliPath() {
    return (0, readiness_js_1.getResolvedCliPath)();
}
async function activate(context) {
    const outputChannel = (0, output_js_1.initOutputChannel)();
    (0, adapter_js_1.initCliAdapter)(context);
    (0, statusBar_js_1.initStatusBar)(context);
    (0, output_js_1.logToOutput)('VectaHub Tasks extension is now active!');
    const tasksProvider = (0, tasksView_js_1.registerTasksView)(context);
    (0, advancedView_js_1.registerAdvancedView)(context);
    (0, installCli_js_1.registerInstallCliCommand)(context);
    (0, doctor_js_1.registerDoctorCommand)(context);
    (0, configLlm_js_1.registerConfigLlmCommand)(context);
    (0, previewIntent_js_1.registerPreviewIntentCommand)(context);
    (0, runIntent_js_1.registerRunIntentCommand)(context);
    (0, runCommonTask_js_1.registerRunCommonTaskCommand)(context);
    (0, listTools_js_1.registerListToolsCommand)(context);
    (0, previewCurrentWorkflow_js_1.registerPreviewCurrentWorkflowCommand)(context);
    (0, runCurrentWorkflow_js_1.registerRunCurrentWorkflowCommand)(context);
    (0, openWorkflow_js_1.registerOpenWorkflowCommand)(context);
    (0, testSecurity_js_1.registerTestSecurityCommand)(context);
    (0, refreshProjectTasks_js_1.registerRefreshProjectTasksCommand)(context, tasksProvider);
    (0, previewProjectTask_js_1.registerPreviewProjectTaskCommand)(context);
    (0, runProjectTask_js_1.registerRunProjectTaskCommand)(context, tasksProvider);
    (0, listPackageScripts_js_1.registerListPackageScriptsCommand)(context);
    (0, fetchGhErrors_js_1.registerFetchGhErrorsCommand)(context, tasksProvider);
    (0, processAllQueue_js_1.registerProcessAllQueueCommand)(context, tasksProvider);
    (0, runCheckPipeline_js_1.registerRunCheckPipelineCommand)(context, tasksProvider);
    (0, runDevPipeline_js_1.registerRunDevPipelineCommand)(context, tasksProvider);
    (0, startDevServer_js_1.registerStartDevServerCommand)(context, tasksProvider);
    (0, stopRunningTask_js_1.registerStopRunningTaskCommand)(context, tasksProvider);
    (0, runDocTasks_js_1.registerDocTaskCommands)(context, tasksProvider);
    context.subscriptions.push(vscode.commands.registerCommand('vectahub.getDiagnostics', (args) => {
        const all = (0, diagnostic_bridge_js_1.collectAllDiagnostics)();
        const filtered = (0, diagnostic_bridge_js_1.filterDiagnostics)(all, args?.file, args?.severity);
        return filtered;
    }));
    diagnosticBridge = new diagnostic_bridge_js_1.DiagnosticBridge();
    diagnosticBridge.start()
        .then(port => (0, output_js_1.logToOutput)(`Diagnostic bridge started on port ${port}`))
        .catch(err => (0, output_js_1.logToOutput)(`Diagnostic bridge failed: ${err}`, 'error'));
    context.subscriptions.push({ dispose: () => diagnosticBridge?.dispose() });
    context.subscriptions.push(outputChannel);
    const cliDetector = async () => {
        const result = await (0, discovery_js_1.discoverCli)();
        return {
            exists: result.exists,
            path: result.path,
            version: result.version,
            error: result.error
        };
    };
    if ((0, settings_js_1.getAutoDetectCli)()) {
        (0, output_js_1.logToOutput)('Detecting VectaHub CLI...');
        const state = await (0, readiness_js_1.startCliDetection)(cliDetector);
        if (state === 'ready') {
            (0, statusBar_js_1.updateStatusBar)('Ready');
            (0, output_js_1.logToOutput)('Running initial VectaHub doctor...');
            const doctorResult = await (0, adapter_js_1.runCli)(['doctor', '--json']);
            if (doctorResult.ok) {
                (0, output_js_1.logToOutput)('VectaHub doctor passed.');
            }
            else {
                (0, output_js_1.logToOutput)('VectaHub doctor failed or returned warnings.', 'warn');
                if (doctorResult.data?.summary) {
                    (0, output_js_1.logToOutput)(`Passed: ${doctorResult.data.summary.passed}, Failed: ${doctorResult.data.summary.failed}, Warnings: ${doctorResult.data.summary.warnings}`, 'warn');
                }
            }
        }
        else {
            (0, statusBar_js_1.updateStatusBar)('CLI Missing');
        }
    }
    else {
        (0, readiness_js_1.registerCliDetector)(cliDetector);
    }
}
const process_manager_js_1 = require("./cli/process-manager.js");
const longRunningTaskManager_js_1 = require("./cli/longRunningTaskManager.js");
let diagnosticBridge;
function deactivate() {
    longRunningTaskManager_js_1.LongRunningTaskManager.getInstance().stopAll();
    process_manager_js_1.ProcessManager.getInstance().killAll();
    diagnosticBridge?.dispose();
}
//# sourceMappingURL=extension.js.map