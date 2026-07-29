import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ShellTokenizer } from '../../utils/shell-tokenizer.js';
import type { KnowledgeBase } from '../knowledge/knowledge-base.js';
import type { FailureHandler } from '../handler/failure-handler.js';

const execFileAsync = promisify(execFile);

export interface CommandExecutor {
  execute(input: string): Promise<string>;
}

interface CommandExecutionError extends Error {
  stderr?: string;
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
        await this.failureHandler.handle(parsed.fullCommand, result.error || 'Unknown error');
      }
      
      return result.success ? result.output : (result.error || 'Command execution failed');
    }
    
    const result = await this.runCommand(parsed.fullCommand);
    return result.success ? result.output : (result.error || 'Command execution failed');
  }

  private parseInput(input: string) {
    const tokens = ShellTokenizer.tokenize(input);
    return {
      command: tokens[0]?.cli ?? '',
      args: tokens[0]?.args ?? [],
      fullCommand: input.trim()
    };
  }

  private async runCommand(command: string): Promise<{ success: boolean; output: string; error?: string }> {
    const tokens = ShellTokenizer.tokenize(command);
    if (tokens.length > 1) {
      return {
        success: false,
        output: '',
        error: 'Multi-command pipelines are not supported'
      };
    }
    const token = tokens[0];
    if (!token) {
      return {
        success: false,
        output: '',
        error: 'No command found'
      };
    }
    try {
      const { stdout, stderr } = await execFileAsync(token.cli, token.args, { timeout: 30000 });
      return {
        success: true,
        output: stdout.trim() || stderr.trim()
      };
    } catch (error) {
      const commandError = error as CommandExecutionError;
      return {
        success: false,
        output: '',
        error: commandError.stderr?.trim() || commandError.message || 'Command execution failed'
      };
    }
  }
}
