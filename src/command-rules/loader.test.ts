import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRuleSet } from './loader.js';

const deps = {
  logger: { error: () => {} },
};

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

  it('loads valid JSON rule file and returns correct CommandRule[]', () => {
    const ruleSet = {
      version: '1.0',
      description: 'test rules',
      rules: [
        { id: 'block-rm', pattern: 'rm *', action: 'block', reason: 'dangerous' },
        { id: 'allow-ls', pattern: 'ls', action: 'allow', description: 'safe listing' },
      ],
    };
    const filePath = join(tempDir, 'rules.json');
    writeFileSync(filePath, JSON.stringify(ruleSet), 'utf-8');

    const result = loadRuleSet(filePath, deps);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'block-rm', pattern: 'rm *', action: 'block', reason: 'dangerous' });
    expect(result[1]).toEqual({ id: 'allow-ls', pattern: 'ls', action: 'allow', description: 'safe listing' });
  });

  it('returns empty rules when rule file is missing', () => {
    const result = loadRuleSet(join(tempDir, 'missing.json'), deps);

    expect(result).toEqual([]);
  });

  it('throws when rule file contains malformed JSON', () => {
    const filePath = join(tempDir, 'broken.json');
    writeFileSync(filePath, '{bad json', 'utf-8');

    expect(() => loadRuleSet(filePath, deps)).toThrow(`Failed to load command rule set from ${filePath}`);
  });

  it('throws when JSON has invalid rule set structure (missing rules array)', () => {
    const filePath = join(tempDir, 'no-rules.json');
    writeFileSync(filePath, JSON.stringify({ version: '1.0', description: 'test' }), 'utf-8');

    expect(() => loadRuleSet(filePath, deps)).toThrow(`Failed to load command rule set from ${filePath}`);
  });

  it('throws when JSON rules contain entries missing required fields', () => {
    const filePath = join(tempDir, 'bad-rules.json');
    writeFileSync(filePath, JSON.stringify({ version: '1.0', description: 'test', rules: [{ id: 'x' }] }), 'utf-8');

    expect(() => loadRuleSet(filePath, deps)).toThrow(`Failed to load command rule set from ${filePath}`);
  });
});
