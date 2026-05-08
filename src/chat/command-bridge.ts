import type { Command } from 'commander';

export class CommandBridge {
  private program: Command;

  constructor(program: Command) {
    this.program = program;
  }

  async execute(command: string): Promise<string> {
    const [cmdName, ...args] = command.trim().split(' ');
    const fullArgs = [this.program.name(), cmdName, ...args];

    let output = '';
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    // Helper to capture output
    const intercept = (chunk: any) => {
      output += chunk.toString();
      return true;
    };

    try {
      // Intercept streams
      (process.stdout as any).write = intercept;
      (process.stderr as any).write = intercept;

      // Execute command
      await this.program.parseAsync(fullArgs, { from: 'user' });

      return output.trim() || `✅ Command '${cmdName}' executed (no output).`;
    } catch (error: any) {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.help') {
        return output.trim();
      }
      if (error.code === 'commander.unknownCommand') {
        return `❌ Unknown command: ${cmdName}. Use '/cmd help' for a list of available commands.`;
      }
      const errorMessage = error.message || String(error);
      return (output + `\n❌ Error: ${errorMessage}`).trim();
    } finally {
      // Restore streams
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }
  }
}

export function createCommandBridge(program: Command): CommandBridge {
  return new CommandBridge(program);
}
