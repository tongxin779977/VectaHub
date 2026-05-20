import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { homedir } from 'os';

vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
  },
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: vi.fn(),
  },
}));

vi.mock('../src/config/settings.js', () => ({
  getCliPath: () => 'vectahub',
}));

vi.mock('../src/extension.js', () => ({
  getGlobalCliPath: () => undefined,
}));

vi.mock('../src/ui/output.js', () => ({
  logToOutput: vi.fn(),
}));

vi.mock('../src/cli/process-manager.js', () => ({
  ProcessManager: {
    getInstance: () => ({
      register: vi.fn(),
    }),
  },
}));

vi.mock('../src/trace/index.js', () => ({
  createCliTraceEnv: () => ({}),
  createRootTraceContext: () => ({ traceId: 'trace-test' }),
  startSpan: () => ({
    spanId: 'span-test',
    end: vi.fn(),
    fail: vi.fn(),
  }),
}));

let getVectaHubHome: typeof import('../src/cli/adapter.js').getVectaHubHome;

const originalVectaHubHome = process.env.VECTAHUB_HOME;

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

beforeAll(async () => {
  ({ getVectaHubHome } = await import('../src/cli/adapter.js'));
});

describe('cli adapter getVectaHubHome', () => {
  afterEach(() => {
    restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
  });

  it('falls back when env is blank', () => {
    process.env.VECTAHUB_HOME = '   ';

    expect(getVectaHubHome()).toBe(path.join(homedir(), '.vectahub'));
  });

  it('falls back when env is string undefined', () => {
    process.env.VECTAHUB_HOME = 'undefined';

    expect(getVectaHubHome()).toBe(path.join(homedir(), '.vectahub'));
  });

  it('falls back when env is string null', () => {
    process.env.VECTAHUB_HOME = 'null';

    expect(getVectaHubHome()).toBe(path.join(homedir(), '.vectahub'));
  });

  it('uses explicit path when env is set', () => {
    process.env.VECTAHUB_HOME = '/tmp/vectahub-extension-home';

    expect(getVectaHubHome()).toBe('/tmp/vectahub-extension-home');
  });
});
