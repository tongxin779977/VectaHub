import type { InfrastructureContext } from './infrastructure/context.js';
import { Signal } from './infrastructure/interfaces/environment-service.js';
import { AsyncLogWriter } from './infrastructure/trace-audit/async-writer.js';
import { createCliOutput } from './infrastructure/cli-output.js';

let signalsSetup = false;
let processListenersSetup = false;

/** Set up SIGINT and SIGTERM handlers that flush logs before exiting. */
export function setupGlobalSignals(ctx: InfrastructureContext): void {
  if (signalsSetup) return;
  signalsSetup = true;

  ctx.environment.onSignal(Signal.SIGINT, async () => {
    const output = createCliOutput({ json: ctx.environment.getArgv().includes('--json') });
    output.text('\n\n🛑 Shutting down...');
    try {
      await AsyncLogWriter.flushAll();
    } catch {
      // best-effort flush on shutdown
    }
    ctx.environment.exit(0);
  });

  ctx.environment.onSignal(Signal.SIGTERM, async () => {
    const output = createCliOutput({ json: ctx.environment.getArgv().includes('--json') });
    output.text('\n\n🛑 Shutting down...');
    try {
      await AsyncLogWriter.flushAll();
    } catch {
      // best-effort flush on shutdown
    }
    ctx.environment.exit(0);
  });
}

/** Set up process warning listener via the infrastructure environment service. */
export function setupProcessListeners(ctx: InfrastructureContext): void {
  if (processListenersSetup) return;
  processListenersSetup = true;

  ctx.environment.onWarning((warning) => {
    if (warning.name === 'MaxListenersExceededWarning') {
      return;
    }
    if ((warning as Error & { code?: string }).code === 'DEP0205') {
      return;
    }
    ctx.logger.getLogger('cli-main').warn({ warning }, 'Process warning');
  });
}
