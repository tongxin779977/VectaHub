import type { Command } from 'commander';

type StreamWrite = NodeJS.WriteStream['write'];
type WriteCallback = (error?: Error | null) => void;

function isCommanderError(error: unknown): error is { code?: string; message?: string } {
  return typeof error === 'object' && error !== null;
}

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

    const intercept = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback) => {
      output += typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk).toString(typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined);
      const resolvedCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      resolvedCallback?.();
      return true;
    }) as StreamWrite;

    try {
      // Intercept streams
      process.stdout.write = intercept;
      process.stderr.write = intercept;

      // Execute command
      await this.program.parseAsync(fullArgs, { from: 'user' });

      return output.trim() || `✅ Command '${cmdName}' executed (no output).`;
    } catch (error) {
      if (!isCommanderError(error)) {
        return (output + `\n❌ Error: ${String(error)}`).trim();
      }
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
