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
        args: ['commit', '-m', params.message as string],
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
        args: ['clone', params.url as string, params.path as string || '.'],
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
  };

  const taskType = taskTypeMap[intent] || 'QUERY_EXEC';

  return {
    id: taskId,
    type: taskType,
    description: originalInput,
    status: 'PENDING',
    commands: [],
    dependencies: [],
    estimatedDuration: 5000,
  };
}