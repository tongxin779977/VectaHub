import { describe, expect, it, vi } from 'vitest';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

function createMockEnvironment(): IEnvironmentService {
  const cwd = '/fake/project';
  const joinPath = (...segments: string[]) => segments.join('/');

  const execMock = vi.fn(async (command: string) => {
    if (command === 'npx tsc --version') {
      return { stdout: 'Version 5.6.0\n', stderr: '' };
    }
    if (command === 'npx tsx --version') {
      throw new Error('tsx unavailable');
    }
    if (command === 'npx vitest --version') {
      return { stdout: 'vitest/2.1.9\n', stderr: '' };
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  const existsMock = vi.fn((path: string) => {
    if (path === joinPath(cwd, 'package.json')) return true;
    if (path === joinPath(cwd, 'src')) return true;
    if (path === joinPath(cwd, 'docs')) return true;
    return false;
  });

  const readFileMock = vi.fn((path: string) => {
    if (path === joinPath(cwd, 'package.json')) {
      return JSON.stringify({
        version: '1.0.0',
        dependencies: {},
        devDependencies: { tsx: '^4.0.0' },
      });
    }
    throw new Error(`Unexpected readFile: ${path}`);
  });

  const readDirMock = vi.fn(() => ['index.ts', 'commands']);

  return {
    getHomePath: () => '/fake/home',
    getPath: (...s: string[]) => joinPath('/fake/home', ...s),
    resolvePath: (...s: string[]) => joinPath(...s),
    joinPath,
    getDirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    readFile: readFileMock,
    readFileAsync: async (p: string) => readFileMock(p),
    readLines: async function* () { yield ''; },
    writeFile: vi.fn(),
    exists: existsMock,
    ensureDir: vi.fn(),
    mkdirAsync: vi.fn(),
    readDir: readDirMock,
    readDirObjects: vi.fn(() => []),
    rm: vi.fn(),
    copyFile: vi.fn(),
    createWriteStream: vi.fn(),
    stat: vi.fn(() => ({ size: 0, isDirectory: () => false })),
    getTmpDir: () => '/tmp',
    getEnv: (name: string) => (name === 'NODE_ENV' ? 'test' : undefined),
    setEnv: vi.fn(),
    deleteEnv: vi.fn(),
    getEnvBoolean: () => false,
    getEnvNumber: () => undefined,
    getAllEnv: () => ({ NODE_ENV: 'test' }),
    exec: execMock,
    spawn: vi.fn(),
    exit: vi.fn() as never,
    getArgv: () => ['node', 'doctor'],
    getCwd: () => cwd,
    getPlatform: () => 'darwin',
    onSignal: vi.fn(),
    onUncaughtException: vi.fn(),
    onUnhandledRejection: vi.fn(),
    onWarning: vi.fn(),
  };
}

describe('doctor command checks', () => {
  it('recognizes local tsx devDependency when npx tsx cannot run', async () => {
    const { runChecks } = await import('./doctor.js');
    const mockEnv = createMockEnvironment();

    const checks = await runChecks(mockEnv);
    const tsxCheck = checks.find((check) => check.name === 'tsx');

    expect(tsxCheck).toEqual({
      name: 'tsx',
      status: 'pass',
      message: 'Declared in devDependencies',
    });
  });

  it('recognizes project tsx binary when npx tsx cannot run', async () => {
    const { runChecks } = await import('./doctor.js');
    const mockEnv = createMockEnvironment();
    const joinPath = mockEnv.joinPath;

    vi.mocked(mockEnv.exists).mockImplementation((path: string) => {
      if (path === joinPath('/fake/project', 'package.json')) return true;
      if (path === joinPath('/fake/project', 'src')) return true;
      if (path === joinPath('/fake/project', 'docs')) return true;
      if (path === joinPath('/fake/project', 'node_modules', '.bin', 'tsx')) return true;
      return false;
    });

    const checks = await runChecks(mockEnv);
    const tsxCheck = checks.find((check) => check.name === 'tsx');

    expect(tsxCheck).toEqual({
      name: 'tsx',
      status: 'pass',
      message: 'Installed in project',
    });
  });
});
