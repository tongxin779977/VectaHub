import { getQueueManager } from '../execution/queue-manager.js';
import type { DiagnosticTask } from '../types/diagnostic.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = dirname(modulePath);
const isSourceRuntime = modulePath.endsWith('.ts');
const cliEntryPoint = isSourceRuntime
  ? join(moduleDir, '..', 'cli.ts')
  : join(moduleDir, '..', 'cli.js');
const defaultCliPath = isSourceRuntime
  ? `${process.execPath} --import tsx ${cliEntryPoint}`
  : `${process.execPath} ${cliEntryPoint}`;

const queueLogger = {
  error: (message: string) => process.stderr.write(`${message}\n`),
  warn: (message: string) => process.stderr.write(`${message}\n`),
};

export interface ProcessFailedRunsOutput {
  log(message: string): void;
  error(message: string): void;
}

export interface ProcessFailedRunsDeps {
  output: ProcessFailedRunsOutput;
  environment: IEnvironmentService;
}

const cliOutput: ProcessFailedRunsOutput = {
  log: (message: string) => process.stdout.write(`${message}\n`),
  error: (message: string) => process.stderr.write(`${message}\n`),
};

export async function processFailedRuns(
  input: string,
  deps: ProcessFailedRunsDeps = { output: cliOutput, environment: createEnvironmentService() },
): Promise<number> {
  deps.output.log(`Received input of length: ${input.length}`);
  if (input.length > 0) {
    deps.output.log(`Input preview: ${input.substring(0, 100)}...`);
  }
  const runs = JSON.parse(input);
  if (!Array.isArray(runs)) {
    deps.output.log('No failed runs found or invalid format.');
    return 0;
  }

  const queueManager = getQueueManager(
    join(deps.environment.getHomePath(), 'diagnostic-queue.json'),
    { logger: queueLogger },
  );
  let count = 0;

  for (const run of runs) {
    const cliPath = process.env.VECTAHUB_CLI_PATH || defaultCliPath;
    const task: Omit<DiagnosticTask, 'createdAt' | 'updatedAt'> = {
      id: `gh_${run.databaseId}`,
      title: `GH Action 失败: ${run.workflowName}`,
      description: `任务 "${run.displayTitle}" 在 GitHub 上执行失败。`,
      source: 'github-actions',
      sourceId: String(run.databaseId),
      commandToFix: `${cliPath} run -f templates/gh-auto-process.yaml --variable run_id=${run.databaseId} --mode relaxed`,
      status: 'pending',
    };
    await queueManager.addTask(task);
    count++;
  }

  deps.output.log(`Successfully added ${count} failed runs to the diagnostic queue.`);
  return count;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    cliOutput.error('No input provided');
    process.exit(1);
  }

  try {
    await processFailedRuns(input, { output: cliOutput, environment: createEnvironmentService() });
  } catch (error) {
    cliOutput.error(`Failed to parse or save runs: ${error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
