import { join, basename, extname } from 'path';
import { homedir } from 'os';
import { promises as fs } from 'fs';
import vm from 'vm';
import { createConsoleLogger } from '../utils/logger.js';
import { type PluginInstance, type PluginManifest, type PluginContext, type PluginCommand, PluginStatus } from './plugin-api.js';

const PLUGINS_DIR = join(homedir(), '.vectahub', 'plugins');
const PLUGINS_CONFIG_FILE = join(homedir(), '.vectahub', 'plugins.json');

const ALLOWED_PLUGIN_PERMISSIONS = ['read', 'write', 'execute', 'network', 'hooks'];

interface PluginConfig {
  [pluginId: string]: {
    enabled: boolean;
    config: Record<string, unknown>;
    permissions: string[];
  };
}

interface PluginPermissions {
  read: boolean;
  write: boolean;
  execute: boolean;
  network: boolean;
  hooks: boolean;
}

function parsePermissions(permissions: string[]): PluginPermissions {
  return {
    read: permissions.includes('read'),
    write: permissions.includes('write'),
    execute: permissions.includes('execute'),
    network: permissions.includes('network'),
    hooks: permissions.includes('hooks'),
  };
}

function validatePermissions(permissions: string[]): string[] {
  const invalid = permissions.filter(p => !ALLOWED_PLUGIN_PERMISSIONS.includes(p));
  return invalid;
}

function createSandboxContext(pluginId: string, permissions: PluginPermissions, config: Record<string, unknown>): vm.Context {
  const safeGlobals: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => console.log(`[${pluginId}]`, ...args),
      info: (...args: unknown[]) => console.info(`[${pluginId}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[${pluginId}]`, ...args),
      error: (...args: unknown[]) => console.error(`[${pluginId}]`, ...args),
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    RegExp: RegExp,
    pluginConfig: config,
  };

  if (permissions.network) {
    safeGlobals.fetch = fetch;
  }

  return vm.createContext(safeGlobals);
}

export class PluginManager {
  private plugins = new Map<string, PluginInstance>();
  private config: PluginConfig = {};
  private logger = createConsoleLogger('plugin-manager');

