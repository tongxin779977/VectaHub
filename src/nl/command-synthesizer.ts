import type { Task, TaskType, EntityType } from '../types/index.js';
import {
  loadCommandConfig,
  loadIntentConfig,
  type CommandConfig,
  type IntentConfig,
  type CommandTemplateConfig,
} from './command-config.js';

/**
 * 将命令参数中的 ${key} 占位符替换为实际值
 * @param args - 包含占位符的参数数组
 * @param params - 参数键值对
 * @returns 替换后的参数数组，空字符串参数会被过滤
 */
function substituteArgs(args: string[], params: Record<string, string>): string[] {
  return args.map(arg => {
    return arg.replace(/\$\{(\w+)\}/g, (_, key) => {
      return key in params ? params[key] : `\${${key}}`;
    });
  }).filter(arg => arg !== '');
}

/**
 * 使用参数解析命令模板
 * @param template - 命令模板配置
 * @param params - 参数键值对
 * @param detectedCLI - 可选的检测到的 CLI 工具
 * @returns 解析后的命令对象
 */
function resolveTemplate(
  template: CommandTemplateConfig,
  params: Record<string, string>,
  detectedCLI?: string
): { cli: string; args: string[] } {
  const mergedParams = { ...template.params, ...params };
  if (detectedCLI) {
    mergedParams.detectedCLI = detectedCLI;
  }
  return {
    cli: substituteArgs([template.cli], mergedParams)[0],
    args: substituteArgs(template.args, mergedParams),
  };
}

function resolveIntentFromConfig(
  intentConfig: IntentConfig,
  intentName: string,
  entities: Record<EntityType, string[]>,
  originalInput: string
): { taskType: string; commands: { cli: string; args: string[] }[] } | null {
  const intent = intentConfig.intents[intentName];
  if (!intent) return null;

  const input = originalInput.toLowerCase();
  const entityParams: Record<string, string> = {};

  if (entities.HOST?.[0]) entityParams.host = entities.HOST[0];
  if (entities.PORT?.[0]) entityParams.port = entities.PORT[0];
  if (entities.FILE_PATH?.[0]) entityParams.filePath = entities.FILE_PATH[0];
  if (entities.FILE1?.[0]) entityParams.file1 = entities.FILE1[0];
  if (entities.FILE2?.[0]) entityParams.file2 = entities.FILE2[0];
  if (entities.OWNER?.[0]) entityParams.owner = entities.OWNER[0];
  if (entities.MODE?.[0]) entityParams.mode = entities.MODE[0];

  if (intentName === 'INSTALL_PACKAGE' && !entityParams.package) {
    const pkgMatch = originalInput.match(/(?:安装|install|添加|add)\s+(?:-g\s+|--global\s+|-D\s+|--dev\s+|开发依赖\s+)?(\S+)/i);
    if (pkgMatch?.[1]) {
      entityParams.package = pkgMatch[1];
    }
  }
  if (intentName === 'CREATE_FILE' && !entityParams.path) {
    const fileMatch = originalInput.match(/(?:创建|新建|添加|create|touch)\s*(?:文件夹|目录|文件|folder)\s+(\S+)/i)
      || originalInput.match(/(?:创建|新建|添加|create|touch)\s+(\S+\.\S+)/i)
      || originalInput.match(/(?:创建|新建|添加|create|touch)\s+(\S+)/i);
    if (fileMatch?.[1] && !fileMatch[1].startsWith('${')) {
      entityParams.path = fileMatch[1];
    }
  }

  for (const rule of intent.selection) {
    if (rule.default) {
      const override = rule.override;
      const ruleParams = { ...rule.params, ...entityParams };
      return {
        taskType: intent.taskType,
        commands: [{
          cli: override ? substituteArgs([override.cli], ruleParams)[0] : rule.pick as string,
          args: override ? substituteArgs(override.args, ruleParams) : [],
        }],
      };
    }

    if (rule.when) {
      const keywordsMatch = rule.when.keywords
        ? rule.when.keywords.some(k => input.includes(k))
        : true;
      const excludeMatch = rule.when.exclude
        ? rule.when.exclude.some(k => input.includes(k))
        : false;

      if (keywordsMatch && !excludeMatch) {
        const override = rule.override;
        const ruleParams = { ...rule.params, ...entityParams };
        return {
          taskType: intent.taskType,
          commands: [{
            cli: override ? substituteArgs([override.cli], ruleParams)[0] : rule.pick as string,
            args: override ? substituteArgs(override.args, ruleParams) : [],
          }],
        };
      }
    }
  }

  return null;
}

