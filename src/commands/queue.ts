import { Command } from 'commander';
import { getQueueManager, getQueueManagerForProject } from '../execution/queue-manager.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

function wrapQueueError(error: unknown, action: string): VectaHubError {
  const message = error instanceof Error ? error.message : String(error);
  return new VectaHubError(`Failed to ${action} diagnostic queue: ${message}`, ErrorType.FILESYSTEM, error);
}

export const queueCmd = new Command('queue')
  .description('管理诊断队列');

queueCmd
  .command('list')
  .description('列出队列中的所有任务')
  .option('--json', '以 JSON 格式输出')
  .option('--project <path>', '指定项目路径')
  .action(async (options) => {
    const manager = options.project 
      ? getQueueManagerForProject(options.project)
      : getQueueManager();

    let tasks;
    try {
      tasks = await manager.loadTasks();
    } catch (error) {
      throw wrapQueueError(error, 'list');
    }
    
    if (options.json) {
      console.log(JSON.stringify({ ok: true, tasks }));
    } else {
      if (tasks.length === 0) {
        console.log('\n📋 队列是空的\n');
        return;
      }
      
      console.log(`\n📋 队列中共有 ${tasks.length} 个任务:\n`);
      tasks.forEach((task, index) => {
        console.log(`${index + 1}. [${task.status.toUpperCase()}] ${task.title || task.id}`);
        if (task.sourceId) {
          console.log(`     来源: ${task.sourceId}`);
        }
        if (task.createdAt) {
          console.log(`     创建时间: ${new Date(task.createdAt).toLocaleString()}`);
        }
        console.log();
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
      ? getQueueManagerForProject(options.project)
      : getQueueManager();

    try {
      await manager.removeTask(id);
    } catch (error) {
      throw wrapQueueError(error, 'remove');
    }
    
    if (options.json) {
      console.log(JSON.stringify({ ok: true, message: `任务 ${id} 已移除` }));
    } else {
      console.log(`\n✅ 任务 ${id} 已从队列中移除\n`);
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
      ? getQueueManagerForProject(options.project)
      : getQueueManager();

    let tasks;
    try {
      tasks = await manager.loadTasks();
    } catch (error) {
      throw wrapQueueError(error, 'clear');
    }
    if (tasks.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ ok: true, message: '队列为空，无需清空' }));
      } else {
        console.log('\n📋 队列为空，无需清空\n');
      }
      return;
    }
    
    if (!options.force && !options.json) {
      console.log(`\n⚠️  确认清空队列？这将删除所有 ${tasks.length} 个任务。`);
      process.stdout.write('继续? (y/N) ');
      
      const answer = await new Promise<string>(resolve => {
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });
      
      if (answer !== 'y' && answer !== 'yes') {
        if (options.json) {
          console.log(JSON.stringify({ ok: false, message: '用户取消操作' }));
        } else {
          console.log('\n✅ 操作已取消\n');
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
      console.log(JSON.stringify({ ok: true, message: '队列已清空' }));
    } else {
      console.log('\n✅ 队列已清空\n');
    }
  });
