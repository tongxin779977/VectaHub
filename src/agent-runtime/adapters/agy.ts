import type { AgentAdapter, AgentAdapterInput, AgentAdapterOutput, AgentDescriptor } from '../../types/agent.js';

export class AgyAdapter implements AgentAdapter {
  supports(descriptor: AgentDescriptor): boolean {
    return descriptor.id === 'agy';
  }

  getExecutionTimeoutMs(): number {
    return 300000; // 5 minutes default timeout for agy agent review tasks
  }

  render(input: AgentAdapterInput): AgentAdapterOutput {
    const args: string[] = [];
    
    // Append a Chinese output hint if not explicitly requested in English
    let taskPrompt = input.taskPrompt;
    if (!taskPrompt.toLowerCase().includes('in english') && !taskPrompt.includes('用英文')) {
      taskPrompt += ' (Please perform all planning, thinking, tool usage explanations, and outputs in Chinese. 请使用中文进行所有的规划、思考、工具调用解释以及最终的内容输出。)';
    }

    if (input.descriptor.promptArgName) {
      args.push(input.descriptor.promptArgName, taskPrompt);
    } else {
      args.push(taskPrompt);
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

