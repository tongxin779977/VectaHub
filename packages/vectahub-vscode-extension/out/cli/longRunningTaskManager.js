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
exports.LongRunningTaskManager = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const settings_js_1 = require("../config/settings.js");
const extension_js_1 = require("../extension.js");
const process_manager_js_1 = require("./process-manager.js");
const statusBar_js_1 = require("../ui/statusBar.js");
class LongRunningTaskManager {
    static instance;
    runningTasks = new Map();
    _onTaskStarted = new vscode.EventEmitter();
    _onTaskStopped = new vscode.EventEmitter();
    onTaskStarted = this._onTaskStarted.event;
    onTaskStopped = this._onTaskStopped.event;
    constructor() { }
    static getInstance() {
        if (!LongRunningTaskManager.instance) {
            LongRunningTaskManager.instance = new LongRunningTaskManager();
        }
        return LongRunningTaskManager.instance;
    }
    isRunning(taskId) {
        return this.runningTasks.has(taskId);
    }
    getRunningTask(taskId) {
        return this.runningTasks.get(taskId);
    }
    getAllRunning() {
        return Array.from(this.runningTasks.values());
    }
    start(task, cwd) {
        if (this.runningTasks.has(task.id)) {
            throw new Error(`Task ${task.id} is already running`);
        }
        if (!task.command) {
            throw new Error(`Task ${task.id} has no executable command`);
        }
        const cliPath = this.getActualCliPath();
        let spawnCmd = cliPath;
        let spawnArgs = [];
        if (cliPath.startsWith('node ')) {
            spawnCmd = 'node';
            spawnArgs = [cliPath.slice(5)];
        }
        const args = [...spawnArgs, ...task.command.args];
        const env = {
            ...process.env,
            CI: '1',
            VECTAHUB_NON_INTERACTIVE: '1',
        };
        const outputChannel = vscode.window.createOutputChannel(`VectaHub: ${task.label}`);
        const child = (0, child_process_1.spawn)(spawnCmd, args, {
            cwd,
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const runId = `${task.id}-${Date.now()}`;
        const entry = {
            id: task.id,
            label: task.label,
            kind: task.kind,
            child,
            outputChannel,
            runId
        };
        this.runningTasks.set(task.id, entry);
        process_manager_js_1.ProcessManager.getInstance().register(child);
        const prefix = `[${task.label}]`;
        child.stdout?.on('data', (data) => {
            outputChannel.appendLine(`${prefix} ${data.toString()}`);
        });
        child.stderr?.on('data', (data) => {
            outputChannel.appendLine(`${prefix} [stderr] ${data.toString()}`);
        });
        child.on('exit', (code) => {
            this.runningTasks.delete(task.id);
            const exitMsg = code === 0
                ? `${prefix} 进程正常退出 (code: 0)`
                : `${prefix} 进程退出 (code: ${code ?? 'null'})`;
            outputChannel.appendLine(exitMsg);
            this._onTaskStopped.fire({ id: task.id, kind: task.kind, reason: 'exit' });
            this.updateGlobalStatusBar();
        });
        child.on('error', (err) => {
            this.runningTasks.delete(task.id);
            outputChannel.appendLine(`${prefix} 进程启动错误: ${err.message}`);
            this._onTaskStopped.fire({ id: task.id, kind: task.kind, reason: 'error' });
            this.updateGlobalStatusBar();
        });
        this._onTaskStarted.fire({ id: task.id, kind: task.kind });
        this.updateGlobalStatusBar();
        return entry;
    }
    stop(taskId) {
        const entry = this.runningTasks.get(taskId);
        if (!entry)
            return false;
        const prefix = `[${entry.label}]`;
        entry.outputChannel.appendLine(`${prefix} 用户请求停止...`);
        try {
            entry.child.kill('SIGTERM');
        }
        catch {
            try {
                entry.child.kill('SIGKILL');
            }
            catch {
                return false;
            }
        }
        this.runningTasks.delete(taskId);
        this._onTaskStopped.fire({ id: entry.id, kind: entry.kind, reason: 'killed' });
        this.updateGlobalStatusBar();
        return true;
    }
    async restart(task, cwd) {
        this.stop(task.id);
        return this.start(task, cwd);
    }
    stopAll() {
        for (const id of this.runningTasks.keys()) {
            this.stop(id);
        }
    }
    focusOutput(taskId) {
        const entry = this.runningTasks.get(taskId);
        if (entry) {
            entry.outputChannel.show();
        }
    }
    updateGlobalStatusBar() {
        if (this.runningTasks.size === 0) {
            (0, statusBar_js_1.updateStatusBar)('Ready');
        }
        else {
            const hasDevServer = Array.from(this.runningTasks.values())
                .some(t => ['dev', 'start', 'serve'].includes(t.kind));
            (0, statusBar_js_1.updateStatusBar)(hasDevServer ? 'Dev Server' : 'Running');
        }
    }
    getActualCliPath() {
        const cachedPath = (0, extension_js_1.getGlobalCliPath)();
        if (cachedPath)
            return cachedPath;
        return (0, settings_js_1.getCliPath)();
    }
}
exports.LongRunningTaskManager = LongRunningTaskManager;
//# sourceMappingURL=longRunningTaskManager.js.map