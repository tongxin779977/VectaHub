import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getSecurityManager, setTestMode, SecurityProtocolManager } from './manager.js';

describe('SecurityProtocolManager', () => {
  let tempDir = '';

  beforeEach(() => {
    setTestMode(true);
  });

  afterEach(() => {
    setTestMode(false);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = '';
  });

  it('resetToDefaults should clear enabled/disabled overrides and restore builtin rules', () => {
    const manager = getSecurityManager();

    expect(manager.getEnabledRules().some((rule) => rule.id === 'rule-sudo')).toBe(true);

    manager.disableRule('rule-sudo');
    expect(manager.getEnabledRules().some((rule) => rule.id === 'rule-sudo')).toBe(false);

    manager.resetToDefaults();

    expect(manager.getEnabledRules().some((rule) => rule.id === 'rule-sudo')).toBe(true);
    expect(manager.getConfig().rules.enabled).toEqual([]);
    expect(manager.getConfig().rules.disabled).toEqual([]);
  });

  it('throws when persisted security config is malformed', () => {
    setTestMode(false);
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-config-'));
    const configPath = join(tempDir, 'security-config.json');
    writeFileSync(configPath, '{bad json', 'utf-8');

    expect(() => new SecurityProtocolManager(configPath)).toThrow(`Failed to load security config from ${configPath}`);
  });

  it('throws when persisted security database is malformed', () => {
    setTestMode(false);
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-db-'));
    const configPath = join(tempDir, 'security-config.json');
    const dbPath = join(tempDir, 'security-database.json');
    writeFileSync(configPath, JSON.stringify({
      databasePath: dbPath,
      autoUpdate: true,
      rules: { enabled: [], disabled: [] },
    }), 'utf-8');
    writeFileSync(dbPath, '{bad json', 'utf-8');

    expect(() => new SecurityProtocolManager(configPath)).toThrow(`Failed to load security database from ${dbPath}`);
  });

  it('throws when initializing security config path is not writable as a file target', () => {
    setTestMode(false);
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-save-'));
    const blockedDir = join(tempDir, 'blocked-parent');
    mkdirSync(blockedDir, { recursive: true });
    const blockingFile = join(blockedDir, 'not-a-directory');
    writeFileSync(blockingFile, 'blocked', 'utf-8');
    const configPath = join(blockingFile, 'security-config.json');

    expect(() => new SecurityProtocolManager(configPath)).toThrow(`Failed to initialize security config at ${configPath}`);
  });
});
