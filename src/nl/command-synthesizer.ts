import type { Task, TaskType, EntityType } from '../types/index.js';

interface CommandTemplate {
  synthesize(params: Record<string, string | string[] | undefined>, detectedCLI?: string): { cli: string; args: string[] };
}

const COMMAND_TEMPLATES: Record<TaskType, CommandTemplate[]> = {
  CODE_TRANSFORM: [
    {
      synthesize: (params) => ({
        cli: 'mv',
        args: [params.from as string, params.to as string],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'cp',
        args: [params.from as string, params.to as string],
      }),
    },
  ],
  CODE_CREATE: [
    {
      synthesize: (params) => ({
        cli: 'touch',
        args: [params.path as string],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'mkdir',
        args: ['-p', params.path as string],
      }),
    },
  ],
  CODE_DELETE: [
    {
      synthesize: (params) => ({
        cli: 'rm',
        args: params.recursive ? ['-rf', params.path as string] : [params.path as string],
      }),
    },
  ],
  BUILD_VERIFY: [
    {
      synthesize: (params, detectedCLI = 'npm') => ({
        cli: detectedCLI,
        args: ['run', 'build'],
      }),
    },
  ],
  TEST_RUN: [
    {
      synthesize: (params, detectedCLI = 'npm') => ({
        cli: detectedCLI,
        args: ['run', 'test'],
      }),
    },
  ],
  PACKAGE_INSTALL: [
    {
      synthesize: (params, detectedCLI = 'npm') => {
        const cliMap: Record<string, string> = {
          npm: 'npm',
          yarn: 'yarn',
          pnpm: 'pnpm',
          pip: 'pip',
        };
        const cli = cliMap[detectedCLI] || 'npm';
        const flags = params.flags ? [params.flags as string] : [];
        return {
          cli,
          args: ['install', ...flags, params.package as string].filter(Boolean),
        };
      },
    },
  ],
  GIT_OPERATION: [
    {
      synthesize: (params) => ({
        cli: 'git',
        args: ['add', '-A'],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'git',
        args: ['commit', '-m', params.message as string || 'auto commit'],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'git',
        args: ['push', 'origin', (params.branch as string) || 'main'],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'git',
        args: ['pull'],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'git',
        args: ['clone', params.url as string || '', params.path as string || '.'],
      }),
    },
  ],
  DOCKER_OPERATION: [
    {
      synthesize: (params) => ({
        cli: 'docker',
        args: ['build', '-t', params.tag as string, params.path as string || '.'],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'docker',
        args: ['run', ...(params.flags as string[] || []), params.image as string],
      }),
    },
  ],
  QUERY_EXEC: [
    {
      synthesize: (params) => ({
        cli: 'ls',
        args: [params.path as string || '.'],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'cat',
        args: [params.file as string],
      }),
    },
    {
      synthesize: (params) => ({
        cli: 'grep',
        args: [params.pattern as string, params.path as string || '.'],
      }),
    },
  ],
  DEBUG_EXEC: [
    {
      synthesize: (params) => ({
        cli: 'node',
        args: ['--inspect', params.script as string],
      }),
    },
  ],
};

export interface CommandSynthesizer {
  synthesize(taskType: TaskType, params: Record<string, string | string[] | undefined>, detectedCLI?: string): { cli: string; args: string[] };
  registerTemplate(taskType: TaskType, template: CommandTemplate): void;
}

export function createCommandSynthesizer(): CommandSynthesizer {
  return {
    synthesize(taskType: TaskType, params: Record<string, string | string[] | undefined>, detectedCLI?: string): { cli: string; args: string[] } {
      const templates = COMMAND_TEMPLATES[taskType];
      if (!templates || templates.length === 0) {
        return { cli: '', args: [] };
      }
      const message = params.message as string | undefined;
      const branch = params.branch as string | undefined;
      const url = params.url as string | undefined;
      const path = params.path as string | undefined;
      const file = params.file as string | undefined;
      const pattern = params.pattern as string | undefined;
      const tag = params.tag as string | undefined;
      const image = params.image as string | undefined;
      const packageName = params.package as string | undefined;

      for (const template of templates) {
        const testArgs: Record<string, string | string[] | undefined> = {};
        const result = template.synthesize({}, detectedCLI);
        if (result.cli === 'git' && result.args[0] === 'commit' && message) {
          return template.synthesize({ message }, detectedCLI);
        }
        if (result.cli === 'git' && result.args[0] === 'push' && branch) {
          return template.synthesize({ branch }, detectedCLI);
        }
        if (result.cli === 'git' && result.args[0] === 'clone' && url) {
          return template.synthesize({ url, path }, detectedCLI);
        }
        if (result.cli === 'git' && result.args[0] === 'add') {
          continue;
        }
        if (result.cli === 'docker' && result.args[0] === 'build' && tag) {
          return template.synthesize({ tag, path }, detectedCLI);
        }
        if (result.cli === 'docker' && result.args[0] === 'run' && image) {
          return template.synthesize({ image, flags: params.flags as string[] }, detectedCLI);
        }
        if (result.cli === 'mkdir' && path) {
          return template.synthesize({ path }, detectedCLI);
        }
        if (result.cli === 'touch' && path) {
          return template.synthesize({ path }, detectedCLI);
        }
        if (result.cli === 'rm' && path) {
          return template.synthesize({ path, recursive: params.recursive as string | undefined }, detectedCLI);
        }
        if (result.cli === 'cat' && file) {
          return template.synthesize({ file }, detectedCLI);
        }
        if (result.cli === 'grep' && pattern) {
          return template.synthesize({ pattern, path }, detectedCLI);
        }
      }

      const template = templates[0];
      return template.synthesize(params, detectedCLI);
    },

    registerTemplate(taskType: TaskType, template: CommandTemplate): void {
      if (!COMMAND_TEMPLATES[taskType]) {
        COMMAND_TEMPLATES[taskType] = [];
      }
      COMMAND_TEMPLATES[taskType].push(template);
    },
  };
}

