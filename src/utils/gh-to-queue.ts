import { getQueueManager } from '../execution/queue-manager.js';
import type { DiagnosticTask } from '../types/diagnostic.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = dirname(modulePath);
const isSourceRuntime = modulePath.endsWith('.ts');
const cliEntryPoint = isSourceRuntime
  ? join(moduleDir, '..', 'cli.ts')
  : join(moduleDir, '..', 'cli.js');
const defaultCliPath = isSourceRuntime
  ? `${process.execPath} --import tsx ${cliEntryPoint}`
  : `${process.execPath} ${cliEntryPoint}`;

export async function processFailedRuns(input: string): Promise<number> {
  console.log(`Received input of length: ${input.length}`);
  if (input.length > 0) {
    console.log(`Input preview: ${input.substring(0, 100)}...`);
  }
  const runs = JSON.parse(input);
  if (!Array.isArray(runs)) {
    console.log('No failed runs found or invalid format.');
    return 0;
  }

  const queueManager = getQueueManager();
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

  console.log(`Successfully added ${count} failed runs to the diagnostic queue.`);
  return count;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('No input provided');
    process.exit(1);
  }

  try {
    await processFailedRuns(input);
  } catch (error) {
    console.error(`Failed to parse or save runs: ${error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
