import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CommandValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  checkedAt: number;
}

export interface CommandValidator {
  validate(cli: string, args?: string[]): Promise<CommandValidationResult>;
  checkCommandExists(cli: string): Promise<boolean>;
  validateArgs(cli: string, args: string[]): Promise<string[]>;
}

interface CommandInfo {
  name: string;
  path?: string;
  exists: boolean;
  type: 'builtin' | 'external' | 'alias' | 'function';
}

const BUILTIN_COMMANDS = new Set([
  'cd', 'ls', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'cat', 'echo',
  'pwd', 'cd', 'exit', 'export', 'source', 'alias', 'unalias', 'set',
  'unset', 'read', 'printf', 'test', 'true', 'false', 'continue', 'break',
]);

const DANGEROUS_FLAGS: Record<string, string[]> = {
  rm: ['-rf /', '-rf /*', '--no-preserve-root'],
  chmod: ['777', '000'],
  chown: ['root:', '-R root'],
  dd: ['of=/dev/sda', 'of=/dev/sdb'],
  mkfs: ['-f /dev/sda'],
  fdisk: ['/dev/sda'],
};

const RECOMMENDED_FLAGS: Record<string, string[]> = {
  rm: ['-i'],
  cp: ['-i', '-p'],
  mv: ['-i'],
  chmod: ['-v'],
};

function createCommandValidator(): CommandValidator {
  const commandCache = new Map<string, CommandInfo>();

  async function checkCommandExists(cli: string): Promise<boolean> {
    if (commandCache.has(cli)) {
      return commandCache.get(cli)!.exists;
    }

    if (BUILTIN_COMMANDS.has(cli)) {
      const info: CommandInfo = {
        name: cli,
        exists: true,
        type: 'builtin',
      };
      commandCache.set(cli, info);
      return true;
    }

    try {
      const { stdout } = await execAsync(`command -v ${cli}`, { timeout: 1000 });
      const info: CommandInfo = {
        name: cli,
        path: stdout.trim(),
        exists: true,
        type: stdout.includes('/') ? 'external' : 'alias',
      };
      commandCache.set(cli, info);
      return true;
    } catch {
      const info: CommandInfo = {
        name: cli,
        exists: false,
        type: 'external',
      };
      commandCache.set(cli, info);
      return false;
    }
  }

  async function validateArgs(cli: string, args: string[]): Promise<string[]> {
    const errors: string[] = [];

    const dangerousCombos = DANGEROUS_FLAGS[cli];
    if (dangerousCombos) {
      const fullCommand = [cli, ...args].join(' ');
      for (const dangerous of dangerousCombos) {
        if (fullCommand.includes(dangerous)) {
          errors.push(`⚠️ 危险操作: '${dangerous}' 被检测到`);
        }
      }
    }

    if (cli === 'rm' && !args.some(arg => arg.startsWith('-'))) {
      errors.push('💡 建议: 使用 rm -i 避免意外删除');
    }

    if (cli === 'find' && args.includes('-name') && !args.includes('-type')) {
      errors.push('💡 建议: 配合 -type 使用 find 命令');
    }

    return errors;
  }

  async function validate(cli: string, args: string[] = []): Promise<CommandValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    const exists = await checkCommandExists(cli);
    if (!exists) {
      errors.push(`❌ 命令 '${cli}' 不存在或不可用`);
    }

    const argErrors = await validateArgs(cli, args);
    warnings.push(...argErrors);

    const recommended = RECOMMENDED_FLAGS[cli];
    if (recommended && exists) {
      const hasRecommended = args.some(arg =>
        recommended.some(rec => arg.includes(rec))
      );
      if (!hasRecommended) {
        suggestions.push(`💡 建议: ${cli} 建议使用 ${recommended.join(' 或 ')}`);
      }
    }

    return {
      valid: exists && errors.length === 0,
      errors,
      warnings,
      suggestions,
      checkedAt: Date.now(),
    };
  }

  return {
    validate,
    checkCommandExists,
    validateArgs,
  };
}

export const commandValidator = createCommandValidator();

export interface SynthesizedCommand {
  cli: string;
  args: string[];
  fullCommand: string;
  validation?: CommandValidationResult;
}

export interface CommandSynthesizer {
  synthesize(commands: { cli: string; args: string[] }[]): SynthesizedCommand[];
  validateAll(commands: SynthesizedCommand[]): Promise<SynthesizedCommand[]>;
}

function createCommandSynthesizer(): CommandSynthesizer {
  function synthesize(commands: { cli: string; args: string[] }[]): SynthesizedCommand[] {
    return commands.map(cmd => ({
      ...cmd,
      fullCommand: `${cmd.cli} ${cmd.args.join(' ')}`.trim(),
    }));
  }

  async function validateAll(commands: SynthesizedCommand[]): Promise<SynthesizedCommand[]> {
    const validated: SynthesizedCommand[] = [];

    for (const cmd of commands) {
      const validation = await commandValidator.validate(cmd.cli, cmd.args);
      validated.push({
        ...cmd,
        validation,
      });
    }

    return validated;
  }

  return {
    synthesize,
    validateAll,
  };
}

export const commandSynthesizer = createCommandSynthesizer();

export function createSafeCommandExecutor() {
  return {
    async execute(cli: string, args: string[]): Promise<{
      success: boolean;
      output: string;
      error?: string;
      validation?: CommandValidationResult;
    }> {
      const validation = await commandValidator.validate(cli, args);

      if (!validation.valid) {
        return {
          success: false,
          output: '',
          error: validation.errors.join('\n'),
          validation,
        };
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️ 命令验证警告:');
        validation.warnings.forEach(w => console.warn(`  ${w}`));
      }

      try {
        const { stdout, stderr } = await execAsync(`${cli} ${args.join(' ')}`, {
          timeout: 30000,
        });

        return {
          success: true,
          output: stdout + stderr,
          validation,
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: error instanceof Error ? error.message : String(error),
          validation,
        };
      }
    },
  };
}
