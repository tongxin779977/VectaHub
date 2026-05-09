import type { Workflow } from '../types/index.js';

export const SYSTEM_WORKFLOWS: Record<string, Workflow> = {
  'sys:fetch-gh-actions-errors': {
    id: 'sys:fetch-gh-actions-errors',
    name: '获取 GitHub Actions 错误',
    mode: 'relaxed',
    createdAt: new Date(),
    steps: [
      {
        id: 'fetch_runs',
        type: 'exec',
        cli: 'gh',
        args: ['run', 'list', '--status', 'failure', '--limit', '10', '--json', 'databaseId,displayTitle,workflowName']
      },
      {
        id: 'save_to_queue',
        type: 'exec',
        cli: 'node',
        args: ['dist/utils/gh-to-queue.js', '${fetch_runs.stdout}']
      }
    ]
  },
  'sys:process-diagnostic-queue': {
    id: 'sys:process-diagnostic-queue',
    name: '批量处理诊断队列',
    mode: 'relaxed',
    createdAt: new Date(),
    steps: [
      {
        id: 'get_pending',
        type: 'exec',
        cli: 'node',
        args: ['-e', "const { getQueueManager } = require('./dist/execution/index.js'); getQueueManager().loadTasks().then(tasks => console.log(JSON.stringify(tasks.filter(t => t.status === 'pending'))))"]
      },
      {
        id: 'process_all',
        type: 'for_each',
        items: '${get_pending.stdout}',
        body: [
          {
            id: 'mark_processing',
            type: 'exec',
            cli: 'node',
            args: ['-e', "const { getQueueManager } = require('./dist/execution/index.js'); getQueueManager().updateTaskStatus('${item.id}', 'processing')"]
          },
          {
            id: 'run_fix',
            type: 'exec',
            cli: 'node',
            args: ['-e', "const child = require('child_process').spawnSync('${item.commandToFix}', { shell: true, stdio: 'inherit' }); process.exit(child.status || 0)"]
          },
          {
            id: 'mark_done',
            type: 'exec',
            cli: 'node',
            args: ['-e', "const { getQueueManager } = require('./dist/execution/index.js'); getQueueManager().updateTaskStatus('${item.id}', 'completed')"]
          }
        ]
      }
    ]
  }
};
