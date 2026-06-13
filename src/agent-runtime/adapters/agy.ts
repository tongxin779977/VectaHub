import type { AgentAdapter, AgentAdapterInput, AgentAdapterOutput, AgentDescriptor } from '../../types/agent.js';

export class AgyAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'agy';
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
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
