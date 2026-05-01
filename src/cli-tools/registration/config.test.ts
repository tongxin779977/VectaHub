import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, saveConfig, setTestMode } from './config.js';

describe('registration config', () => {
  beforeEach(() => {
    setTestMode(true);
  });

  it('should load config in test mode', async () => {
    const config = await loadConfig();
    expect(config.registeredTools).toContain('git');
  });

  it('should save and reload config in test mode', async () => {
    const config = await loadConfig();
    config.registeredTools.push('npm');
    await saveConfig(config);

    const reloaded = await loadConfig();
    expect(reloaded.registeredTools).toContain('npm');
  });

  it('should return a copy of config', async () => {
    const config1 = await loadConfig();
    const config2 = await loadConfig();
    expect(config1).not.toBe(config2);
  });
});
