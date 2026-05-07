import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { KnowledgeBase } from '../knowledge/knowledge-base.js';
import type { FailureHandler } from '../handler/failure-handler.js';

const execAsync = promisify(exec);

export interface CommandExecutor {
  execute(input: string): Promise<string>;
}

export function createCommandExecutor(
  knowledgeBase: KnowledgeBase,
  failureHandler: FailureHandler
): CommandExecutor {
  return new CommandExecutorImpl(knowledgeBase, failureHandler);
}

class CommandExecutorImpl implements CommandExecutor {
  constructor(
    private knowledgeBase: KnowledgeBase,
    private failureHandler: FailureHandler
  ) {}

  async execute(input: string): Promise<string> {
    const parsed = this.parseInput(input);
    
    const cmdInfo = this.knowledgeBase.getCommand(parsed.command);
    if (!cmdInfo) {
      const result = await this.runCommand(parsed.fullCommand);
      
      if (!result.success) {
        await this.failureHandler.handle(parsed.fullCommand, result.error);
      }
      
      return result.success ? result.output : result.error;
    }
    
    const result = await this.runCommand(parsed.fullCommand);
    return result.success ? result.output : result.error;
  }

  private parseInput(input: string) {
    const parts = input.trim().split(' ');
    return {
      command: parts[0],
      args: parts.slice(1),
      fullCommand: input.trim()
    };
  }

  private async runCommand(command: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const { stdout, stderr } = await execAsync(command);
      return {
        success: true,
        output: stdout.trim() || stderr.trim()
      };
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: err.stderr?.trim() || err.message || 'Command execution failed'
      };
    }
  }
}