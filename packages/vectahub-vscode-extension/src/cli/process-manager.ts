import { ChildProcess } from 'child_process';
import { logToOutput } from '../ui/output.js';

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
    child.on('exit', () => {
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
      if (!child.killed) {
        try {
          // On Unix, we might want to kill the process group, but child.kill() is a good start.
          child.kill('SIGTERM');
        } catch (e) {
          // Ignore
        }
      }
    }
    this.activeProcesses.clear();
  }
}
