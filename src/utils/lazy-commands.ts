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
  config: LazyCommandConfig
): Promise<void> {
  try {
    const command = await loadCommandModule(config.modulePath, config.exportName);
    
    const registered = parent.addCommand(command, {
      hidden: config.hidden || false,
    });

    if (config.subcommands) {
      for (const subConfig of config.subcommands) {
        await registerLazyCommand(registered, subConfig);
      }
    }
  } catch (error) {
    console.error(`Failed to load command ${config.name}:`, (error as Error).message);
  }
}

export async function registerLazyCommands(
  program: Command,
  configs: LazyCommandConfig[]
): Promise<void> {
  await Promise.all(
    configs.map((config) => registerLazyCommand(program, config))
  );
}
