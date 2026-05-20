import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, 'cli-main.ts');
const PKG = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

describe('cli-main error handling', () => {
  let testHome: string;

  beforeAll(() => {
    testHome = mkdtempSync(join(tmpdir(), 'vectahub-cli-main-'));
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  function runCli(args: string[], envOverrides: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ['--import', 'tsx', CLI_PATH, ...args], {
        cwd: join(__dirname, '..'),
        env: {
          ...process.env,
          CI: 'true',
          HOME: testHome,
          USERPROFILE: testHome,
          VECTAHUB_HOME: join(testHome, '.vectahub'),
          ...envOverrides,
        },
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

  it('fails fast when audit logger initialization cannot create home directory', async () => {
    const blockingFile = join(testHome, 'blocked-home');
    writeFileSync(blockingFile, 'not-a-directory', 'utf-8');

    const result = await runCli(['version'], {
      VECTAHUB_HOME: blockingFile,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Audit logger initialization failed');
  });

  it('fails fast when CLI tool registration fails during lazy loading', async () => {
    const result = await runCli(['config', 'tools'], {
      VECTAHUB_HOME: join(testHome, '.vectahub-cli-tools'),
      VECTAHUB_AUDIT_DISABLED: '1',
      VECTAHUB_TEST_FORCE_CLI_MAIN_FAILURE: 'cli-tools',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('CLI tool registration failed');
  });

  it('fails fast when agent runtime initialization fails during lazy loading', async () => {
    const result = await runCli(['setup'], {
      VECTAHUB_HOME: join(testHome, '.vectahub-agent-runtime'),
      VECTAHUB_AUDIT_DISABLED: '1',
      VECTAHUB_TEST_FORCE_CLI_MAIN_FAILURE: 'agent-runtime',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Agent runtime initialization failed');
  });

  it('fails fast when security policy warning cannot read configuration', async () => {
    const invalidConfigHome = join(testHome, 'invalid-policy-home');
    mkdirSync(invalidConfigHome, { recursive: true });
    writeFileSync(join(invalidConfigHome, 'config.yaml'), 'sandbox: [', 'utf-8');

    const result = await runCli(['config', 'show'], {
      VECTAHUB_HOME: invalidConfigHome,
      VECTAHUB_AUDIT_DISABLED: '1',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Security policy warning failed');
  });

  it('fails fast when CLI audit event cannot be recorded', async () => {
    const auditWriteFailureHome = join(testHome, 'audit-write-failure-home');
    mkdirSync(join(auditWriteFailureHome, 'logs'), { recursive: true });
    writeFileSync(join(auditWriteFailureHome, 'logs', 'audit'), 'not-a-directory', 'utf-8');

    const result = await runCli(['config', 'show'], {
      VECTAHUB_HOME: auditWriteFailureHome,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('CLI audit event recording failed');
  });

  it('still falls back to package version metadata default only after explicit stderr reporting', async () => {
    const result = await runCli(['--version'], {
      VECTAHUB_HOME: join(testHome, '.vectahub-version'),
      VECTAHUB_AUDIT_DISABLED: '1',
    });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(PKG.version);
  });
});
