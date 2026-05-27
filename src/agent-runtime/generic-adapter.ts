import type { AgentDescriptor, AgentAdapter, AgentAdapterInput, AgentAdapterOutput } from '../types/agent.js';

/**
 * 通用 Agent 适配器
 * 用于将 Agent 描述符转换为命令行参数
 */
export class GenericAdapter implements AgentAdapter {
  constructor(private readonly descriptor: AgentDescriptor) {}

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

    return {
      command,
      args,
      stdinInput,
      preview: [command, ...args].join(' '),
    };
  }
}
