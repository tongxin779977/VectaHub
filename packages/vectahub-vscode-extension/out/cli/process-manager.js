"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
const child_process_1 = require("child_process");
const output_js_1 = require("../ui/output.js");
const os_1 = require("os");
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
        child.on('close', () => {
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
            if (!child.killed && typeof child.pid === 'number' && child.pid > 0) {
                try {
                    if ((0, os_1.platform)() === 'win32') {
                        (0, child_process_1.exec)(`taskkill /F /T /PID ${child.pid}`, () => { });
                    }
                    else {
                        try {
                            process.kill(-child.pid, 'SIGTERM');
                        }
                        catch {
                            child.kill('SIGTERM');
                        }
                    }
                }
                catch {
                    try {
                        child.kill('SIGKILL');
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
        this.activeProcesses.clear();
    }
}
exports.ProcessManager = ProcessManager;
//# sourceMappingURL=process-manager.js.map