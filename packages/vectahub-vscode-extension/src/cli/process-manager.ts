import { ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import { logToOutput } from '../ui/output.js';
import { platform } from 'os';

const ZOMBIE_CHECK_INTERVAL_MS = 30_000;

export class ProcessManager {
  private static instance: ProcessManager;
  private activeProcesses: Set<ChildProcess> = new Set();
  private zombieCheckInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.startZombieCheck();
  }

  private startZombieCheck(): void {
    this.zombieCheckInterval = setInterval(() => {
      let zombieCount = 0;
      for (const child of this.activeProcesses) {
        if (child.killed || child.exitCode !== null) {
          this.activeProcesses.delete(child);
          zombieCount++;
        }
      }
      if (zombieCount > 0) {
        logToOutput(`Cleaned up ${zombieCount} zombie process(es)`, 'warn');
      }
    }, ZOMBIE_CHECK_INTERVAL_MS);
  }

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
            try {
              execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
            } catch {
              // 进程可能已终止，忽略错误
            }
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

  dispose(): void {
    if (this.zombieCheckInterval !== null) {
      clearInterval(this.zombieCheckInterval);
      this.zombieCheckInterval = null;
    }
    this.killAll();
  }
}
