import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebugCmd, createWorkflowDebugger } from './debug.js';
import { MockEnvironmentService, MockLoggerService } from '../infrastructure/testing/mock-services.js';
import type { InfrastructureContext } from '../infrastructure/context.js';

describe('debug command output', () => {
  const context = {
    environment: new MockEnvironmentService(),
    logger: new MockLoggerService(),
  } as unknown as InfrastructureContext;
  const workflowDebugger = createWorkflowDebugger(context);
  const debugCmd = createDebugCmd(context, { workflowDebugger });

  afterEach(() => {
    workflowDebugger.reset();
    workflowDebugger.clearHistory();
    vi.restoreAllMocks();
  });

  it('lists breakpoints through CLI output instead of logger-only paths', async () => {
    workflowDebugger.setBreakpoint('step-a');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await debugCmd.parseAsync(['breakpoint', 'list'], { from: 'user' });

    expect(stderrSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalled();

    const rendered = stdoutSpy.mock.calls.map((call) => String(call[0] ?? '')).join('');
    expect(rendered).toContain('Breakpoints:');
    expect(rendered).toContain('step-a');
  });

  it('renders empty state message to stdout', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await debugCmd.parseAsync(['state'], { from: 'user' });

    const rendered = stdoutSpy.mock.calls.map((call) => String(call[0] ?? '')).join('');
    expect(rendered).toContain('No active debug session');
  });
});
