import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import type { OutputReference } from './types.js';

export interface OutputStore {
  save(executionId: string, stepId: string, stdout: string, stderr?: string): Promise<OutputReference>;
  read(executionId: string, stepId: string): Promise<{ stdout: string; stderr: string }>;
  getSummary(executionId: string, stepId: string): Promise<string | null>;
  getSize(executionId: string): Promise<number>;
  delete(executionId: string): Promise<void>;
  has(executionId: string, stepId: string): Promise<boolean>;
}

function getExecDir(baseDir: string, executionId: string): string {
  return join(baseDir, executionId);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

function getFilePath(baseDir: string, executionId: string, stepId: string, suffix: 'stdout' | 'stderr'): string {
  return join(baseDir, executionId, `${stepId}.${suffix}`);
}

const DEFAULT_SUMMARY_MAX_LEN = 200;

function makeSummary(content: string, maxLen = DEFAULT_SUMMARY_MAX_LEN): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + '...';
}

/**
 * Creates an output store backed by the filesystem.
 *
 * Stores stdout/stderr per step as individual files under `baseDir/<executionId>/`.
 *
 * @param baseDir - Base directory for output storage.
 * @returns An {@link OutputStore} instance
 */
export function createOutputStore(baseDir: string): OutputStore {
  if (!baseDir) {
    throw new Error('createOutputStore requires baseDir');
  }
  const dir = baseDir;

  return {
    async save(executionId: string, stepId: string, stdout: string, stderr = ''): Promise<OutputReference> {
      const execDir = getExecDir(dir, executionId);
      await mkdir(execDir, { recursive: true });

      const stdoutPath = getFilePath(dir, executionId, stepId, 'stdout');
      const stderrPath = getFilePath(dir, executionId, stepId, 'stderr');

      await writeFile(stdoutPath, stdout, 'utf-8');
      if (stderr) {
        await writeFile(stderrPath, stderr, 'utf-8');
      }

      return {
        stepId,
        stdoutPath: `${executionId}/${stepId}.stdout`,
        stderrPath: stderr ? `${executionId}/${stepId}.stderr` : undefined,
        summary: makeSummary(stdout),
        lineCount: stdout.split('\n').length,
        byteSize: Buffer.byteLength(stdout, 'utf-8'),
      };
    },

    async read(executionId: string, stepId: string): Promise<{ stdout: string; stderr: string }> {
      const stdoutPath = getFilePath(dir, executionId, stepId, 'stdout');
      const stderrPath = getFilePath(dir, executionId, stepId, 'stderr');

      let stdout = '';
      let stderr = '';
      try {
        stdout = await readFile(stdoutPath, 'utf-8');
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) {
          throw new Error(`Failed to read stdout for ${executionId}/${stepId}`, { cause: error });
        }
      }
      try {
        stderr = await readFile(stderrPath, 'utf-8');
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) {
          throw new Error(`Failed to read stderr for ${executionId}/${stepId}`, { cause: error });
        }
      }
      return { stdout, stderr };
    },

    async getSummary(executionId: string, stepId: string): Promise<string | null> {
      const stdoutPath = getFilePath(dir, executionId, stepId, 'stdout');
      try {
        const content = await readFile(stdoutPath, 'utf-8');
        return makeSummary(content);
      } catch (error) {
        if (isNodeError(error, 'ENOENT')) {
          return null;
        }
        throw new Error(`Failed to read summary for ${executionId}/${stepId}`, { cause: error });
      }
    },

    async getSize(executionId: string): Promise<number> {
      const execDir = getExecDir(dir, executionId);
      let totalSize = 0;
      try {
        const files = await readdir(execDir);
        for (const file of files) {
          const filePath = join(execDir, file);
          const stats = await stat(filePath);
          totalSize += stats.size;
        }
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) {
          throw new Error(`Failed to get size for ${executionId}`, { cause: error });
        }
      }
      return totalSize;
    },

    async delete(executionId: string): Promise<void> {
      const execDir = getExecDir(dir, executionId);
      try {
        await rm(execDir, { recursive: true, force: true });
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) {
          throw new Error(`Failed to delete outputs for ${executionId}`, { cause: error });
        }
      }
    },

    async has(executionId: string, stepId: string): Promise<boolean> {
      const stdoutPath = getFilePath(dir, executionId, stepId, 'stdout');
      try {
        await readFile(stdoutPath);
        return true;
      } catch (error) {
        if (isNodeError(error, 'ENOENT')) {
          return false;
        }
        throw new Error(`Failed to check output existence for ${executionId}/${stepId}`, { cause: error });
      }
    },
  };
}
