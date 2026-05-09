"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobalCliPath = getGlobalCliPath;
exports.activate = activate;
exports.deactivate = deactivate;
const discovery_js_1 = require("./cli/discovery.js");
const statusBar_js_1 = require("./ui/statusBar.js");
const notifications_js_1 = require("./ui/notifications.js");
const installCli_js_1 = require("./commands/installCli.js");
const settings_js_1 = require("./config/settings.js");
const output_js_1 = require("./ui/output.js");
const adapter_js_1 = require("./cli/adapter.js");
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
const processAllQueue_js_1 = require("./commands/processAllQueue.js");
let globalCliPath;
function getGlobalCliPath() {
    return globalCliPath;
}
async function activate(context) {
    // 初始化核心组件
    const outputChannel = (0, output_js_1.initOutputChannel)();
    (0, adapter_js_1.initCliAdapter)(context);
    (0, statusBar_js_1.initStatusBar)(context);
    (0, output_js_1.logToOutput)('VectaHub Tasks extension is now active!');
    // 注册视图
    const tasksProvider = (0, tasksView_js_1.registerTasksView)(context);
    (0, advancedView_js_1.registerAdvancedView)(context);
    // 注册命令
    (0, installCli_js_1.registerInstallCliCommand)(context);
    (0, doctor_js_1.registerDoctorCommand)(context);
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
    (0, fetchGhErrors_js_1.registerFetchGhErrorsCommand)(context);
    (0, processAllQueue_js_1.registerProcessAllQueueCommand)(context);
    context.subscriptions.push(outputChannel);
    // 自动检测 CLI
    if ((0, settings_js_1.getAutoDetectCli)()) {
        (0, output_js_1.logToOutput)('Detecting VectaHub CLI...');
        const result = await (0, discovery_js_1.discoverCli)();
        if (result.exists) {
            globalCliPath = result.path;
            (0, output_js_1.logToOutput)(`VectaHub CLI detected: ${result.version} at ${globalCliPath}`);
            (0, statusBar_js_1.updateStatusBar)('Ready');
            // 检测成功后自动运行一次 doctor
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
            (0, output_js_1.logToOutput)(`VectaHub CLI not found: ${result.error}`, 'error');
            (0, statusBar_js_1.updateStatusBar)('CLI Missing');
            (0, notifications_js_1.showCliMissingWarning)();
        }
    }
}
const process_manager_js_1 = require("./cli/process-manager.js");
function deactivate() {
    process_manager_js_1.ProcessManager.getInstance().killAll();
}
//# sourceMappingURL=extension.js.map