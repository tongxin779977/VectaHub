import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('BUG-001: JSON mode should not have log pollution', () => {
  const CLI_PATH = join(__dirname, '../../cli.ts');
  let testHome: string;

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'vectahub-bug001-test-'));
  });

  afterEach(() => {
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
        cwd: join(__dirname, '../..'),
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

  it('should output pure JSON when using --json flag', async () => {
    const result = await runCli(['doctor', '--json']);

    const stdout = result.stdout.trim();

    let isPureJson = false;
    let canParseAsJson = false;

    if (stdout.startsWith('{') || stdout.startsWith('[')) {
      isPureJson = true;
      try {
        JSON.parse(stdout);
        canParseAsJson = true;
      } catch {
        canParseAsJson = false;
      }
    }

    expect(isPureJson, `stdout should start with { or [: ${stdout.substring(0, 100)}`).toBe(true);
    expect(canParseAsJson, `stdout should contain valid JSON: ${stdout.substring(0, 100)}`).toBe(true);
  });

  it('should not have log prefixes in stdout when using --json', async () => {
    const result = await runCli(['doctor', '--json']);

    const stdout = result.stdout;
    const lines = stdout.trim().split('\n');
    const firstLine = lines[0] || '';

    const hasLogPrefix = /^\[INFO\]|^\[DEBUG\]|^\[WARN\]|^\[ERROR\]|^\[.*?\]\s/.test(firstLine);
    expect(hasLogPrefix, `stdout should not have log prefixes: ${firstLine}`).toBe(false);
  });

  it('should have valid JSON in stdout when using --json flag', async () => {
    const result = await runCli(['doctor', '--json']);

    const stdout = result.stdout.trim();

    expect(stdout).toBeTruthy();
    try {
      JSON.parse(stdout);
    } catch (e: any) {
      throw new Error(`stdout should be valid JSON when --json is used. Error: ${e.message}, stdout: ${stdout.substring(0, 200)}`);
    }
  });
});