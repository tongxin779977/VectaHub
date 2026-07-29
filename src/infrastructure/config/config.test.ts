import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EnvironmentService } from '../environment/index.js';
import { ConfigService } from './service.js';
import {
  loadConfigWithDeps,
  saveConfigWithDeps,
  updateConfigWithDeps,
  getDefaultConfigWithDeps,
  type ConfigFacadeDeps,
} from './facade.js';

describe('config infrastructure', () => {
  let testDir: string;
  let configPath: string;
  let deps: ConfigFacadeDeps;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'vectahub-config-test-'));
    configPath = join(testDir, 'config.yaml');
    const env = new EnvironmentService();
    const configSvc = new ConfigService(env);
    deps = { environment: env, config: configSvc };
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('loadConfig returns defaults when file does not exist', () => {
    const config = loadConfigWithDeps(deps, configPath);
    const defaults = getDefaultConfigWithDeps(deps);
    expect(config.version).toBe(defaults.version);
    expect(config.sandbox.mode).toBe('STRICT');
    expect(config.first_run_completed).toBe(false);
  });

  it('saveConfig writes config to disk', () => {
    const config = getDefaultConfigWithDeps(deps);
    config.sandbox.mode = 'RELAXED';
    saveConfigWithDeps(deps, config, configPath);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('RELAXED');
    expect(content).toContain('version: 1');
  });

  it('loadConfig reads back saved config', () => {
    const config = getDefaultConfigWithDeps(deps);
    config.sandbox.mode = 'CONSENSUS';
    config.first_run_completed = true;
    saveConfigWithDeps(deps, config, configPath);

    const loaded = loadConfigWithDeps(deps, configPath);
    expect(loaded.sandbox.mode).toBe('CONSENSUS');
    expect(loaded.first_run_completed).toBe(true);
  });

  it('updateConfig merges patch and persists', () => {
    const defaults = getDefaultConfigWithDeps(deps);
    saveConfigWithDeps(deps, defaults, configPath);

    const updated = updateConfigWithDeps(deps,
      { sandbox: { ...defaults.sandbox, mode: 'RELAXED' } },
      configPath
    );
    expect(updated.sandbox.mode).toBe('RELAXED');
    expect(updated.version).toBe(1);

    const reloaded = loadConfigWithDeps(deps, configPath);
    expect(reloaded.sandbox.mode).toBe('RELAXED');
  });

  it('getDefaultConfig returns a shallow copy (top-level)', () => {
    const a = getDefaultConfigWithDeps(deps);
    const b = getDefaultConfigWithDeps(deps);
    a.first_run_completed = true;
    expect(b.first_run_completed).toBe(false);
  });
});
