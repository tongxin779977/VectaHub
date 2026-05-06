export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error';

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  license?: string;
  keywords?: string[];
  dependencies?: string[];
}

export interface PluginHook {
  name: string;
  description?: string;
}

export interface PluginCommand {
  name: string;
  description: string;
  args?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  options?: Array<{
    name: string;
    description?: string;
    type?: 'string' | 'boolean' | 'number';
  }>;
  action: (args: Record<string, unknown>, options: Record<string, unknown>) => Promise<void> | void;
}

export interface PluginConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    default?: unknown;
    required?: boolean;
  };
}

export interface PluginManifest {
  metadata: PluginMetadata;
  hooks?: PluginHook[];
  commands?: PluginCommand[];
  configSchema?: PluginConfigSchema;
}

export interface PluginContext {
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    debug: (message: string) => void;
  };
  config: Record<string, unknown>;
  api: {
    version: string;
  };
}

export interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  config: Record<string, unknown>;
  hooks: Map<string, Array<() => void | Promise<void>>>;
  commands: PluginCommand[];
  activate: (context: PluginContext) => Promise<void>;
  deactivate: () => Promise<void>;
}

export interface PluginLoader {
  load(pluginPath: string): Promise<PluginInstance | null>;
  unload(pluginId: string): Promise<void>;
  list(): Promise<PluginInstance[]>;
}

export interface PluginRegistry {
  register(plugin: PluginInstance): void;
  unregister(pluginId: string): void;
  get(pluginId: string): PluginInstance | undefined;
  getAll(): PluginInstance[];
  enable(pluginId: string): void;
  disable(pluginId: string): void;
}
