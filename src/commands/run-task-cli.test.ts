import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunTaskCmd } from './run-task.js';
import { getDefaultContext } from '../infrastructure/context.js';

describe('run-task CLI options mapping', () => {
  let tempDir: string;
  let tempFile1: string;
  let tempFile2: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-run-task-cli-test-'));
    tempFile1 = join(tempDir, 'task1.md');
    tempFile2 = join(tempDir, 'task2.md');
    writeFileSync(tempFile1, '# Tasks\n');
    writeFileSync(tempFile2, '# Tasks\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should map --file to doc option in runTask parameter', async () => {
    const context = getDefaultContext();
    const cmd = createRunTaskCmd(context);

    await expect(
      cmd.parseAsync(['node', 'test', '--task-id', 'T1', '--tool', 'aider', '--file', tempFile1])
    ).rejects.toThrow(`Task contract not found in doc: taskId=T1, docPath=${tempFile1}`);
  });

  it('should prioritize --doc if both --doc and --file are provided', async () => {
    const context = getDefaultContext();
    const cmd = createRunTaskCmd(context);

    await expect(
      cmd.parseAsync(['node', 'test', '--task-id', 'T2', '--tool', 'aider', '--doc', tempFile1, '--file', tempFile2])
    ).rejects.toThrow(`Task contract not found in doc: taskId=T2, docPath=${tempFile1}`);
  });
});
