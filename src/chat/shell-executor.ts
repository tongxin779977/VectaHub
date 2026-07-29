/**
 * 直接 Shell 命令执行器。
 * 作为最后回退手段，通过 `child_process.spawn` 执行系统命令。
 * 支持可配置的执行超时控制，防止命令执行时间过长。
 * @module chat/shell-executor
 */
import { spawn } from 'node:child_process';
import type { ChatOutput } from './types.js';
import { ShellTokenizer } from '../utils/shell-tokenizer.js';

/** 默认命令执行超时时间（毫秒），30 秒 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Shell 执行器配置选项。
 */
export interface ShellExecutorOptions {
  /** 执行超时时间（毫秒），默认 30000 */
  timeoutMs?: number;
}

/**
 * 直接通过系统 shell 执行命令并捕获输出。
 * 当 `CommandExecutor` 和 `CommandBridge` 均不可用时使用此回退路径。
 *
 * 支持超时控制：超过指定时间后子进程将被终止，返回超时错误。
 *
 * @param command - 要执行的命令字符串
 * @param options - 可选的执行配置
 * @returns 包含命令输出的 `ChatOutput`
 *
 * @example
 * ```ts
 * const output = await executeDirectShellCommand('ls -la', { timeoutMs: 5000 });
 * ```
 */
export function executeDirectShellCommand(command: string, options?: ShellExecutorOptions): Promise<ChatOutput> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const tokens = ShellTokenizer.tokenize(command);
    if (tokens.length === 0) {
      resolve({ type: 'error', content: '❌ 空命令' });
      return;
    }
    if (tokens.length > 1) {
      resolve({ type: 'error', content: '❌ 多命令管道在 shell:false 模式下不受支持' });
      return;
    }
    const cmd = tokens[0].cli;
    const args = tokens[0].args ?? [];
    const child = spawn(cmd, args, { signal: AbortSignal.timeout(timeoutMs) });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (output: ChatOutput) => {
      if (settled) return;
      settled = true;
      resolve(output);
    };

    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        settle({
          type: 'error',
          content: `❌ 命令执行超时（${timeoutMs}ms）: ${command}`,
          metadata: { exitCode: -1, stderr: `Process killed with signal ${signal}` },
        });
        return;
      }
      settle({
        type: 'command-result',
        content: stdout || stderr,
        metadata: { exitCode: code ?? 0, stderr },
      });
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
        settle({
          type: 'error',
          content: `❌ 命令执行超时（${timeoutMs}ms）: ${command}`,
          metadata: { exitCode: -1 },
        });
        return;
      }
      settle({ type: 'error', content: `Execution failed: ${err.message}` });
    });
  });
}
