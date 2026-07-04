import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

test.describe('CLI smoke', () => {
  test('CLI --version returns semver', async () => {
    const cliPath = resolve(repoRoot, 'dist', 'cli.js');
    const output = await runNode([cliPath, '--version']);
    expect(output).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('CLI version --json returns structured payload', async () => {
    const cliPath = resolve(repoRoot, 'dist', 'cli.js');
    const output = await runNode([cliPath, 'version', '--json']);
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('name', 'vectahub');
  });

  test('CLI help lists subcommands', async () => {
    const cliPath = resolve(repoRoot, 'dist', 'cli.js');
    const output = await runNode([cliPath, '--help']);
    expect(output).toMatch(/Usage:/);
  });
});

function runNode(args) {
  return new Promise((resolveFn, rejectFn) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', rejectFn);
    child.on('exit', (code) => {
      if (code === 0) resolveFn(stdout);
      else rejectFn(new Error(`exit ${code}: ${stderr || stdout}`));
    });
  });
}