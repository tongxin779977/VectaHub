import { format } from 'node:util';
import { getVersion } from './utils/version.js';

/** Output interface for bootstrap phase (before full CLI initialization). */
interface BootstrapOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
  json(payload: unknown): void;
}

/**
 * Create a bootstrap output handler for early CLI phase.
 * Uses direct stream writes for fast path (--version) handling.
 * @returns A BootstrapOutput instance.
 */
function createBootstrapOutput(): BootstrapOutput {
  const writeLine = (stream: NodeJS.WriteStream, message?: unknown, optionalParams: unknown[] = []): void => {
    stream.write(`${format(message, ...optionalParams)}\n`);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stdout, message, optionalParams);
    },
    error(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
    json(payload: unknown): void {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    },
  };
}

/**
 * Main bootstrap function that handles fast paths (--version) before loading full CLI.
 * Falls back to cli-main.ts for all other commands.
 */
async function main(): Promise<void> {
  const output = createBootstrapOutput();
  const args = process.argv.slice(2);
  const isVersionOnly = args.length === 1 && (args[0] === '--version' || args[0] === '-V');
  const isVersionCmd = args.length > 0 && args[0] === 'version' && args.every(arg => arg === 'version' || arg === '--json');

  if (isVersionOnly) {
    output.log(getVersion());
    return;
  }

  if (isVersionCmd) {
    const version = getVersion();
    if (args.includes('--json')) {
      output.json({ version, ok: true });
    } else {
      output.log(`v${version}`);
    }
    return;
  }

  await import('./cli-main.js');
}

main().catch((error) => {
  const output = createBootstrapOutput();
  const message = error instanceof Error ? error.message : String(error);
  output.error(`\n❌ ${message}`);
  process.exit(1);
});
