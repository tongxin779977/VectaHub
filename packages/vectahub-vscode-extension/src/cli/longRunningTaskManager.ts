import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { getCliPath } from '../config/settings.js';
import { getGlobalCliPath } from '../extension.js';
import { ProcessManager } from './process-manager.js';
import { updateStatusBar } from '../ui/statusBar.js';
import { parseCliPath } from './adapter.js';

interface LongRunningTask {
  id: string;
  label: string;
  kind: string;
  child: ChildProcess;
  outputChannel: vscode.OutputChannel;
  runId: string;
}

export class LongRunningTaskManager {
  private static instance: LongRunningTaskManager;
  private runningTasks = new Map<string, LongRunningTask>();

  private _onTaskStarted = new vscode.EventEmitter<{ id: string; kind: string }>();
  private _onTaskStopped = new vscode.EventEmitter<{ id: string; kind: string; reason: 'exit' | 'error' | 'killed' }>();

  readonly onTaskStarted = this._onTaskStarted.event;
  readonly onTaskStopped = this._onTaskStopped.event;

  private constructor() {}

  static getInstance(): LongRunningTaskManager {
    if (!LongRunningTaskManager.instance) {
      LongRunningTaskManager.instance = new LongRunningTaskManager();
    }
    return LongRunningTaskManager.instance;
  }

  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  getRunningTask(taskId: string): LongRunningTask | undefined {
    return this.runningTasks.get(taskId);
  }

  getAllRunning(): LongRunningTask[] {
    return Array.from(this.runningTasks.values());
  }

  start(
    task: { id: string; label: string; kind: string; command?: { cli: string; args: string[] } },
    cwd?: string
  ): LongRunningTask {
    if (this.runningTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already running`);
    }

    if (!task.command) {
      throw new Error(`Task ${task.id} has no executable command`);
    }

    const cliPath = this.getActualCliPath();
    const { cmd: spawnCmd, extraArgs: spawnArgs } = parseCliPath(cliPath);

    const args = [...spawnArgs, ...task.command.args];

    const env = {
      ...process.env,
      CI: '1',
      VECTAHUB_NON_INTERACTIVE: '1',
    };

    const outputChannel = vscode.window.createOutputChannel(`VectaHub: ${task.label}`);

    const child = spawn(spawnCmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const runId = `${task.id}-${Date.now()}`;
    const entry: LongRunningTask = {
      id: task.id,
      label: task.label,
      kind: task.kind,
      child,
      outputChannel,
      runId
    };

    this.runningTasks.set(task.id, entry);
    ProcessManager.getInstance().register(child);

    const prefix = `[${task.label}]`;
    child.stdout?.on('data', (data: Buffer) => {
      outputChannel.appendLine(`${prefix} ${data.toString()}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
      outputChannel.appendLine(`${prefix} [stderr] ${data.toString()}`);
    });

    child.on('exit', (code) => {
      const wasKnown = this.runningTasks.delete(task.id);
      const exitMsg = code === 0
        ? `${prefix} 进程正常退出 (code: 0)`
        : `${prefix} 进程退出 (code: ${code ?? 'null'})`;
      outputChannel.appendLine(exitMsg);
      if (wasKnown) {
        this._onTaskStopped.fire({ id: task.id, kind: task.kind, reason: 'exit' });
        this.updateGlobalStatusBar();
      }
    });

    child.on('error', (err) => {
      const wasKnown = this.runningTasks.delete(task.id);
      outputChannel.appendLine(`${prefix} 进程启动错误: ${err.message}`);
      if (wasKnown) {
        this._onTaskStopped.fire({ id: task.id, kind: task.kind, reason: 'error' });
        this.updateGlobalStatusBar();
      }
    });

    this._onTaskStarted.fire({ id: task.id, kind: task.kind });
    this.updateGlobalStatusBar();

    return entry;
  }

  stop(taskId: string): boolean {
    const entry = this.runningTasks.get(taskId);
    if (!entry) return false;

    const prefix = `[${entry.label}]`;
    entry.outputChannel.appendLine(`${prefix} 用户请求停止...`);

    try {
      entry.child.kill('SIGTERM');
    } catch {
      try {
        entry.child.kill('SIGKILL');
      } catch {
        return false;
      }
    }

    this.runningTasks.delete(taskId);
    this._onTaskStopped.fire({ id: entry.id, kind: entry.kind, reason: 'killed' });
    this.updateGlobalStatusBar();
    return true;
  }

  async restart(task: { id: string; label: string; kind: string; command?: { cli: string; args: string[] } }, cwd?: string): Promise<LongRunningTask> {
    const entry = this.runningTasks.get(task.id);
    if (entry) {
      try { entry.child.kill('SIGTERM'); } catch { /* ignore */ }
      this.runningTasks.delete(task.id);
    }
    return this.start(task, cwd);
  }

  stopAll(): void {
    for (const id of this.runningTasks.keys()) {
      this.stop(id);
    }
  }

  focusOutput(taskId: string): void {
    const entry = this.runningTasks.get(taskId);
    if (entry) {
      entry.outputChannel.show();
    }
  }

  private updateGlobalStatusBar(): void {
    if (this.runningTasks.size === 0) {
      updateStatusBar('Ready');
    } else {
      const hasDevServer = Array.from(this.runningTasks.values())
        .some(t => ['dev', 'start', 'serve'].includes(t.kind));
      updateStatusBar(hasDevServer ? 'Dev Server' : 'Running');
    }
  }

  private getActualCliPath(): string {
    const cachedPath = getGlobalCliPath();
    if (cachedPath) return cachedPath;
    return getCliPath();
  }
}
