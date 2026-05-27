import type { AgentAdapter, AgentAdapterInput, AgentAdapterOutput, AgentDescriptor } from '../../types/agent.js';

export class ClaudeAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'claude';
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
    if (input.descriptor.subcommand) {
      args.push(input.descriptor.subcommand);
    }
    if (input.descriptor.workingDirectoryArg) {
      args.push(input.descriptor.workingDirectoryArg, input.workspaceRoot);
    }
    if (input.descriptor.promptArgName) {
      args.push(input.descriptor.promptArgName, input.taskPrompt);
    } else {
      args.push(input.taskPrompt);
    }
    for (const flag of input.descriptor.nonInteractiveFlags) {
      args.push(flag);
    }
    return {
      command: input.descriptor.entryCommand,
      args,
      preview: [input.descriptor.entryCommand, ...args].join(' '),
    };
  }
}
