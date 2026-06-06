import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';
import { createTemplatesCmd } from './templates.js';

vi.mock('../workflow/template.js', () => ({
  listTemplates: vi.fn(() => []),
  instantiateTemplate: vi.fn(() => ({ id: 'wf-1', name: 'test', mode: 'sequential', steps: [] })),
}));

vi.mock('../workflow/template-market.js', () => ({
  getSources: vi.fn(async () => []),
  addSource: vi.fn(async () => undefined),
  removeSource: vi.fn(async () => undefined),
  updateSource: vi.fn(async () => undefined),
  updateAllSources: vi.fn(async () => undefined),
  searchTemplates: vi.fn(async () => []),
  installTemplateByName: vi.fn(async () => '/tmp/template.yaml'),
}));

vi.mock('../workflow/storage.js', () => ({
  createStorage: vi.fn(() => ({
    getWorkflow: vi.fn(async () => null),
    saveWorkflow: vi.fn(async () => undefined),
  })),
}));

vi.mock('../setup/first-run-wizard.js', () => ({
  loadConfig: vi.fn(() => ({})),
}));

describe('createTemplatesCmd', () => {
  beforeEach(() => {
    resetDefaultContext();
  });

  afterEach(() => {
    resetDefaultContext();
    vi.restoreAllMocks();
  });

  it('returns a command named templates with expected subcommands', () => {
    const cmd = createTemplatesCmd(getDefaultContext());
    expect(cmd.name()).toBe('templates');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('search');
    expect(subcommands).toContain('install');
    expect(subcommands).toContain('sources');
    expect(subcommands).toContain('use');
    expect(subcommands).toContain('save');
  });

  it('list subcommand runs without throwing', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cmd = createTemplatesCmd(getDefaultContext());
    await cmd.parseAsync(['list'], { from: 'user' });
    const output = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('Total: 0 template(s)');
    stdoutSpy.mockRestore();
  });
});
