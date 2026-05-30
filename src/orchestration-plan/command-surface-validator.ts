import type { CommandInvocation } from '../types/orchestration-plan.js';

// List of valid vectahub commands (from cli-command-registry and cli-main)
const VALID_VECTAHUB_COMMANDS = new Set([
  'version',
  'setup',
  'config',
  'completion',
  'run',
  'doctor',
  'chat',
  'serve',
  'client',
  'security',
  'audit',
  'tools',
  'list',
  'mode',
  'history',
  'detail',
  'rerun',
  'resume',
  'archive',
  'run-command',
  'generate',
  'schedule',
  'daemon',
  'templates',
  'rollback',
  'verify',
  'monitor',
  'debug',
  'export',
  'import',
  'vscode',
  'parse-doc',
  'run-task',
  'run-task-clean-logs',
  'doc-task-runs',
  'recover-task',
  'trace',
  'queue',
  'provider',
  'dev',
  // Config subcommands
  'show',
  'reset',
  'tools',
  // Dev subcommands
  'status',
  'module',
  'validate',
  'test',
  'build',
]);

// Config subcommands
const CONFIG_SUBCOMMANDS = new Set(['show', 'reset', 'tools']);

// Dev subcommands
const DEV_SUBCOMMANDS = new Set(['status', 'module', 'validate', 'test', 'build']);

// Commands that have subcommands
const COMMANDS_WITH_SUBCOMMANDS = new Map<string, Set<string>>([
  ['config', CONFIG_SUBCOMMANDS],
  ['dev', DEV_SUBCOMMANDS],
]);

export interface CommandSurfaceValidationError {
  code: string;
  message: string;
  path: string[];
}

export interface CommandSurfaceValidationResult {
  valid: boolean;
  errors: CommandSurfaceValidationError[];
}

/**
 * Validate that a command's arguments are an array of strings, not a single shell string.
 * This prevents injection of unparsed shell commands.
 */
function validateArgsArray(
  args: unknown,
  path: string[],
): CommandSurfaceValidationError[] {
  const errors: CommandSurfaceValidationError[] = [];

  if (!Array.isArray(args)) {
    errors.push({
      code: 'invalid_args_type',
      message: 'Command args must be an array of strings, not a single shell string',
      path: [...path, 'args'],
    });
    return errors;
  }

  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] !== 'string') {
      errors.push({
        code: 'invalid_arg_type',
        message: `Command arg at index ${i} must be a string`,
        path: [...path, 'args', String(i)],
      });
    }
  }

  return errors;
}

/**
 * Validate that a vectahub command name is valid and registered.
 */
function validateVectahubCommand(
  cli: string,
  args: string[],
  path: string[],
): CommandSurfaceValidationError[] {
  const errors: CommandSurfaceValidationError[] = [];

  // Check if the command itself is valid
  if (!VALID_VECTAHUB_COMMANDS.has(cli)) {
    errors.push({
      code: 'unknown_command',
      message: `Unknown vectahub command: "${cli}"`,
      path: [...path, 'cli'],
    });
    return errors;
  }

  // Check if this command has subcommands and validate the subcommand
  const subcommands = COMMANDS_WITH_SUBCOMMANDS.get(cli);
  if (subcommands && args.length > 0) {
    const subcommand = args[0];
    if (!subcommands.has(subcommand)) {
      errors.push({
        code: 'unknown_subcommand',
        message: `Unknown subcommand "${subcommand}" for command "${cli}"`,
        path: [...path, 'args', '0'],
      });
    }
  }

  return errors;
}

/**
 * Validate a CommandInvocation against the command surface contract.
 * This ensures:
 * - The command is a registered vectahub command if cli === 'vectahub'
 * - Args are an array of strings, not a single shell string
 */
export function validateCommandInvocation(
  invocation: CommandInvocation,
  path: string[] = ['command'],
): CommandSurfaceValidationResult {
  const errors: CommandSurfaceValidationError[] = [];

  // Validate cli field exists
  if (!invocation.cli || invocation.cli.trim() === '') {
    errors.push({
      code: 'empty_cli',
      message: 'Command cli cannot be empty',
      path: [...path, 'cli'],
    });
  }

  // Validate args are an array
  errors.push(...validateArgsArray(invocation.args, path));

  // If it's a vectahub command, validate the command name and subcommands
  if (invocation.cli === 'vectahub' && invocation.args.length > 0) {
    const actualCommand = invocation.args[0];
    const remainingArgs = invocation.args.slice(1);
    errors.push(...validateVectahubCommand(actualCommand, remainingArgs, path));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an array of CommandInvocations.
 */
export function validateCommandInvocations(
  invocations: CommandInvocation[],
  path: string[] = ['commands'],
): CommandSurfaceValidationResult {
  const allErrors: CommandSurfaceValidationError[] = [];

  for (let i = 0; i < invocations.length; i++) {
    const result = validateCommandInvocation(invocations[i], [...path, String(i)]);
    allErrors.push(...result.errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
