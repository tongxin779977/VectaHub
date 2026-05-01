import type { TaskList, Task } from '../types/index.js';
import { createInterface } from 'readline';
import { createLogger } from './logger.js';

const logger = createLogger('command-editor');

export interface CommandEditAction {
  type: 'edit' | 'add' | 'delete' | 'reorder';
  stepIndex?: number;
  newCommand?: { cli: string; args: string[] };
  newPosition?: number;
}

export async function reviewAndEditCommands(taskList: TaskList): Promise<TaskList> {
  console.log('\n🤖 AI 解析结果:\n');

  const tasks = taskList.tasks;
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const cmd = task.commands[0];
    const commandStr = `${cmd.cli} ${cmd.args.join(' ')}`;
    console.log(`步骤 ${i + 1}: ${commandStr}`);
  }

  console.log('\n[1] 执行');
  console.log('[2] 修改命令');
  console.log('[3] 添加步骤');
  console.log('[4] 删除步骤');
  console.log('[5] 取消\n');

  const answer = await promptUser('选择 [1-5]: ');
  const choice = answer.trim();

  switch (choice) {
    case '1':
      return taskList;
    case '2':
      return await editCommands(taskList);
    case '3':
      return await addStep(taskList);
    case '4':
      return await deleteStep(taskList);
    case '5':
      throw new Error('User cancelled');
    default:
      console.log('❌ 无效选择，执行默认命令\n');
      return taskList;
  }
}

async function editCommands(taskList: TaskList): Promise<TaskList> {
  const stepIndex = await promptStepIndex(taskList.tasks.length);
  if (stepIndex === -1) return taskList;

  const task = taskList.tasks[stepIndex];
  const cmd = task.commands[0];
  console.log(`\n当前命令: ${cmd.cli} ${cmd.args.join(' ')}`);

  const newCommand = await promptUser('新命令 (例如: git commit -m "fix"): ');
  const parts = parseCommand(newCommand);

  if (parts.length === 0) {
    console.log('❌ 无效命令\n');
    return taskList;
  }

  task.commands[0] = { cli: parts[0], args: parts.slice(1) };
  console.log('✅ 已修改\n');

  return await reviewAndEditCommands(taskList);
}

async function addStep(taskList: TaskList): Promise<TaskList> {
  const newCommand = await promptUser('新命令 (例如: git status): ');
  const parts = parseCommand(newCommand);

  if (parts.length === 0) {
    console.log('❌ 无效命令\n');
    return taskList;
  }

  const newTask: Task = {
    id: `task_${Date.now()}`,
    type: 'QUERY_EXEC',
    description: newCommand,
    status: 'PENDING',
    commands: [{ cli: parts[0], args: parts.slice(1) }],
    dependencies: [],
    estimatedDuration: 5000,
  };

  taskList.tasks.push(newTask);
  console.log('✅ 已添加\n');

  return await reviewAndEditCommands(taskList);
}

async function deleteStep(taskList: TaskList): Promise<TaskList> {
  const stepIndex = await promptStepIndex(taskList.tasks.length);
  if (stepIndex === -1) return taskList;

  const deleted = taskList.tasks.splice(stepIndex, 1);
  console.log(`✅ 已删除: ${deleted[0].description}\n`);

  return await reviewAndEditCommands(taskList);
}

async function promptStepIndex(maxIndex: number): Promise<number> {
  const answer = await promptUser(`要修改哪个步骤? [1-${maxIndex}]: `);
  const index = parseInt(answer.trim(), 10) - 1;

  if (isNaN(index) || index < 0 || index >= maxIndex) {
    console.log('❌ 无效索引\n');
    return -1;
  }

  return index;
}

function parseCommand(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
    } else if (char === ' ') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}
