import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from './service.js';
import { MockEnvironmentService } from '../testing/mock-services.js';
import type { Config } from './schema.js';

describe('ConfigService', () => {
  let environment: MockEnvironmentService;
  let configService: ConfigService;

  beforeEach(() => {
    environment = new MockEnvironmentService();
    configService = new ConfigService(environment);
  });

  it('should create ConfigService instance', () => {
    expect(configService).toBeInstanceOf(ConfigService);
  });

  it('getDefaultConfig should return valid default config', () => {
    const config = configService.getDefaultConfig();
    expect(config.version).toBe(1);
    expect(config.sandbox.mode).toBe('STRICT');
    expect(config.first_run_completed).toBe(false);
    expect(config.sandbox.enabled).toBe(true);
  });

  it('loadConfig should return default config when no config file exists', () => {
    const config = configService.loadConfig();
    expect(config.version).toBe(1);
    expect(config.sandbox.mode).toBe('STRICT');
  });

  it('getConfig should cache the config', () => {
    const config = configService.getConfig();
    expect(config.version).toBe(1);
    
    // 再次调用应返回相同的缓存对象
    const config2 = configService.getConfig();
    expect(config2).toEqual(config);
  });

  it('saveConfig should persist config to disk', () => {
    const config = configService.getDefaultConfig();
    config.sandbox.mode = 'RELAXED';
    configService.saveConfig(config);

    const loaded = configService.loadConfig();
    expect(loaded.sandbox.mode).toBe('RELAXED');
  });

  it('updateConfig should merge and persist', () => {
    const config = configService.getConfig();
    const updated = configService.updateConfig({
      sandbox: { ...config.sandbox, mode: 'RELAXED' } });
    expect(updated.sandbox.mode).toBe('RELAXED');
    
    const reloaded = configService.loadConfig();
    expect(reloaded.sandbox.mode).toBe('RELAXED');
  });

  it('reloadConfig should reload from disk', () => {
    // First load initial
    configService.getConfig();
    // Change config on disk
    const config = configService.getDefaultConfig();
    config.first_run_completed = true;
    environment.writeFile(environment.getPath('config.yaml'), 'version: 1\nfirst_run_completed: true');
    // Reload
    const reloaded = configService.reloadConfig();
    expect(reloaded.first_run_completed).toBe(true);
  });
});
