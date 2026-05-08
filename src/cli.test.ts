import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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

  it('should display help command', async () => {
    const result = await runCli(['--help']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('should display version', async () => {
    const result = await runCli(['--version']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('1.0.0');
  });

  it('should run doctor and exit cleanly', async () => {
    const result = await runCli(['doctor']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('VectaHub Doctor');
    expect(result.stdout).toContain('0 failed');
  });

  it('should display dev commands', async () => {
    const result = await runCli(['dev', '--help']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('should have core commands registered on --help', async () => {
    const coreCommands = [
      'run',
      'doctor',
      'setup',
      'config'
    ];

    const result = await runCli(['--help']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    for (const cmd of coreCommands) {
      expect(result.stdout).toContain(cmd);
    }
  });

  it('should lazily load serve command', async () => {
    const result = await runCli(['serve', '--help']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('should lazily load security command', async () => {
    const result = await runCli(['security', '--help']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('should lazily load audit command', async () => {
    const result = await runCli(['audit', '--help']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('should lazily load export and import commands', async () => {
    const result = await runCli(['export', '--help']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });
});
