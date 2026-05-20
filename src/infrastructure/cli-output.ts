import { inspect } from 'node:util';

export type CliOutputMode = 'text' | 'json' | 'silent';

const CLI_OUTPUT_HANDLED = Symbol('cli-output-handled');

export interface CliOutput {
  readonly mode: CliOutputMode;
  text(message?: unknown): void;
  error(message?: unknown): void;
  json(payload: unknown, options?: { space?: number }): void;
  blank(): void;
}

interface CliOutputOptions {
  mode?: CliOutputMode;
  json?: boolean;
  silent?: boolean;
}

export function resolveCliOutputMode(options: { json?: boolean; silent?: boolean } = {}): CliOutputMode {
  if (options.silent) {
    return 'silent';
  }
  if (options.json) {
    return 'json';
  }
  return 'text';
}

export function createCliOutput(options: CliOutputOptions = {}): CliOutput {
  const mode = options.mode ?? resolveCliOutputMode(options);

  const stringifyMessage = (message?: unknown): string => {
    if (message === undefined) {
      return '';
    }
    if (typeof message === 'string') {
      return message;
    }
    return inspect(message, { colors: false, depth: null });
  };

  const writeLine = (stream: NodeJS.WriteStream, message?: unknown): void => {
    stream.write(`${stringifyMessage(message)}\n`);
  };

  const writeText = (message?: unknown): void => {
    if (mode === 'silent') {
      return;
    }
    if (mode === 'json') {
      writeLine(process.stderr, message);
      return;
    }
    writeLine(process.stdout, message);
  };

  const writeError = (message?: unknown): void => {
    if (mode === 'silent') {
      return;
    }
    writeLine(process.stderr, message);
  };

  return {
    mode,
    text(message?: unknown): void {
      writeText(message);
    },
    error(message?: unknown): void {
      writeError(message);
    },
    json(payload: unknown, jsonOptions?: { space?: number }): void {
      if (mode === 'silent') {
        return;
      }
      process.stdout.write(`${JSON.stringify(payload, null, jsonOptions?.space ?? 0)}\n`);
    },
    blank(): void {
      writeText('');
    },
  };
}

export function markCliOutputHandled<T extends Error>(error: T): T {
  Object.defineProperty(error, CLI_OUTPUT_HANDLED, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return error;
}

export function isCliOutputHandledError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && CLI_OUTPUT_HANDLED in error);
}
