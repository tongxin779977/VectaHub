/**
 * 命令管理器。
 * 负责输入解析（自然语言 / Shell 命令 / 斜杠命令）和安全验证。
 * @module chat/command-manager
 */
import type { ChatConfig } from './config.js';
import type { ChatInput } from './types.js';

/**
 * 创建命令管理器实例。
 *
 * @param config - 聊天配置
 * @returns 包含 `parseInput` 和 `validateCommand` 方法的命令管理器
 */
export function createCommandManager(config: ChatConfig) {
  return {
    /**
     * 解析用户输入，判断输入类型并提取有效内容。
     *
     * @param input - 原始用户输入文本
     * @returns 解析后的 `ChatInput` 对象
     */
    parseInput(input: string): ChatInput {
      const trimmedInput = input.trim();

      if (trimmedInput.startsWith('/')) {
        const [commandName, ...args] = trimmedInput.slice(1).split(/\s+/);
        return {
          type: 'slash-command',
          raw: input,
          parsed: commandName,
          args,
        };
      }

      if (trimmedInput.startsWith('!')) {
        return {
          type: 'shell',
          raw: input,
          parsed: trimmedInput.slice(1),
        };
      }

      if (isShellCommand(trimmedInput)) {
        return {
          type: 'shell',
          raw: input,
          parsed: trimmedInput,
        };
      }

      return {
        type: 'nl',
        raw: input,
        parsed: trimmedInput,
      };
    },

    /**
     * 验证命令是否符合安全策略。
     *
     * @param command - 要验证的命令字符串
     * @returns 如果命令安全返回 `true`，否则返回 `false`
     */
    validateCommand(command: string): boolean {
      const blockedCommands = ['rm -rf /', 'sudo rm', 'mkfs', 'dd if='];
      return !blockedCommands.some(blocked => command.toLowerCase().includes(blocked));
    },
  };
}

/**
 * 判断输入是否为 Shell 命令。
 * 通过检查常见 Shell 命令前缀来识别。
 *
 * @param input - 待检测的输入文本
 * @returns 如果匹配 Shell 命令模式返回 `true`
 */
export function isShellCommand(input: string): boolean {
  const shellPrefixes = ['ls', 'cd', 'pwd', 'echo', 'grep', 'find', 'cat', 'git', 'npm', 'node', 'python', 'curl', 'wget', 'docker', 'kubectl'];
  const firstWord = input.split(/\s+/)[0].toLowerCase();
  return shellPrefixes.includes(firstWord);
}
