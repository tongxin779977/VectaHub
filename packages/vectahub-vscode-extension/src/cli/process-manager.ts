import { ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { logToOutput } from '../ui/output.js';
import { platform } from 'os';

export class ProcessManager {
  private static instance: ProcessManager;
  private activeProcesses: Set<ChildProcess> = new Set();

  private constructor() {}

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  register(child: ChildProcess): void {
    this.activeProcesses.add(child);
    child.on('close', () => {
      this.activeProcesses.delete(child);
    });
    child.on('error', () => {
      this.activeProcesses.delete(child);
    });
  }

  killAll(): void {
    if (this.activeProcesses.size === 0) return;
    
    logToOutput(`Killing ${this.activeProcesses.size} active CLI processes...`, 'warn');
    for (const child of this.activeProcesses) {
      if (!child.killed && typeof child.pid === 'number' && child.pid > 0) {
        try {
          if (platform() === 'win32') {
            exec(`taskkill /F /T /PID ${child.pid}`, () => {});
          } else {
            try {
              process.kill(-child.pid, 'SIGTERM');
            } catch {
              child.kill('SIGTERM');
            }
          }
        } catch {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }
    }
    this.activeProcesses.clear();
  }
}