  constructor() {
    this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(PLUGINS_CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(content);
    } catch {
      this.config = {};
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.writeFile(PLUGINS_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  async loadPlugins(): Promise<void> {
    try {
      await fs.mkdir(PLUGINS_DIR, { recursive: true });
      const files = await fs.readdir(PLUGINS_DIR);
      
      for (const file of files) {
        const pluginPath = join(PLUGINS_DIR, file);
        const stat = await fs.stat(pluginPath);
        
        if (stat.isDirectory()) {
          await this.loadPluginFromDir(pluginPath);
        } else if (extname(file) === '.js' || extname(file) === '.ts') {
          await this.loadPluginFromFile(pluginPath);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load plugins: ${(error as Error).message}`);
    }
  }

  private async loadPluginFromDir(dirPath: string): Promise<void> {
    const manifestPath = join(dirPath, 'plugin.json');
    const mainPath = join(dirPath, 'index.js');
    
    try {
      await fs.access(manifestPath);
      await fs.access(mainPath);
      
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);
      
      const invalidPermissions = validatePermissions(manifest.permissions || []);
      if (invalidPermissions.length > 0) {
        this.logger.warn(`Plugin ${manifest.metadata.id} has invalid permissions: ${invalidPermissions.join(', ')}`);
        return;
      }
      
      await this.createPlugin(manifest, mainPath);
    } catch {
      this.logger.warn(`Skipping invalid plugin directory: ${dirPath}`);
    }
  }

  private async loadPluginFromFile(filePath: string): Promise<void> {
    try {
      const module = await import(filePath);
      const plugin = module.default;
      
      if (plugin && plugin.manifest && typeof plugin.activate === 'function') {
        const invalidPermissions = validatePermissions(plugin.manifest.permissions || []);
        if (invalidPermissions.length > 0) {
          this.logger.warn(`Plugin ${plugin.manifest.metadata.id} has invalid permissions: ${invalidPermissions.join(', ')}`);
          return;
        }
        
        await this.createPlugin(plugin.manifest, filePath, plugin);
      }
    } catch (error) {
      this.logger.warn(`Failed to load plugin from file: ${filePath}`);
    }
  }

  private async createPlugin(manifest: PluginManifest, sourcePath: string, module?: unknown): Promise<void> {
    const pluginId = manifest.metadata.id;
    const pluginConfig = this.config[pluginId] || { enabled: true, config: {}, permissions: manifest.permissions || [] };
    
    const permissions = parsePermissions(pluginConfig.permissions);
    const sandbox = createSandboxContext(pluginId, permissions, pluginConfig.config);

    const plugin: PluginInstance = {
      manifest,
      status: pluginConfig.enabled ? 'installed' : 'disabled',
      config: pluginConfig.config,
      permissions,
      hooks: new Map(),
      commands: manifest.commands || [],
      
      async activate(context: PluginContext) {
        if (module && typeof module.activate === 'function') {
          try {
            if (permissions.execute) {
              await module.activate(context);
            } else {
              throw new Error('Plugin does not have execute permission');
            }
          } catch (error) {
            this.logger.error(`Failed to activate plugin ${pluginId}: ${(error as Error).message}`);
            throw error;
          }
        }
        plugin.status = 'enabled';
        this.logger.info(`Plugin activated: ${pluginId}`);
      },
      
      async deactivate() {
        if (module && typeof module.deactivate === 'function') {
          try {
            await module.deactivate();
          } catch (error) {
            this.logger.error(`Failed to deactivate plugin ${pluginId}: ${(error as Error).message}`);
          }
        }
        plugin.status = 'disabled';
        this.logger.info(`Plugin deactivated: ${pluginId}`);
      },
    };
    
    this.plugins.set(pluginId, plugin);
    
    if (pluginConfig.enabled) {
      const context = this.createContext(plugin);
      await plugin.activate(context);
    }
  }

  private createContext(plugin: PluginInstance): PluginContext {
    return {
      logger: {
        info: (msg: string) => this.logger.info(`[${plugin.manifest.metadata.id}] ${msg}`),
        warn: (msg: string) => this.logger.warn(`[${plugin.manifest.metadata.id}] ${msg}`),
        error: (msg: string) => this.logger.error(`[${plugin.manifest.metadata.id}] ${msg}`),
        debug: (msg: string) => this.logger.info(`[DEBUG] [${plugin.manifest.metadata.id}] ${msg}`),
      },
      config: plugin.config,
      permissions: plugin.permissions,
      api: {
        version: '1.0.0',
        registerHook: (hookName: string, handler: () => void | Promise<void>) => {
          if (plugin.permissions.hooks) {
            const handlers = plugin.hooks.get(hookName) || [];
            handlers.push(handler);
            plugin.hooks.set(hookName, handlers);
          } else {
            this.logger.warn(`Plugin ${plugin.manifest.metadata.id} does not have hooks permission`);
          }
        },
      },
    };
  }

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    if (plugin.status !== 'enabled') {
      const context = this.createContext(plugin);
      await plugin.activate(context);
      this.config[pluginId] = this.config[pluginId] || { enabled: true, config: {}, permissions: [] };
      this.config[pluginId].enabled = true;
      await this.saveConfig();
    }
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    if (plugin.status === 'enabled') {
      await plugin.deactivate();
      this.config[pluginId] = this.config[pluginId] || { enabled: false, config: {}, permissions: [] };
      this.config[pluginId].enabled = false;
      await this.saveConfig();
    }
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    if (plugin.status === 'enabled') {
      await plugin.deactivate();
    }
    
    this.plugins.delete(pluginId);
    delete this.config[pluginId];
    await this.saveConfig();
    
    const pluginDir = join(PLUGINS_DIR, pluginId);
    try {
      await fs.rm(pluginDir, { recursive: true });
      this.logger.info(`Plugin uninstalled: ${pluginId}`);
    } catch {
      this.logger.warn(`Failed to remove plugin directory: ${pluginDir}`);
    }
  }

  async updatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    const wasEnabled = plugin.status === 'enabled';
    if (wasEnabled) {
      await plugin.deactivate();
    }
    
    this.plugins.delete(pluginId);
    
    const pluginDir = join(PLUGINS_DIR, pluginId);
    await this.loadPluginFromDir(pluginDir);
    
    const updatedPlugin = this.plugins.get(pluginId);
    if (updatedPlugin && wasEnabled) {
      const context = this.createContext(updatedPlugin);
      await updatedPlugin.activate(context);
    }
    
    this.logger.info(`Plugin updated: ${pluginId}`);
  }

  getCommands(): PluginCommand[] {
    const commands: PluginCommand[] = [];
    this.plugins.forEach((plugin) => {
      if (plugin.status === 'enabled' && plugin.commands) {
        commands.push(...plugin.commands);
      }
    });
    return commands;
  }

  async triggerHook(hookName: string): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.status === 'enabled' && plugin.permissions.hooks && plugin.hooks.has(hookName)) {
        const handlers = plugin.hooks.get(hookName)!;
        for (const handler of handlers) {
          try {
            await handler();
          } catch (error) {
            this.logger.error(`Hook ${hookName} failed in plugin ${plugin.manifest.metadata.id}: ${(error as Error).message}`);
          }
        }
      }
    }
  }

  setPluginPermissions(pluginId: string, permissions: string[]): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    const invalidPermissions = validatePermissions(permissions);
    if (invalidPermissions.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }
    
    this.config[pluginId] = this.config[pluginId] || { enabled: true, config: {}, permissions: [] };
    this.config[pluginId].permissions = permissions;
    plugin.permissions = parsePermissions(permissions);
  }
}

export const pluginManager = new PluginManager();