import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Step, Workflow } from '../types/index.js';

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = dirname(modulePath);
const isSourceRuntime = modulePath.endsWith('.ts');
const internalScriptDir = isSourceRuntime ? join(moduleDir, '..', 'utils') : join(moduleDir, '..');
const internalScriptExtension = isSourceRuntime ? '.ts' : '.js';
const internalScriptLoaderArgs = isSourceRuntime ? ['--import', 'tsx'] : [];

function createInternalScriptStep(id: string, scriptName: string, args: string[]): Step {
  return {
    id,
    type: 'exec',
    cli: process.execPath,
    args: [
      ...internalScriptLoaderArgs,
      join(internalScriptDir, `${scriptName}${internalScriptExtension}`),
      ...args,
    ],
  };
}

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
        ...createInternalScriptStep('save_to_queue', 'gh-to-queue', ['${fetch_runs}'])
      }
    ]
  },
  'sys:process-diagnostic-queue': {
    id: 'sys:process-diagnostic-queue',
    name: '批量处理诊断队列',
    mode: 'relaxed',
    createdAt: new Date(),
    steps: [
      createInternalScriptStep('get_pending', 'process-diagnostic-queue', ['list-pending']),
      {
        id: 'process_all',
        type: 'for_each',
        items: '${get_pending.stdout}',
        body: [
          createInternalScriptStep('process_task', 'process-diagnostic-queue', ['process-task', '${item.id}'])
        ]
      }
    ]
  }
};