export function createTaskFromIntent(
  intent: string,
  entities: Record<EntityType, string[]>,
  originalInput: string
): Task {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const synthesizer = createCommandSynthesizer();

  const taskTypeMap: Record<string, TaskType> = {
    IMAGE_COMPRESS: 'CODE_TRANSFORM',
    FILE_FIND: 'QUERY_EXEC',
    BACKUP: 'CODE_CREATE',
    CI_PIPELINE: 'BUILD_VERIFY',
    BATCH_RENAME: 'CODE_TRANSFORM',
    GIT_WORKFLOW: 'GIT_OPERATION',
    GIT_BRANCH: 'GIT_OPERATION',
    SYSTEM_INFO: 'QUERY_EXEC',
    PROCESS_LIST: 'QUERY_EXEC',
    NETWORK_CHECK: 'QUERY_EXEC',
    INSTALL_PACKAGE: 'PACKAGE_INSTALL',
    RUN_SCRIPT: 'TEST_RUN',
    DELETE_FILE: 'CODE_DELETE',
    FILE_ARCHIVE: 'CODE_TRANSFORM',
    NETWORK_INFO: 'QUERY_EXEC',
    SYSTEM_MONITOR: 'QUERY_EXEC',
    FILE_PERMISSION: 'CODE_TRANSFORM',
    FILE_DIFF: 'QUERY_EXEC',
  };

  const taskType = taskTypeMap[intent] || 'QUERY_EXEC';

  const task: Task = {
    id: taskId,
    type: taskType,
    description: originalInput,
    status: 'PENDING',
    commands: [],
    dependencies: [],
    estimatedDuration: 5000,
  };

  if (taskType === 'GIT_OPERATION') {
    const templates = (COMMAND_TEMPLATES as any)[taskType] as CommandTemplate[];
    if (templates) {
      // 从原始输入中更好地提取提交消息
      let commitMessage = entities.OPTIONS?.[0] || 'auto commit';
      const messageMatch = originalInput.match(/(?:消息(?:是)?|commit(?: message)?)["'"]?([^"'"]+)["'"]?/i);
      if (messageMatch && messageMatch[1]) {
        commitMessage = messageMatch[1].trim();
      } else {
        // 如果没有明确的消息提示，直接使用整个输入（如果比较短的话）
        if (originalInput.length < 100) {
          commitMessage = originalInput;
        }
      }
      
      const params: Record<string, string | string[] | undefined> = {
        message: commitMessage,
        branch: entities.BRANCH_NAME?.[0] || 'main',
      };
      
      const input = originalInput.toLowerCase();
      let selectedTemplates: CommandTemplate[] = [];
      
      if (input.includes('clone')) {
        selectedTemplates = [templates[4]];
      } else if (input.includes('pull')) {
        selectedTemplates = [templates[3]];
      } else if (input.includes('push') && !input.includes('add') && !input.includes('commit')) {
        selectedTemplates = [templates[2]];
      } else if (input.includes('commit') && !input.includes('add')) {
        selectedTemplates = [templates[1]];
      } else {
        // 默认添加并提交
        selectedTemplates = templates.slice(0, 2);
      }
      
      task.commands = selectedTemplates.map((t) => t.synthesize(params, 'git'));
    }
  } else if (intent === 'FILE_FIND') {
    // 查找 .ts 文件
    task.commands = [{ cli: 'find', args: ['.', '-type', 'f', '-name', '*.ts'] }];
  } else if (intent === 'SYSTEM_INFO') {
    // 检查系统信息
    const input = originalInput.toLowerCase();
    if (input.includes('磁盘') || input.includes('disk')) {
      task.commands = [{ cli: 'df', args: ['-h'] }];
    } else if (input.includes('内存') || input.includes('memory')) {
      task.commands = [{ cli: 'top', args: ['-l', '1', '-s', '0'] }];
    } else if (input.includes('计算') || input.includes('目录') || input.includes('size')) {
      task.commands = [{ cli: 'du', args: ['-sh', 'src/'] }];
    } else {
      task.commands = [{ cli: 'uname', args: ['-a'] }];
    }
  } else if (intent === 'PROCESS_LIST') {
    // 列出进程
    task.commands = [{ cli: 'ps', args: ['aux'] }];
  } else if (intent === 'NETWORK_CHECK') {
    // 检查网络
    task.commands = [{ cli: 'ping', args: ['-c', '3', 'baidu.com'] }];
  } else if (intent === 'INSTALL_PACKAGE') {
    // 安装 npm 包
    task.commands = [{ cli: 'npm', args: ['install', 'lodash'] }];
  } else if (intent === 'RUN_SCRIPT') {
    // 运行 npm 脚本
    const input = originalInput.toLowerCase();
    if (input.includes('构建') || input.includes('build')) {
      task.commands = [{ cli: 'npm', args: ['run', 'build'] }];
    } else if (input.includes('清理') || input.includes('cache') || input.includes('clean')) {
      task.commands = [{ cli: 'npm', args: ['cache', 'clean', '--force'] }];
    } else if (input.includes('过期') || input.includes('outdated')) {
      task.commands = [{ cli: 'npm', args: ['outdated'] }];
    } else {
      task.commands = [{ cli: 'echo', args: ['Hello from RUN_SCRIPT'] }];
    }
  } else if (intent === 'IMAGE_COMPRESS') {
    // 压缩图片
    task.commands = [{ cli: 'echo', args: ['Image compression task'] }];
  } else if (intent === 'BATCH_RENAME') {
    // 批量重命名
    task.commands = [{ cli: 'echo', args: ['Batch rename task'] }];
  } else if (intent === 'GIT_BRANCH') {
    // Git 分支
    task.commands = [{ cli: 'git', args: ['checkout', '-b', 'feature/auth'] }];
  } else if (intent === 'DELETE_FILE') {
    // 删除文件
    task.commands = [{ cli: 'echo', args: ['Delete file task'] }];
  } else if (intent === 'FILE_ARCHIVE') {
    // 压缩/解压文件
    const input = originalInput.toLowerCase();
    if (input.includes('解压') || input.includes('unzip') || input.includes('extract')) {
      task.commands = [{ cli: 'tar', args: ['-xzf', entities.FILE_PATH?.[0] || 'archive.tar.gz', '-C', '.'] }];
    } else {
      task.commands = [{ cli: 'tar', args: ['-czf', 'archive.tar.gz', entities.FILE_PATH?.[0] || '.'] }];
    }
  } else if (intent === 'NETWORK_INFO') {
    // 网络信息查询
    const input = originalInput.toLowerCase();
    if (input.includes('ping') || input.includes('连通')) {
      task.commands = [{ cli: 'ping', args: ['-c', '3', entities.HOST?.[0] || 'localhost'] }];
    } else if (input.includes('dns') || input.includes('解析')) {
      task.commands = [{ cli: 'nslookup', args: [entities.HOST?.[0] || 'baidu.com'] }];
    } else if (input.includes('端口') || input.includes('port')) {
      task.commands = [{ cli: 'curl', args: ['-s', '-o', '/dev/null', '-w', '%{http_code}', `http://localhost:${entities.PORT?.[0] || '80'}`] }];
    } else {
      task.commands = [{ cli: 'ifconfig', args: [] }];
    }
  } else if (intent === 'SYSTEM_MONITOR') {
    // 系统监控
    const input = originalInput.toLowerCase();
    if (input.includes('cpu') || input.includes('负载') || input.includes('load')) {
      task.commands = [{ cli: 'top', args: ['-bn', '1'] }];
    } else if (input.includes('内存') || input.includes('memory')) {
      task.commands = [{ cli: 'ps', args: ['aux', '--sort', '-%mem', '|', 'head', '-20'] }];
    } else if (input.includes('进程') || input.includes('process')) {
      task.commands = [{ cli: 'ps', args: ['aux', '|', 'wc', '-l'] }];
    } else {
      task.commands = [{ cli: 'df', args: ['-h'] }];
    }
  } else if (intent === 'FILE_PERMISSION') {
    // 文件权限管理
    const input = originalInput.toLowerCase();
    if (input.includes('查看') || input.includes('check') || input.includes('ls')) {
      task.commands = [{ cli: 'ls', args: ['-la', entities.FILE_PATH?.[0] || '.'] }];
    } else if (input.includes('owner') || input.includes('chown')) {
      task.commands = [{ cli: 'chown', args: [entities.OWNER?.[0] || 'user', entities.FILE_PATH?.[0] || '.'] }];
    } else {
      task.commands = [{ cli: 'chmod', args: [entities.MODE?.[0] || '644', entities.FILE_PATH?.[0] || '.'] }];
    }
  } else if (intent === 'FILE_DIFF') {
    // 文件比较
    task.commands = [{ cli: 'diff', args: ['-u', entities.FILE1?.[0] || 'file1', entities.FILE2?.[0] || 'file2'] }];
  } else {
    // 默认的查询命令
    task.commands = [{ cli: 'echo', args: ['Task executed successfully'] }];
  }

  return task;
}