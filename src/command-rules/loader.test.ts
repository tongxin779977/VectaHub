import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRuleSet } from './loader.js';

describe('command-rules loader', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-rule-loader-'));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = '';
  });

  it('returns empty rules when rule file is missing', () => {
    const result = loadRuleSet(join(tempDir, 'missing.json'));

    expect(result).toEqual([]);
  });

  it('throws when rule file contains malformed JSON', () => {
    const filePath = join(tempDir, 'broken.json');
    writeFileSync(filePath, '{bad json', 'utf-8');

    expect(() => loadRuleSet(filePath)).toThrow(`Failed to load command rule set from ${filePath}`);
  });
});
