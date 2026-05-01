import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('CLI Module', () => {
  it('should display help command', async () => {
    const code = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', 'src/cli.ts', '--help'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe',
        shell: true,
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(output).toContain('vectahub');
        resolve(code || 0);
      });
    });
    expect(code).toBe(0);
  });

  it('should display version', async () => {
    const code = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', 'src/cli.ts', '--version'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe',
        shell: true,
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(output).toMatch(/\d+\.\d+\.\d+/);
        resolve(code || 0);
      });
    });
    expect(code).toBe(0);
  });

  it('should display dev commands', async () => {
    const code = await new Promise<number>((resolve) => {
      const child = spawn('npx', ['tsx', 'src/cli.ts', 'dev', '--help'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe',
        shell: true,
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(output).toContain('dev');
        resolve(code || 0);
      });
    });
    expect(code).toBe(0);
  });
});
