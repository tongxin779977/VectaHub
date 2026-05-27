/**
 * Pino transport wrapper that redacts sensitive data before writing.
 * Integrates with the existing sensitive-data.ts redaction utilities.
 */
import { redactString } from '../../utils/sensitive-data.js';

/**
 * Options for the redact transport
 */
interface RedactTransportOptions {
  destination?: NodeJS.WritableStream | string;
}

/**
 * Creates a Pino transport that redacts sensitive data before writing
 * @param options - Configuration options for the transport
 * @returns A Pino-compatible transport object
 */
export function createRedactTransport(options: RedactTransportOptions = {}) {
  const dest = options.destination ?? process.stdout;

  return {
    write(msg: string): void {
      try {
        const redacted = redactString(msg);
        if (typeof dest === 'string') {
          // If destination is a file path, pino handles it internally;
          // this transport only applies redaction to the message string.
          process.stdout.write(redacted + '\n');
        } else {
          (dest as NodeJS.WritableStream).write(redacted + '\n');
        }
      } catch (error) {
        // Fallback: write original if redaction fails
        if (typeof dest !== 'string') {
          (dest as NodeJS.WritableStream).write(msg + '\n');
        }
      }
    },
  };
}