import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginManager } from './plugin-manager.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  const testPluginsDir = join(homedir(), '.vectahub', 'plugins-test');
  const testConfigFile = join(homedir(), '.vectahub', 'plugins-test.json');

  beforeEach(async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (path: string) => {
      if (path.endsWith('plugins.json')) {
        return JSON.stringify({});
      }
      throw new Error('File not found');
    });
    
    vi.spyOn(fs, 'writeFile').mockResolvedValue();
    vi.spyOn(fs, 'mkdir').mockResolvedValue();
    vi.spyOn(fs, 'readdir').mockResolvedValue([]);
    vi.spyOn(fs, 'stat').mockResolvedValue({ isDirectory: () => false, isFile: () => true } as any);
    
    pluginManager = new PluginManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty plugins', async () => {
    expect(pluginManager.getAllPlugins()).toEqual([]);
  });

  it('should get a plugin by ID', () => {
    expect(pluginManager.getPlugin('test-plugin')).toBeUndefined();
  });

  it('should throw error when enabling non-existent plugin', async () => {
    await expect(pluginManager.enablePlugin('non-existent')).rejects.toThrow('Plugin not found: non-existent');
  });

  it('should throw error when disabling non-existent plugin', async () => {
    await expect(pluginManager.disablePlugin('non-existent')).rejects.toThrow('Plugin not found: non-existent');
  });

  it('should throw error when uninstalling non-existent plugin', async () => {
    await expect(pluginManager.uninstallPlugin('non-existent')).rejects.toThrow('Plugin not found: non-existent');
  });

  it('should throw error when updating non-existent plugin', async () => {
    await expect(pluginManager.updatePlugin('non-existent')).rejects.toThrow('Plugin not found: non-existent');
  });

  it('should return empty commands array when no plugins are loaded', () => {
    expect(pluginManager.getCommands()).toEqual([]);
  });

  it('should trigger hooks without error when no plugins are loaded', async () => {
    await expect(pluginManager.triggerHook('test-hook')).resolves.not.toThrow();
  });
});
