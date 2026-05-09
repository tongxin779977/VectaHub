import { getQueueManager } from '../execution/queue-manager.js';
import type { DiagnosticTask } from '../types/diagnostic.js';

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('No input provided');
    process.exit(1);
  }

  try {
    const runs = JSON.parse(input);
    if (!Array.isArray(runs)) {
      console.log('No failed runs found or invalid format.');
      return;
    }

    const queueManager = getQueueManager();
    let count = 0;

    for (const run of runs) {
      const task: Omit<DiagnosticTask, 'createdAt' | 'updatedAt'> = {
        id: `gh_${run.databaseId}`,
        title: `GH Action 失败: ${run.workflowName}`,
        description: `任务 "${run.displayTitle}" 在 GitHub 上执行失败。`,
        source: 'github-actions',
        sourceId: String(run.databaseId),
        commandToFix: `node dist/cli.js run -f templates/gh-auto-process.yaml --variable run_id=${run.databaseId} --mode relaxed`,
        status: 'pending',
      };
      await queueManager.addTask(task);
      count++;
    }

    console.log(`Successfully added ${count} failed runs to the diagnostic queue.`);
  } catch (error) {
    console.error(`Failed to parse or save runs: ${error}`);
    process.exit(1);
  }
}

main();
