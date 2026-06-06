import { Command } from 'commander';
import { format } from 'node:util';
import { getQueueManager, getQueueManagerForProject } from '../execution/queue-manager.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import type { InfrastructureContext } from '../infrastructure/context.js';

interface QueueCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  write(message: string): void;
  json(payload: unknown): void;
}

function createQueueCommandOutput(): QueueCommandOutput {
  const formatMessage = (message?: unknown, optionalParams: unknown[] = []): string => {
    if (message === undefined && optionalParams.length === 0) {
      return '';
    }
    return format(message, ...optionalParams);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${formatMessage(message, optionalParams)}\n`);
    },
    write(message: string): void {
      process.stdout.write(message);
    },
    json(payload: unknown): void {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    },
  };
}

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function wrapQueueError(error: unknown, action: string): VectaHubError {
  const message = error instanceof Error ? error.message : String(error);
  return new VectaHubError(`Failed to ${action} diagnostic queue: ${message}`, ErrorType.FILESYSTEM, error);
}

export function createQueueCmd(context: InfrastructureContext): Command {
  const output = createQueueCommandOutput();
  const queueCmd = new Command('queue')
    .description('管理诊断队列');

  const deps = {
    logger: context.logger.getLogger('queue-manager'),
  };
  const getDefaultQueueFile = () => context.environment.getPath('diagnostic-queue.json');
  const getProjectQueueFile = (projectRoot: string) => context.environment.getPath('projects', djb2Hash(projectRoot), 'diagnostic-queue.json');

  queueCmd
  .command('list')
  .description('列出队列中的所有任务')
  .option('--json', '以 JSON 格式输出')
  .option('--project <path>', '指定项目路径')
  .action(async (options) => {
    const manager = options.project 
      ? getQueueManagerForProject(getProjectQueueFile(options.project), deps)
      : getQueueManager(getDefaultQueueFile(), deps);

    let tasks;
    try {
      tasks = await manager.loadTasks();
    } catch (error) {
      throw wrapQueueError(error, 'list');
    }
    
    if (options.json) {
      output.json({ ok: true, tasks });
    } else {
      if (tasks.length === 0) {
        output.log('\n📋 队列是空的\n');
        return;
      }
      
      output.log(`\n📋 队列中共有 ${tasks.length} 个任务:\n`);
      tasks.forEach((task, index) => {
        output.log(`${index + 1}. [${task.status.toUpperCase()}] ${task.title || task.id}`);
        if (task.sourceId) {
          output.log(`     来源: ${task.sourceId}`);
        }
        if (task.createdAt) {
          output.log(`     创建时间: ${new Date(task.createdAt).toLocaleString()}`);
        }
        output.log();
      });
    }
  });

  queueCmd
  .command('remove')
  .description('从队列中移除指定任务')
  .argument('<id>', '任务 ID')
  .option('--json', '以 JSON 格式输出')
  .option('--project <path>', '指定项目路径')
  .action(async (id, options) => {
    const manager = options.project 
      ? getQueueManagerForProject(getProjectQueueFile(options.project), deps)
      : getQueueManager(getDefaultQueueFile(), deps);

    try {
      await manager.removeTask(id);
    } catch (error) {
      throw wrapQueueError(error, 'remove');
    }
    
    if (options.json) {
      output.json({ ok: true, message: `任务 ${id} 已移除` });
    } else {
      output.log(`\n✅ 任务 ${id} 已从队列中移除\n`);
    }
  });

  queueCmd
  .command('clear')
  .description('清空队列中的所有任务')
  .option('--json', '以 JSON 格式输出')
  .option('--project <path>', '指定项目路径')
  .option('--force', '跳过确认提示')
  .action(async (options) => {
    const manager = options.project 
      ? getQueueManagerForProject(getProjectQueueFile(options.project), deps)
      : getQueueManager(getDefaultQueueFile(), deps);

    let tasks;
    try {
      tasks = await manager.loadTasks();
    } catch (error) {
      throw wrapQueueError(error, 'clear');
    }
    if (tasks.length === 0) {
      if (options.json) {
        output.json({ ok: true, message: '队列为空，无需清空' });
      } else {
        output.log('\n📋 队列为空，无需清空\n');
      }
      return;
    }
    
    if (!options.force && !options.json) {
      output.log(`\n⚠️  确认清空队列？这将删除所有 ${tasks.length} 个任务。`);
      output.write('继续? (y/N) ');
      
      const answer = await new Promise<string>(resolve => {
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });
      
      if (answer !== 'y' && answer !== 'yes') {
        if (options.json) {
          output.json({ ok: false, message: '用户取消操作' });
        } else {
          output.log('\n✅ 操作已取消\n');
        }
        return;
      }
    }
    
    try {
      await manager.clearAll();
    } catch (error) {
      throw wrapQueueError(error, 'clear');
    }
    
    if (options.json) {
      output.json({ ok: true, message: '队列已清空' });
    } else {
      output.log('\n✅ 队列已清空\n');
    }
  });

  return queueCmd;
}
