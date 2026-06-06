import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { djb2Hash } from '../infrastructure/paths/index.js';

const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock('../utils/logger.js', () => ({
  createConsoleLogger: vi.fn(() => ({
    info: mockInfo,
    error: mockError,
    debug: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    info: mockInfo,
    error: mockError,
    debug: vi.fn(),
  })),
}));

async function createTestRunTaskCleanLogsCmd() {
  const { createRunTaskCleanLogsCmd } = await import('./run-task.js');
  const { getDefaultContext } = await import('../infrastructure/context.js');
  return createRunTaskCleanLogsCmd(getDefaultContext());
}

function getRunTaskFailureLogDir(vectaHubHome: string): string {
  const resolvedHome = process.env.VECTAHUB_HOME ?? vectaHubHome;
  return join(resolvedHome, 'outputs', 'run-task', djb2Hash(process.cwd()));
}

describe('run-task-clean-logs command', () => {
  it('should remove persisted run-task failure logs', async () => {
    const originalVectaHubHome = process.env.VECTAHUB_HOME;
    const tempVectaHubHome = mkdtempSync(join(tmpdir(), 'vectahub-home-'));
    const outputDir = getRunTaskFailureLogDir(tempVectaHubHome);
    process.env.VECTAHUB_HOME = tempVectaHubHome;

    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'P2-CLEAN-1.stdout'), 'one');
    writeFileSync(join(outputDir, 'P2-CLEAN-2.stderr'), 'two');

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      const runTaskCleanLogsCmd = await createTestRunTaskCleanLogsCmd();
      await runTaskCleanLogsCmd.parseAsync([], { from: 'user' });

      expect(existsSync(join(outputDir, 'P2-CLEAN-1.stdout'))).toBe(false);
      expect(existsSync(join(outputDir, 'P2-CLEAN-2.stderr'))).toBe(false);
      const output = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(output).toContain('Cleared 2 run-task failure log files.');
    } finally {
      stdoutSpy.mockRestore();
      if (originalVectaHubHome === undefined) {
        delete process.env.VECTAHUB_HOME;
      } else {
        process.env.VECTAHUB_HOME = originalVectaHubHome;
      }
      rmSync(tempVectaHubHome, { recursive: true, force: true });
    }
  });
});
