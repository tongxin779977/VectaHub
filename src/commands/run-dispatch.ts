import type { TaskContract } from '../types/task-contract.js';
import { resolveTaskContractCommand } from '../nl/task-contract-strategy.js';

export type RunDispatchKind =
  | 'direct-command'
  | 'workflow'
  | 'agent-task'
  | 'doc-task-edit'
  | 'dialog'
  | 'clarify'
  | 'blocked';

export interface RunDispatchInput {
  text: string;
  steps: Array<{ cli?: string; args?: string[] }>;
  reply?: string;
  taskContract?: TaskContract;
}

export interface RunDispatchResult {
  kind: RunDispatchKind;
  executable: boolean;
  reason: string;
  suggestedAction?: string;
  nextCommand?: string;
  blockedStep?: {
    cli: string;
    args: string[];
  };
}

const DIRECT_LOCAL_CLIS = new Set(['git', 'npm', 'node', 'yarn', 'npx', 'echo', 'ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'sort']);
const VECTAHUB_COMMANDS = new Set([
  'run',
  'doctor',
  'serve',
  'client',
  'security',
  'audit',
  'tools',
  'list',
  'mode',
  'history',
  'detail',
  'rerun',
  'resume',
  'archive',
  'run-command',
  'generate',
  'schedule',
  'daemon',
  'templates',
  'rollback',
  'verify',
  'chat',
  'monitor',
  'debug',
  'export',
  'import',
  'vscode',
  'parse-doc',
  'run-task',
  'run-task-clean-logs',
  'trace',
  'doc-task-runs',
  'recover-task',
  'queue',
  'setup',
  'config',
  'completion',
  'version',
]);

const DOC_TASK_PATTERNS = [
  /docs\/[^\s]+\.md/i,
  /追加.*task/i,
  /追加.*任务/i,
  /生成.*任务.*文档/i,
  /更新.*文档/i,
  /补充.*文档/i,
  /整理.*文档/i,
  /append.*task/i,
  /generate.*task.*doc/i,
  /update.*doc/i,
];

const AGENT_TASK_PATTERNS = [
  /修复|实现|重构|补强|开发|修改代码|代码修改/i,
  /fix|implement|refactor|harden|code change/i,
];

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isDocTaskEdit(text: string): boolean {
  return DOC_TASK_PATTERNS.some(pattern => pattern.test(text));
}

function isAgentTask(text: string): boolean {
  return AGENT_TASK_PATTERNS.some(pattern => pattern.test(text));
}

function validateStep(step: { cli?: string; args?: string[] }): RunDispatchResult | null {
  const cli = step.cli?.trim() ?? '';
  const args = step.args ?? [];

  if (!cli) {
    return {
      kind: 'blocked',
      executable: false,
      reason: 'generated step is missing cli',
      suggestedAction: '请重新描述任务，或使用更明确的命令。',
      blockedStep: { cli, args },
    };
  }

  if (cli === 'vectahub') {
    const subcommand = args[0];
    if (!subcommand || !VECTAHUB_COMMANDS.has(subcommand)) {
      return {
        kind: 'blocked',
        executable: false,
        reason: `generated VectaHub command is not registered: vectahub ${args.join(' ')}`.trim(),
        suggestedAction: '该意图路由生成了当前 CLI 不存在的命令，应回退到任务分诊或文档/Agent 任务体系。',
        blockedStep: { cli, args },
      };
    }
  }

  return null;
}

function validateTaskContractExecution(
  taskContract: Extract<TaskContract, { kind: 'execute' }>,
): RunDispatchResult | null {
  const resolvedCommand = resolveTaskContractCommand(taskContract);
  if (!resolvedCommand) {
    return {
      kind: 'blocked',
      executable: false,
      reason: 'task contract execute strategy is missing a valid command surface id',
      suggestedAction: '请补充可解析的 commandSurfaceId，或回退到澄清/任务分诊路径。',
    };
  }

  return validateStep({
    cli: resolvedCommand.cli,
    args: resolvedCommand.args,
  });
}

export function createRunDispatch(input: RunDispatchInput): RunDispatchResult {
  const text = input.text.trim();
  const taskContract = input.taskContract;

  if (input.steps.length === 0 && taskContract?.kind === 'execute' && taskContract.executionStrategy.mode === 'agent-runtime') {
    return {
      kind: 'agent-task',
      executable: false,
      reason: 'task contract requires agent-runtime execution',
      suggestedAction: '请进入 Agent runtime 或生成任务合同后执行',
    };
  }

  if (isDocTaskEdit(text)) {
    return {
      kind: 'doc-task-edit',
      executable: false,
      reason: 'document task edit requires a document-aware task system instead of direct workflow execution',
      suggestedAction: '建议由 run 进入文档任务体系：先生成可读任务合同，再交给 run-task 或 Agent CLI 执行。',
      nextCommand: `npx tsx src/cli.ts run --dry-run ${quoteForShell(text)}`,
    };
  }

  if (isAgentTask(text) && input.steps.length === 0) {
    return {
      kind: 'agent-task',
      executable: false,
      reason: 'agent task requires an Agent runtime contract before execution',
      suggestedAction: '建议生成任务文档或选择 Agent CLI 后执行。',
      nextCommand: `npx tsx src/cli.ts run --dry-run ${quoteForShell(text)}`,
    };
  }

  if (input.steps.length === 0) {
    if (taskContract?.kind === 'execute') {
      const blocked = validateTaskContractExecution(taskContract);
      if (blocked) {
        return blocked;
      }

      switch (taskContract.executionStrategy.mode) {
        case 'direct-command':
          return {
            kind: 'direct-command',
            executable: true,
            reason: 'task contract resolved to direct-command execution strategy',
          };
        case 'capability':
          return {
            kind: 'workflow',
            executable: true,
            reason: 'task contract resolved to capability execution strategy',
          };
        case 'workflow-draft':
          return {
            kind: 'workflow',
            executable: true,
            reason: 'task contract resolved to workflow-draft execution strategy',
          };
      }
    }

    if (taskContract?.kind === 'blocked') {
      return {
        kind: 'blocked',
        executable: false,
        reason: taskContract.reason,
      };
    }

    if (taskContract?.kind === 'clarify') {
      return {
        kind: 'clarify',
        executable: false,
        reason: taskContract.question,
      };
    }

    if (taskContract?.kind === 'reply') {
      return {
        kind: 'dialog',
        executable: false,
        reason: `task contract resolved to ${taskContract.replyMode}`,
      };
    }

    return {
      kind: input.reply ? 'dialog' : 'clarify',
      executable: false,
      reason: input.reply ? 'LLM produced a direct reply without executable steps' : 'no executable task was produced',
    };
  }

  for (const step of input.steps) {
    const blocked = validateStep(step);
    if (blocked) {
      return blocked;
    }
  }

  const allDirect = input.steps.every(step => DIRECT_LOCAL_CLIS.has(step.cli ?? ''));
  return {
    kind: allDirect ? 'direct-command' : 'workflow',
    executable: true,
    reason: allDirect ? 'all generated steps are direct local commands' : 'generated steps require workflow execution',
  };
}

export function formatRunDispatchText(result: RunDispatchResult): string {
  const lines = [
    '任务分诊结果',
    `类型：${result.kind}`,
    `是否直接执行：${result.executable ? '是' : '否'}`,
    `原因：${result.reason}`,
  ];

  if (result.blockedStep) {
    lines.push(`被拦截命令：${result.blockedStep.cli} ${result.blockedStep.args.join(' ')}`.trim());
  }

  if (result.suggestedAction) {
    lines.push(`建议：${result.suggestedAction}`);
  }

  lines.push(`下一步命令：${result.nextCommand ?? '暂无可自动执行的下一步命令'}`);

  return lines.join('\n');
}
