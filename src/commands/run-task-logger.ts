import type { RunTaskOutputEntry, VerificationResult } from './run-task-shared.js';
import {
  getContext,
  getRunTaskOutputDirCandidates,
  listRunTaskOutputEntries,
  getRunTaskFailureLogRetentionCutoff,
  ensureRunTaskOutputDir,
  RunTaskLogCleanupResult
} from './run-task-shared.js';

export const NOISY_OUTPUT_PATTERNS = [
  /YOLO mode is enabled\..*/i,
  /Warning: 256-color support not detected\..*/i,
  /Ripgrep is not available\..*/i,
  /\(node:\d+\).*DeprecationWarning.*/i,
  /Attempt \d+ failed\..*/i,
  /\s+at\s.+/i,
  /.*_GaxiosError:.*/i,
  /.*FetchError\d*:.*/i,
  /\s*(config|response|error):\s*\{.*/i,
  /xterm\.js:\s*parsing error.*/i,
];

export const TRACE_TEXT_MAX_LENGTH = 500;

export async function cleanRunTaskLogs(options?: { olderThanMs?: number }): Promise<RunTaskLogCleanupResult> {
  let removedFiles = 0;

  for (const outputDir of getRunTaskOutputDirCandidates()) {
    if (!getContext().environment.exists(outputDir)) {
      continue;
    }

    const removableEntries = listRunTaskOutputEntries(outputDir)
      .filter((entry: RunTaskOutputEntry) => options?.olderThanMs === undefined || entry.timestamp < options.olderThanMs);

    for (const entry of removableEntries) {
      getContext().environment.rm(entry.path, { force: true });
      removedFiles += 1;
    }
  }

  return { removedFiles };
}

export async function pruneExpiredRunTaskLogs(): Promise<RunTaskLogCleanupResult> {
  return cleanRunTaskLogs({
    olderThanMs: getRunTaskFailureLogRetentionCutoff(),
  });
}

export async function persistRunTaskFailureLogs(taskId: string, output: { stdout?: string; stderr?: string }): Promise<void> {
  const stdout = output.stdout ?? '';
  const stderr = output.stderr ?? '';
  if (!stdout && !stderr) {
    return;
  }

  const outputDir = await ensureRunTaskOutputDir();
  const timestamp = Date.now();
  if (stdout) {
    const stdoutPath = getContext().environment.resolvePath(outputDir, `${taskId}-${timestamp}.stdout`);
    getContext().environment.writeFile(stdoutPath, stdout);
  }
  if (stderr) {
    const stderrPath = getContext().environment.resolvePath(outputDir, `${taskId}-${timestamp}.stderr`);
    getContext().environment.writeFile(stderrPath, stderr);
  }
}

export function detectAgentExecutionOutcome(output: string): 'implemented' | 'planned_only' {
  const text = output.toLowerCase();
  const plannedOnlySignals = [
    '暂不执行修改',
    '先给出实施计划',
    '先给出实现计划',
    '按 agents.md 要求，我先给出实施计划',
    '如果你确认这个方案',
    '下一条就给出逐文件精确补丁',
    'not executing changes yet',
    'i will first provide a plan',
  ];

  if (plannedOnlySignals.some(signal => text.includes(signal.toLowerCase()))) {
    return 'planned_only';
  }
  return 'implemented';
}

export function detectAgentTaskAlreadySatisfied(output: string): boolean {
  const text = output.toLowerCase();
  const satisfiedSignals = [
    '已经满足',
    '已满足',
    '已覆盖',
    '无需修改',
    '不需要修改',
    'already satisfies',
    'already satisfied',
    'no changes needed',
    'no modification needed',
    '验证结果',
    '验证已运行完成',
    '退出码 `0`',
    '退出码 0',
    'validation passed',
    'exit code 0',
  ];
  const blockerSignals = [
    '无法完成',
    '不能在不越界',
    '超出本任务边界',
    'blocked',
    'cannot complete',
    'would need changes outside',
  ];

  return satisfiedSignals.some(signal => text.includes(signal.toLowerCase()))
    && !blockerSignals.some(signal => text.includes(signal.toLowerCase()));
}

export function isUnclosedExecutionFailure(input: {
  success: boolean;
  gitChanges?: { changedFiles: string[] };
  verification?: VerificationResult;
}): boolean {
  const changedFileCount = input.gitChanges?.changedFiles.length ?? 0;
  return !input.success && changedFileCount > 0 && input.verification === undefined;
}

export function classifyAgentFailureCode(error: unknown, output: string): 'TIMEOUT' | 'AGENT_SYSTEM_ERROR' | 'AGENT_CONFIG_ERROR' | 'AGENT_FAILED' {
  const execError = error as { code?: string | number; message?: string };
  const text = `${execError?.message || ''}\n${output}`.toLowerCase();

  if (execError?.code === 'TIMEOUT' || text.includes('timeout') || text.includes('timed out') || text.includes('超时')) {
    return 'TIMEOUT';
  }

  if ([
    'io error',
    'operation not permitted',
    'stream disconnected before completion',
    'failed to connect to websocket',
    'readonly database',
    'read only database',
    'attempt to write a readonly database',
    'eperm',
    'emfile',
    'enfile',
  ].some(keyword => text.includes(keyword))) {
    return 'AGENT_SYSTEM_ERROR';
  }

  if ([
    'permission denied',
    'no such file',
    'path does not exist',
    'enoent',
    'eacces',
    'not found',
    '未安装',
    '未配置',
  ].some(keyword => text.includes(keyword))) {
    return 'AGENT_CONFIG_ERROR';
  }

  return 'AGENT_FAILED';
}

export function detectAgentSoftSystemFailure(output: string, gitChanges?: { changedFiles: string[] }): string | null {
  if (gitChanges?.changedFiles.length) {
    return null;
  }

  const text = output.toLowerCase();
  const directFailureSignals = [
    '受当前环境限制，任务未能执行代码修改',
    '受当前环境限制',
    '未能执行代码修改',
    '无法执行代码修改',
    '无法落盘修改',
    '未做代码改动',
    '无法修改文件',
    '实际修改文件：无',
    '本次实际修改文件：无',
    '本地命令工具无法启动',
    '本地命令/文件访问工具不可用',
    '文件访问工具不可用',
    '当前被环境阻塞',
    '当前被执行环境阻塞',
    '任务未落地，当前被执行环境阻塞',
    '当前任务被工具层阻断',
    '工具层阻断',
    '本地命令入口不可用',
    'unable to execute code changes',
    'unable to make code changes',
    'could not execute code changes',
  ];
  const environmentSignals = [
    '本地命令工具无法启动',
    '本地命令/文件访问工具不可用',
    '文件访问工具不可用',
    '当前被环境阻塞',
    '当前被执行环境阻塞',
    '任务未落地，当前被执行环境阻塞',
    '当前任务被工具层阻断',
    '工具层阻断',
    '本地命令入口不可用',
    'sandbox-exec: sandbox_apply',
    'sandbox_apply: operation not permitted',
    'sandbox: read-only',
    'operation not permitted',
    'read-only',
    'read only',
  ];
  const noChangeSignals = [
    '未执行代码修改',
    '未能执行代码修改',
    '无法执行代码修改',
    '无法落盘修改',
    '无法修改代码',
    '未做代码改动',
    '未做代码修改',
    '未改代码',
    '无法修改文件',
    '实际修改文件：无',
    '本次实际修改文件：无',
    '任务未落地',
    'unable to execute code changes',
    'unable to make code changes',
    'could not execute code changes',
  ];
  const readBlockedSignals = [
    '无法进入工作区',
    '无法打开仓库文件',
    '无法读取仓库代码',
    '无法读取代码',
    '无法读取现有代码',
    '无法读取仓库与文档',
    '无法读取',
  ];
  const verificationSkippedSignals = [
    '未执行验证',
    '验证未执行',
  ];

  const hasEnvironmentBlock = environmentSignals.some(signal => text.includes(signal.toLowerCase()));
  const hasNoChangeSignal = noChangeSignals.some(signal => text.includes(signal.toLowerCase()));
  const hasReadBlockedSignal = readBlockedSignals.some(signal => text.includes(signal.toLowerCase()));
  const hasVerificationSkippedSignal = verificationSkippedSignals.some(signal => text.includes(signal.toLowerCase()));

  const matched = directFailureSignals.some(signal => text.includes(signal.toLowerCase()))
    || (hasEnvironmentBlock && (hasNoChangeSignal || hasReadBlockedSignal || hasVerificationSkippedSignal));

  return matched ? 'Agent 输出表明当前环境限制阻止了代码修改' : null;
}
