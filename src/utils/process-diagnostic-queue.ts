import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'shell-quote';
import { getQueueManager, type QueueManager } from '../execution/queue-manager.js';
import type { DiagnosticTask } from '../types/diagnostic.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';

export interface QueuedCommand {
  cli: string;
  args: string[];
}

export interface QueuedCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessDiagnosticQueueDependencies {
  queueManager: QueueManager;
  runCommand?: (command: QueuedCommand) => Promise<QueuedCommandResult> | QueuedCommandResult;
}

interface DiagnosticQueueOutput {
  log(message: string): void;
  error(message: string): void;
}

const diagnosticQueueOutput: DiagnosticQueueOutput = {
  log: (message: string) => process.stdout.write(`${message}\n`),
  error: (message: string) => process.stderr.write(`${message}\n`),
};

function createCliQueueManager(environment: IEnvironmentService): QueueManager {
  const queueFile = join(environment.getHomePath(), 'diagnostic-queue.json');
  return getQueueManager(queueFile, {
    logger: {
      error: (message: string) => process.stderr.write(`${message}\n`),
      warn: (message: string) => process.stderr.write(`${message}\n`),
    },
  });
}

export function parseQueuedCommand(commandToFix: string): QueuedCommand {
  const tokens = parse(commandToFix).map((part): string => {
    if (typeof part === 'string') return part;
    if ('op' in part) return part.op;
    if ('pattern' in part) return String(part.pattern);
    return String(part);
  }).filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Queued command is empty');
  }

  if (tokens.some((token) => ['&&', '||', '|', ';'].includes(token))) {
    throw new Error('Queued command must be a single executable command');
  }

  return {
    cli: tokens[0],
    args: tokens.slice(1),
  };
}

function runQueuedCommand(command: QueuedCommand): QueuedCommandResult {
  const result = spawnSync(command.cli, command.args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf-8',
  });

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';

  if (stdout) {
    process.stdout.write(stdout);
  }

  if (stderr) {
    process.stderr.write(stderr);
  }

  if (result.error) {
    const errorMessage = result.error.message || String(result.error);
    if (!stderr) {
      process.stderr.write(`${errorMessage}\n`);
    }
    return {
      exitCode: 1,
      stdout,
      stderr: stderr || errorMessage,
    };
  }

  if ((result.status ?? 0) !== 0 && !stderr) {
    const fallbackError = `Command exited with code ${result.status ?? 0}`;
    process.stderr.write(`${fallbackError}\n`);
    return {
      exitCode: result.status ?? 0,
      stdout,
      stderr: fallbackError,
    };
  }

  return {
    exitCode: result.status ?? 0,
    stdout,
    stderr,
  };
}

export async function listPendingDiagnosticTasks(queueManager: QueueManager): Promise<DiagnosticTask[]> {
  const tasks = await queueManager.loadTasks();
  return tasks.filter((task) => task.status === 'pending');
}

export async function processDiagnosticTask(
  taskId: string,
  deps: ProcessDiagnosticQueueDependencies,
): Promise<QueuedCommandResult> {
  const queueManager = deps.queueManager;
  const tasks = await queueManager.loadTasks();
  const task = tasks.find((entry) => entry.id === taskId);

  if (!task) {
    throw new Error(`Diagnostic task not found: ${taskId}`);
  }

  await queueManager.updateTaskStatus(taskId, 'processing');

  let command: QueuedCommand;
  try {
    command = parseQueuedCommand(task.commandToFix);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await queueManager.updateTaskStatus(taskId, 'failed', message);
    throw error;
  }

  const runner = deps.runCommand ?? runQueuedCommand;
  const result = await runner(command);
  const failureMessage = result.exitCode === 0 ? undefined : (result.stderr || `Command exited with code ${result.exitCode}`);

  await queueManager.updateTaskStatus(
    taskId,
    result.exitCode === 0 ? 'completed' : 'failed',
    failureMessage,
  );

  return result;
}

async function main(): Promise<void> {
  const [action, taskId] = process.argv.slice(2);
  const environment = createEnvironmentService();

  if (!action) {
    throw new Error('No action provided');
  }

  if (action === 'list-pending') {
    const tasks = await listPendingDiagnosticTasks(createCliQueueManager(environment));
    diagnosticQueueOutput.log(JSON.stringify(tasks));
    return;
  }

  if (action === 'process-task') {
    if (!taskId) {
      throw new Error('No task ID provided');
    }

    const result = await processDiagnosticTask(taskId, {
      queueManager: createCliQueueManager(environment),
    });
    process.exit(result.exitCode);
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    diagnosticQueueOutput.error(`Diagnostic queue command failed: ${message}`);
    process.exit(1);
  });
}
