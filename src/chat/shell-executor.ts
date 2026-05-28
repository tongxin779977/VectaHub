/**
 * 直接 Shell 命令执行器。
 * 作为最后回退手段，通过 `child_process.spawn` 执行系统命令。
 * @module chat/shell-executor
 */
import { spawn } from 'node:child_process';
import type { ChatOutput } from './types.js';

/**
 * 直接通过系统 shell 执行命令并捕获输出。
 * 当 `CommandExecutor` 和 `CommandBridge` 均不可用时使用此回退路径。
 *
 * @param command - 要执行的命令字符串
 * @returns 包含命令输出的 `ChatOutput`
 */
export function executeDirectShellCommand(command: string): Promise<ChatOutput> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(/\s+/);
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => resolve({ type: 'command-result', content: stdout || stderr, metadata: { exitCode: code ?? 0, stderr } }));
    child.on('error', err => resolve({ type: 'error', content: `Execution failed: ${err.message}` }));
  });
}
