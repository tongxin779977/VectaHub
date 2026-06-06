import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';
import { createServeCommands } from './serve.js';

describe('createServeCommands', () => {
  beforeEach(() => {
    resetDefaultContext();
  });

  afterEach(() => {
    resetDefaultContext();
  });

  it('returns serveCmd and clientCmd with correct names', () => {
    const { serveCmd, clientCmd } = createServeCommands(getDefaultContext());
    expect(serveCmd.name()).toBe('serve');
    expect(clientCmd.name()).toBe('client');
  });

  it('serveCmd has expected description and options', () => {
    const { serveCmd } = createServeCommands(getDefaultContext());
    expect(serveCmd.description()).toContain('background service');
    const opts = serveCmd.options.map((o) => o.long);
    expect(opts).toContain('--daemon');
  });

  it('clientCmd has expected subcommands', () => {
    const { clientCmd } = createServeCommands(getDefaultContext());
    const subcommands = clientCmd.commands.map((c) => c.name());
    expect(subcommands).toContain('submit');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('mode');
    expect(subcommands).toContain('config');
    expect(subcommands).toContain('shutdown');
  });
});
