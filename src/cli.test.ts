import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';

describe('CLI Module', () => {
  const CLI_PATH = join(__dirname, 'cli.ts');

  beforeAll(() => {
  });

  it('should display help command', async () => {
    const code = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', CLI_PATH, '--help'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (exitCode) => {
        resolve(exitCode || 0);
      });

      child.on('error', () => {
        resolve(1);
      });
    });

    expect(code).toBe(0);
  });

  it('should display version', async () => {
    const code = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', CLI_PATH, '--version'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });

      child.on('close', (exitCode) => {
        resolve(exitCode || 0);
      });

      child.on('error', () => {
        resolve(1);
      });
    });

    expect(code).toBe(0);
  });

  it('should display dev commands', async () => {
    const code = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', CLI_PATH, 'dev', '--help'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });

      child.on('close', (exitCode) => {
        resolve(exitCode || 0);
      });

      child.on('error', () => {
        resolve(1);
      });
    });

    expect(code).toBe(0);
  });

  it('should have all required commands registered', async () => {
    const expectedCommands = [
      'dev',
      'serve',
      'client',
      'security',
      'audit',
      'tools',
      'run',
      'list',
      'mode',
      'history',
      'doctor',
      'generate',
      'schedule',
      'daemon',
      'setup',
      'config'
    ];

    const code = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', CLI_PATH, '--help'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (exitCode) => {
        for (const cmd of expectedCommands) {
          if (!output.includes(cmd)) {
            resolve(1);
            return;
          }
        }
        resolve(exitCode || 0);
      });

      child.on('error', () => {
        resolve(1);
      });
    });

    expect(code).toBe(0);
  });
});
