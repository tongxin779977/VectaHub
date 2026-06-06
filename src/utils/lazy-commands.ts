import { Command } from 'commander';

export interface LazyCommandModule {
  default?: Command;
  [key: string]: Command | undefined;
}

export interface LazyCommandConfig {
  name: string;
  description: string;
  modulePath: string;
  exportName?: string;
  hidden?: boolean;
  subcommands?: LazyCommandConfig[];
}

export interface RegisterLazyCommandOptions {
  onLoadError?: (config: LazyCommandConfig, error: Error) => void;
}

export async function loadCommandModule(modulePath: string, exportName?: string): Promise<Command> {
  const module = await import(modulePath);
  const command = exportName ? module[exportName] : module.default;
  if (!command) {
    throw new Error(`Command not found in module: ${modulePath}${exportName ? ` (export: ${exportName})` : ''}`);
  }
  return command;
}

export async function registerLazyCommand(
  parent: Command,
  config: LazyCommandConfig,
  options: RegisterLazyCommandOptions = {},
): Promise<void> {
  try {
    const command = await loadCommandModule(config.modulePath, config.exportName);
    
    const registered = parent.addCommand(command, {
      hidden: config.hidden || false,
    });

    if (config.subcommands) {
      for (const subConfig of config.subcommands) {
        await registerLazyCommand(registered, subConfig, options);
      }
    }
  } catch (error) {
    const loadError = error instanceof Error ? error : new Error(String(error));
    if (options.onLoadError) {
      options.onLoadError(config, loadError);
      return;
    }
    throw new Error(`Failed to load command ${config.name}: ${loadError.message}`, { cause: error });
  }
}

export async function registerLazyCommands(
  program: Command,
  configs: LazyCommandConfig[],
  options: RegisterLazyCommandOptions = {},
): Promise<void> {
  await Promise.all(
    configs.map((config) => registerLazyCommand(program, config, options))
  );
}