/**
 * 命令合成器接口，负责将任务类型和参数转换为可执行的 CLI 命令
 */
export interface CommandSynthesizer {
  /**
   * 合成 CLI 命令
   * @param taskType - 任务类型
   * @param params - 参数键值对
   * @param detectedCLI - 可选的检测到的 CLI 工具
   * @returns 包含 cli 和 args 的命令对象
   */
  synthesize(taskType: TaskType, params: Record<string, string | string[] | undefined>, detectedCLI?: string): { cli: string; args: string[] };
  /**
   * 注册运行时命令模板
   * @param taskType - 任务类型
   * @param template - 命令模板对象
   */
  registerTemplate(taskType: TaskType, template: { synthesize: (params: Record<string, string | string[] | undefined>, detectedCLI?: string) => { cli: string; args: string[] } }): void;
}

/**
 * 创建命令合成器实例
 * @param commandConfig - 可选的命令配置，未提供时从默认路径加载
 * @returns 命令合成器实例
 */
export function createCommandSynthesizer(commandConfig?: CommandConfig): CommandSynthesizer {
  const config = commandConfig || loadCommandConfig(
    `${process.cwd()}/config/commands/templates.yaml`
  );
  const runtimeTemplates: Record<TaskType, Array<{
    synthesize: (params: Record<string, string | string[] | undefined>, detectedCLI?: string) => { cli: string; args: string[] };
  }>> = {} as Record<TaskType, Array<{
    synthesize: (params: Record<string, string | string[] | undefined>, detectedCLI?: string) => { cli: string; args: string[] };
  }>>;

  return {
    synthesize(taskType: TaskType, params: Record<string, string | string[] | undefined>, detectedCLI?: string): { cli: string; args: string[] } {
      const runtime = runtimeTemplates[taskType];
      const configTemplates = config.templates[taskType] || [];
      const hasRuntime = runtime && runtime.length > 0;
      const hasConfig = configTemplates.length > 0;

      if (!hasRuntime && !hasConfig) {
        return { cli: '', args: [] };
      }

      if (hasRuntime) {
        return resolveRuntimeTemplates(runtime, params, detectedCLI);
      }

      return resolveConfigTemplates(configTemplates, params, detectedCLI);
    },

    registerTemplate(taskType: TaskType, template: { synthesize: (params: Record<string, string | string[] | undefined>, detectedCLI?: string) => { cli: string; args: string[] } }): void {
      if (!runtimeTemplates[taskType]) {
        runtimeTemplates[taskType] = [];
      }
      runtimeTemplates[taskType].push(template);
    },
  };
}

function resolveRuntimeTemplates(
  templates: Array<{ synthesize: (params: Record<string, string | string[] | undefined>, detectedCLI?: string) => { cli: string; args: string[] } }>,
  params: Record<string, string | string[] | undefined>,
  detectedCLI?: string
): { cli: string; args: string[] } {
  const message = params.message as string | undefined;
  const branch = params.branch as string | undefined;
  const url = params.url as string | undefined;
  const path = params.path as string | undefined;
  const file = params.file as string | undefined;
  const pattern = params.pattern as string | undefined;
  const tag = params.tag as string | undefined;
  const image = params.image as string | undefined;

  for (const template of templates) {
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

  return templates[0].synthesize(params, detectedCLI);
}

function resolveConfigTemplates(
  templates: CommandTemplateConfig[],
  params: Record<string, string | string[] | undefined>,
  detectedCLI?: string
): { cli: string; args: string[] } {
  const stringParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') stringParams[k] = v;
  }

  for (const template of templates) {
    if (template.name === 'add' && template.args.includes('-A')) {
      continue;
    }
    if (template.params) {
      const allParams = { ...template.params, ...stringParams };
      const cli = substituteArgs([template.cli], allParams)[0];
      const args = substituteArgs(template.args, allParams);
      if (detectedCLI) {
        return { cli: detectedCLI, args };
      }
      return { cli, args };
    }
  }

  const first = templates[0];
  if (detectedCLI && first.params?.detectedCLI) {
    return { cli: detectedCLI, args: substituteArgs(first.args, stringParams) };
  }
  return resolveTemplate(first, stringParams, detectedCLI);
}

