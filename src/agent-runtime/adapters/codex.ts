import type { AgentAdapter, AgentAdapterInput, AgentAdapterOutput, AgentDescriptor } from '../../types/agent.js';

export class CodexAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'codex';
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
    if (input.descriptor.subcommand) {
      args.push(input.descriptor.subcommand);
    }
    if (input.descriptor.workingDirectoryArg) {
      args.push(input.descriptor.workingDirectoryArg, input.workspaceRoot);
    }
    for (const flag of input.descriptor.nonInteractiveFlags) {
      args.push(flag);
    }
    args.push(input.taskPrompt);
    return {
      command: input.descriptor.entryCommand,
      args,
      preview: [input.descriptor.entryCommand, ...args].join(' '),
    };
  }
}
