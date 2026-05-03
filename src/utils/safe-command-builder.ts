export class SafeCommandBuilder {
  protected command: string;
  protected args: string[] = [];

  constructor(command: string) {
    this.command = this.validateCommand(command);
  }

  addArg(arg: string): SafeCommandBuilder {
    const safeArg = this.escapeArg(arg);
    this.args.push(safeArg);
    return this;
  }

  addArgs(args: string[]): SafeCommandBuilder {
    args.forEach(arg => this.addArg(arg));
    return this;
  }

  build(): { command: string; args: string[] } {
    return {
      command: this.command,
      args: [...this.args],
    };
  }

  protected validateCommand(command: string): string {
    const allowedCommands = ['git', 'npm', 'node', 'ls', 'echo', 'cat'];
    if (!allowedCommands.includes(command)) {
      throw new Error('Command "' + command + '" is not allowed');
    }
    return command;
  }

  protected escapeArg(arg: string): string {
    return arg
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .replace(/&/g, '\\&')
      .replace(/\|/g, '\\|')
      .replace(/;/g, '\\;')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }
}
