import { describe, expect, it, vi } from 'vitest';

import { processFailedRuns } from './gh-to-queue.js';

const addTask = vi.fn();

vi.mock('../execution/queue-manager.js', () => ({
  getQueueManager: () => ({
    addTask,
  }),
}));

describe('processFailedRuns', () => {
  it('writes queue entries with an executable CLI path', async () => {
    addTask.mockReset();

    await processFailedRuns(JSON.stringify([
      {
        databaseId: 123,
        displayTitle: 'Broken workflow',
        workflowName: 'CI',
      },
    ]));

    expect(addTask).toHaveBeenCalledTimes(1);
    const task = addTask.mock.calls[0]?.[0];

    expect(task.commandToFix).toContain(process.execPath);
    expect(task.commandToFix).toContain('run -f templates/gh-auto-process.yaml');
    expect(task.commandToFix).not.toContain('node dist/cli.js');
  });
});
