import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDefaultContext, resetDefaultContext } from '../infrastructure/context.js';
import { createExportCmd, createImportCmd } from './export.js';

describe('export command factories', () => {
  let oldHome: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    oldHome = process.env.VECTAHUB_HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'vectahub-export-test-'));
    process.env.VECTAHUB_HOME = tempHome;
    resetDefaultContext();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (oldHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = oldHome;
    }
    rmSync(tempHome, { recursive: true, force: true });
    resetDefaultContext();
    vi.restoreAllMocks();
  });

  it('createExportCmd returns a command named export', () => {
    const cmd = createExportCmd(getDefaultContext());
    expect(cmd.name()).toBe('export');
    expect(cmd.description()).toContain('导出');
  });

  it('createImportCmd returns a command named import', () => {
    const cmd = createImportCmd(getDefaultContext());
    expect(cmd.name()).toBe('import');
    expect(cmd.description()).toContain('导入');
  });

  it('import dry-run does not modify target directory', async () => {
    const importDir = mkdtempSync(join(tmpdir(), 'vectahub-import-src-'));
    const dataDir = join(importDir, 'data');
    mkdirSync(join(dataDir, 'workflows'), { recursive: true });
    writeFileSync(join(dataDir, 'workflows', 'test.yaml'), 'name: test');
    writeFileSync(
      join(importDir, 'manifest.json'),
      JSON.stringify({
        version: '1.0.0',
        exportDate: '2025-01-01T00:00:00.000Z',
        includeSecrets: false,
        manifest: { workflows: ['test.yaml'] },
      }),
    );

    const cmd = createImportCmd(getDefaultContext());
    await cmd.parseAsync([importDir, '--dry-run'], { from: 'user' });

    expect(existsSync(join(tempHome, 'workflows'))).toBe(false);

    rmSync(importDir, { recursive: true, force: true });
  });

  it('export with no data does not create archive', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vectahub-export-out-'));

    const cmd = createExportCmd(getDefaultContext());
    await cmd.parseAsync(['--output', outputDir], { from: 'user' });

    const files = readdirSync(outputDir);
    expect(files.filter((f: string) => f.endsWith('.tar.gz')).length).toBe(0);

    rmSync(outputDir, { recursive: true, force: true });
  });
});
