import { describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
  exec: vi.fn((command: string, callback: (error: Error | null, stdout: string) => void) => {
    if (command === 'npx tsc --version') {
      callback(null, 'Version 5.6.0\n');
      return;
    }

    if (command === 'npx tsx --version') {
      callback(new Error('tsx unavailable'), '');
      return;
    }

    if (command === 'npx vitest --version') {
      callback(null, 'vitest/2.1.9\n');
      return;
    }

    callback(new Error(`Unexpected command: ${command}`), '');
  }),
}));

describe('doctor command checks', () => {
  it('recognizes local tsx devDependency when npx tsx cannot run', async () => {
    const { runChecks } = await import('./doctor.js');

    const checks = await runChecks();
    const tsxCheck = checks.find((check) => check.name === 'tsx');

    expect(tsxCheck).toEqual({
      name: 'tsx',
      status: 'pass',
      message: 'Declared in devDependencies',
    });
  });
});
