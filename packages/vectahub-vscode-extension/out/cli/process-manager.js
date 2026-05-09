"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
const output_js_1 = require("../ui/output.js");
class ProcessManager {
    static instance;
    activeProcesses = new Set();
    constructor() { }
    static getInstance() {
        if (!ProcessManager.instance) {
            ProcessManager.instance = new ProcessManager();
        }
        return ProcessManager.instance;
    }
    register(child) {
        this.activeProcesses.add(child);
        child.on('exit', () => {
            this.activeProcesses.delete(child);
        });
        child.on('error', () => {
            this.activeProcesses.delete(child);
        });
    }
    killAll() {
        if (this.activeProcesses.size === 0)
            return;
        (0, output_js_1.logToOutput)(`Killing ${this.activeProcesses.size} active CLI processes...`, 'warn');
        for (const child of this.activeProcesses) {
            if (!child.killed) {
                try {
                    // On Unix, we might want to kill the process group, but child.kill() is a good start.
                    child.kill('SIGTERM');
                }
                catch {
                    // ignore
                }
            }
        }
        this.activeProcesses.clear();
    }
}
exports.ProcessManager = ProcessManager;
//# sourceMappingURL=process-manager.js.map