function extractGitCommitMessage(
  entities: Record<EntityType, string[]>,
  originalInput: string
): string {
  const messageMatch = originalInput.match(
    /(?:消息(?:是)?|commit(?: message)?)["'"]?([^"'"]+)["'"]?/i
  );
  if (messageMatch?.[1]) {
    return messageMatch[1].trim();
  }

  const commitExtract = originalInput.match(/commit(.+)/i);
  if (commitExtract?.[1]) {
    return commitExtract[1].trim();
  }

  return entities.OPTIONS?.[0] || 'auto commit';
}

function resolveGitWorkflow(
  entities: Record<EntityType, string[]>,
  originalInput: string,
  templates: CommandTemplateConfig[]
): { cli: string; args: string[] }[] {
  const commitMessage = extractGitCommitMessage(entities, originalInput);
  const branch = entities.BRANCH_NAME?.[0] || 'main';
  const options = entities.OPTIONS || [];

  const findTemplate = (name: string) => templates.find(t => t.name === name);
  const makeGit = (args: string[]) => ({ cli: 'git', args });

  if (options.includes('pull')) {
    return [makeGit(['pull'])];
  }

  if (options.includes('push')) {
    return [makeGit(['push', 'origin', branch])];
  }

  if (options.includes('clone')) {
    const url = originalInput.match(/https?:\/\/[^\s]+/)?.[0] || '';
    return [makeGit(['clone', url])];
  }

  if (options.includes('commit') && !options.includes('add')) {
    return [makeGit(['commit', '-m', commitMessage])];
  }

  const addT = findTemplate('add');
  const commitT = findTemplate('commit');
  return [
    addT ? resolveTemplate(addT, {}) : makeGit(['add', '-A']),
    commitT ? resolveTemplate(commitT, { message: commitMessage }) : makeGit(['commit', '-m', commitMessage]),
  ];
}

/**
 * 从意图和实体创建可执行的任务对象
 *
 * 按以下优先级解析命令：
 * 1. GIT_WORKFLOW 意图使用专门的 Git 工作流解析
 * 2. 从 intent-config 配置中解析
 * 3. 使用 QUERY_EXEC 作为降级方案
 *
 * @param intent - 意图名称
 * @param entities - 提取的实体
 * @param originalInput - 用户原始输入
 * @param intentConfig - 可选的意图配置
 * @param commandConfig - 可选的命令配置
 * @returns 任务对象
 */
export function createTaskFromIntent(
  intent: string,
  entities: Record<EntityType, string[]>,
  originalInput: string,
  intentConfig?: IntentConfig,
  commandConfig?: CommandConfig
): Task {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const iConfig = intentConfig || loadIntentConfig(
    `${process.cwd()}/config/commands/intents.yaml`
  );
  const cConfig = commandConfig || loadCommandConfig(
    `${process.cwd()}/config/commands/templates.yaml`
  );

  if (intent === 'GIT_WORKFLOW') {
    const templates = cConfig.templates.GIT_OPERATION || [];
    const commands = resolveGitWorkflow(entities, originalInput, templates);
    return {
      id: taskId,
      type: 'GIT_OPERATION',
      description: originalInput,
      status: 'PENDING',
      commands,
      dependencies: [],
      estimatedDuration: 5000,
    };
  }

  const configResult = resolveIntentFromConfig(iConfig, intent, entities, originalInput);
  if (configResult) {
    return {
      id: taskId,
      type: configResult.taskType as TaskType,
      description: originalInput,
      status: 'PENDING',
      commands: configResult.commands,
      dependencies: [],
      estimatedDuration: 5000,
    };
  }

  return {
    id: taskId,
    type: 'QUERY_EXEC',
    description: originalInput,
    status: 'PENDING',
    commands: [{ cli: 'echo', args: ['Task executed successfully'] }],
    dependencies: [],
    estimatedDuration: 5000,
  };
}
