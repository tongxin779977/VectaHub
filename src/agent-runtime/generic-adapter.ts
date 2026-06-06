import type { AgentDescriptor, AgentAdapter, AgentAdapterInput, AgentAdapterOutput } from '../types/agent.js';

/**
 * 通用适配器配置选项
 */
export interface GenericAdapterOptions {
  /** 命令执行超时时间（毫秒），默认 120000（2 分钟） */
  executionTimeoutMs?: number;
}

/**
 * 通用 Agent 适配器
 * 用于将 Agent 描述符转换为命令行参数，支持命令执行超时控制
 */
export class GenericAdapter implements AgentAdapter {
  private readonly executionTimeoutMs: number;

  constructor(
    private readonly descriptor: AgentDescriptor,
    options?: GenericAdapterOptions,
  ) {
    this.executionTimeoutMs = options?.executionTimeoutMs ?? 120000;
  }

  /**
   * 检查是否支持给定的描述符
   * @param descriptor Agent 描述符
   * @returns 是否支持
   */
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === this.descriptor.id;
  }

  /**
   * 渲染命令行参数
   * @param input 适配器输入
   * @returns 适配器输出（包含命令、参数、标准输入等）
   */
  render(input: AgentAdapterInput): AgentAdapterOutput {
    const { descriptor, taskPrompt, workspaceRoot, outputLastMessagePath } = input;
    const args: string[] = [];

    if (descriptor.subcommand) {
      args.push(descriptor.subcommand);
    }

    if (descriptor.workingDirectoryArg) {
      args.push(descriptor.workingDirectoryArg, workspaceRoot);
    }

    if (descriptor.promptTransport === 'arg' && descriptor.promptArgName) {
      args.push(descriptor.promptArgName, taskPrompt);
    } else if (descriptor.promptTransport === 'positional') {
      args.push(taskPrompt);
    }

    for (const flag of descriptor.nonInteractiveFlags) {
      args.push(flag);
    }

    if (outputLastMessagePath && descriptor.id === 'codex') {
      args.push('--output-last-message', outputLastMessagePath);
    }

    if (descriptor.promptTransport === 'stdin') {
      args.push('-');
    }

    const command = descriptor.entryCommand;
    const stdinInput = descriptor.promptTransport === 'stdin' ? taskPrompt : undefined;

    const envPatch: Record<string, string> = {
      VECTAHUB_EXEC_TIMEOUT_MS: String(this.executionTimeoutMs),
    };

    return {
      command,
      args,
      stdinInput,
      envPatch,
      preview: [command, ...args].join(' '),
    };
  }

  /**
   * 获取配置的命令执行超时时间
   * @returns 超时时间（毫秒）
   */
  getExecutionTimeoutMs(): number {
    return this.executionTimeoutMs;
  }
}
