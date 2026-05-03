import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, saveConfig, updateConfig, getDefaultConfig } from './index.js';

describe('config infrastructure', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'vectahub-config-test-'));
    configPath = join(testDir, 'config.yaml');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('loadConfig returns defaults when file does not exist', () => {
    const config = loadConfig(configPath);
    const defaults = getDefaultConfig();
    expect(config.version).toBe(defaults.version);
    expect(config.sandbox.mode).toBe('STRICT');
    expect(config.first_run_completed).toBe(false);
  });

  it('saveConfig writes config to disk', () => {
    const config = getDefaultConfig();
    config.sandbox.mode = 'RELAXED';
    saveConfig(config, configPath);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('RELAXED');
    expect(content).toContain('version: 1');
  });

  it('loadConfig reads back saved config', () => {
    const config = getDefaultConfig();
    config.sandbox.mode = 'CONSENSUS';
    config.first_run_completed = true;
    saveConfig(config, configPath);

    const loaded = loadConfig(configPath);
    expect(loaded.sandbox.mode).toBe('CONSENSUS');
    expect(loaded.first_run_completed).toBe(true);
  });

  it('updateConfig merges patch and persists', () => {
    const defaults = getDefaultConfig();
    saveConfig(defaults, configPath);

    const updated = updateConfig(
      { sandbox: { ...defaults.sandbox, mode: 'RELAXED' } },
      configPath
    );
    expect(updated.sandbox.mode).toBe('RELAXED');
    expect(updated.version).toBe(1);

    const reloaded = loadConfig(configPath);
    expect(reloaded.sandbox.mode).toBe('RELAXED');
  });

  it('getDefaultConfig returns a shallow copy (top-level)', () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    a.first_run_completed = true;
    expect(b.first_run_completed).toBe(false);
  });
});
