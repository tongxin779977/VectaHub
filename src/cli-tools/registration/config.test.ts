import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, saveConfig, setTestMode } from './config.js';
import { MockEnvironmentService } from '../../infrastructure/testing/mock-services.js';

const mockEnvironment = new MockEnvironmentService();

describe('registration config', () => {
  beforeEach(() => {
    setTestMode(true);
  });

  it('should load config in test mode', async () => {
    const config = await loadConfig(mockEnvironment);
    expect(config.registeredTools).toContain('git');
  });

  it('should save and reload config in test mode', async () => {
    const config = await loadConfig(mockEnvironment);
    config.registeredTools.push('npm');
    await saveConfig(config, mockEnvironment);

    const reloaded = await loadConfig(mockEnvironment);
    expect(reloaded.registeredTools).toContain('npm');
  });

  it('should return a copy of config', async () => {
    const config1 = await loadConfig(mockEnvironment);
    const config2 = await loadConfig(mockEnvironment);
    expect(config1).not.toBe(config2);
  });
});
