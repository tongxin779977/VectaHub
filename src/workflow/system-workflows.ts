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
        args: [
          '-e',
          "const fs = require('fs'); const os = require('os'); const path = require('path'); const input = process.argv[1]; if (!input) { console.error('No input'); process.exit(1); } try { const runs = JSON.parse(input); if (!Array.isArray(runs) || runs.length === 0) { console.log('No failed runs found'); process.exit(0); } const vectahubHome = path.join(os.homedir(), '.vectahub'); const queueFile = path.join(vectahubHome, 'diagnostic-queue.json'); function ensureDir() { if (!fs.existsSync(vectahubHome)) fs.mkdirSync(vectahubHome, { recursive: true }); } function loadTasks() { try { return JSON.parse(fs.readFileSync(queueFile, 'utf-8')); } catch { return []; } } function saveTasks(tasks) { ensureDir(); fs.writeFileSync(queueFile, JSON.stringify(tasks, null, 2), 'utf-8'); } const tasks = loadTasks(); const now = new Date().toISOString(); let added = 0; for (const run of runs) { const taskId = 'gh_' + run.databaseId; if (tasks.some(t => t.sourceId === String(run.databaseId))) continue; tasks.unshift({ id: taskId, title: 'GH Action 失败: ' + run.workflowName, description: '任务 \"' + run.displayTitle + '\" 在 GitHub 上执行失败。', source: 'github-actions', sourceId: String(run.databaseId), commandToFix: 'node dist/cli.js run -f templates/gh-auto-process.yaml --variable run_id=' + run.databaseId + ' --mode relaxed', status: 'pending', createdAt: now, updatedAt: now }); added++; } saveTasks(tasks); console.log('Successfully added ' + added + ' failed runs to the diagnostic queue.'); } catch (e) { console.error('Failed to parse or save runs:', e); process.exit(1); }",
          '${fetch_runs.stdout}'
        ]
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
