import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const EXPECTED_VERSION: string = pkg.version;

describe('CLI Module', () => {
  const CLI_PATH = join(__dirname, 'cli.ts');
  let testHome: string;

  beforeAll(() => {
    testHome = mkdtempSync(join(tmpdir(), 'vectahub-cli-test-'));
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        CI: 'true',
        HOME: testHome,
        USERPROFILE: testHome,
        VECTAHUB_HOME: join(testHome, '.vectahub'),
      };
      const child = spawn(process.execPath, ['--import', 'tsx', CLI_PATH, ...args], {
        cwd: join(__dirname, '..'),
        env,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        resolve({ code: exitCode || 0, stdout, stderr });
      });

      child.on('error', (error) => {
        resolve({ code: 1, stdout, stderr: error.message });
      });
    });
  }

  function normalizeStderr(stderr: string): string {
    return stderr
      .split('\n')
      .filter(line =>
        !line.includes('[DEP0205]')
        && !line.includes('module.register() is deprecated')
        && !line.includes('node --trace-deprecation')
      )
      .join('\n')
      .trim();
  }

  it('should display help command', async () => {
    const result = await runCli(['--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
  });

  it('should display version', async () => {
    const result = await runCli(['--version']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(EXPECTED_VERSION);
  });

  it('should run doctor and exit cleanly', async () => {
    const result = await runCli(['doctor']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('VectaHub Doctor');
    expect(result.stdout).toContain('0 failed');
  });

  it('should display dev commands', async () => {
    const result = await runCli(['dev', '--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('status');
    expect(result.stdout).toContain('validate');
  });

  it('should execute a dev subcommand without duplicate registration error', async () => {
    const result = await runCli(['dev', 'validate']);

    const normalizedStderr = normalizeStderr(result.stderr);
    expect(normalizedStderr).not.toContain("cannot add command 'dev' as already have command 'dev'");
    expect(normalizedStderr).not.toContain('加载命令 dev 失败');
    expect(result.stdout).toContain('Validating module interfaces');
  });

  it('should display real subcommands for lazy trace help', async () => {
    const result = await runCli(['trace', '--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('show');
  });

  it('should have core commands registered on --help', async () => {
    const coreCommands = [
      'run',
      'doctor',
      'setup',
      'config'
    ];

    const result = await runCli(['--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
    for (const cmd of coreCommands) {
      expect(result.stdout).toContain(cmd);
    }
  });

  it('should lazily load serve command', async () => {
    const result = await runCli(['serve', '--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
  });

  it('should lazily load security command', async () => {
    const result = await runCli(['security', '--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
  });

  it('should lazily load audit command', async () => {
    const result = await runCli(['audit', '--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
  });

  it('should lazily load export and import commands', async () => {
    const result = await runCli(['export', '--help']);

    expect(normalizeStderr(result.stderr)).toBe('');
    expect(result.code).toBe(0);
  });
});
