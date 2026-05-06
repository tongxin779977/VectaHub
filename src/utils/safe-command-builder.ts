export class SafeCommandBuilder {
  protected command: string;
  protected args: string[] = [];

  private static readonly ALLOWED_COMMANDS = ['git', 'npm', 'node', 'ls', 'echo', 'cat'];

  private static readonly DANGEROUS_ARG_PATTERNS = [
    /--exec/,
    /-e\s*/,
    /--command/,
    /--eval/,
    /\|/,
    /;/,
    /\$\(.*\)/,
    /`.*`/,
  ];

  private static readonly COMMAND_ARG_RESTRICTIONS: Record<string, {
    maxArgs?: number;
    maxArgLength?: number;
    allowedFlags?: string[];
    blockedFlags?: string[];
  }> = {
    git: {
      maxArgs: 20,
      maxArgLength: 500,
      blockedFlags: ['--exec', '--command', '-c'],
    },
    npm: {
      maxArgs: 10,
      maxArgLength: 200,
    },
    node: {
      maxArgs: 10,
      maxArgLength: 500,
      blockedFlags: ['-e', '--eval'],
    },
    ls: {
      maxArgs: 5,
      maxArgLength: 100,
    },
    echo: {
      maxArgs: 10,
      maxArgLength: 1000,
    },
    cat: {
      maxArgs: 10,
      maxArgLength: 500,
    },
  };

  constructor(command: string) {
    this.command = this.validateCommand(command);
  }

  addArg(arg: string): SafeCommandBuilder {
    const safeArg = this.validateAndEscapeArg(arg);
    this.args.push(safeArg);
    this.validateArgCount();
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
    const cmd = command.trim().toLowerCase();
    if (!SafeCommandBuilder.ALLOWED_COMMANDS.includes(cmd)) {
      throw new Error(`Command "${command}" is not allowed`);
    }
    return cmd;
  }

  protected validateArgCount(): void {
    const restrictions = SafeCommandBuilder.COMMAND_ARG_RESTRICTIONS[this.command];
    if (restrictions?.maxArgs && this.args.length > restrictions.maxArgs) {
      throw new Error(`Too many arguments for command "${this.command}" (max ${restrictions.maxArgs})`);
    }
  }

  protected validateAndEscapeArg(arg: string): string {
    const trimmedArg = arg.trim();
    
    if (!trimmedArg) {
      throw new Error('Empty argument is not allowed');
    }

    const restrictions = SafeCommandBuilder.COMMAND_ARG_RESTRICTIONS[this.command];
    
    if (restrictions?.maxArgLength && trimmedArg.length > restrictions.maxArgLength) {
      throw new Error(`Argument exceeds maximum length (max ${restrictions.maxArgLength} chars)`);
    }

    for (const pattern of SafeCommandBuilder.DANGEROUS_ARG_PATTERNS) {
      if (pattern.test(trimmedArg)) {
        throw new Error(`Argument contains dangerous pattern: "${trimmedArg}"`);
      }
    }

    if (restrictions?.blockedFlags) {
      for (const flag of restrictions.blockedFlags) {
        if (trimmedArg === flag || trimmedArg.startsWith(flag + '=')) {
          throw new Error(`Flag "${flag}" is not allowed for command "${this.command}"`);
        }
      }
    }

    return this.escapeArg(trimmedArg);
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