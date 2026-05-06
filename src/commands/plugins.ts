import { Command } from 'commander';
import { pluginManager } from '../plugins/plugin-manager.js';
import { createConsoleLogger } from '../utils/logger.js';
import { type PluginInstance } from '../plugins/plugin-api.js';

const logger = createConsoleLogger('plugins');

function formatPluginTable(plugins: PluginInstance[]): void {
  if (plugins.length === 0) {
    logger.info('  (no plugins installed)');
    return;
  }
  
  const statusColors: Record<string, string> = {
    enabled: '\x1b[32menabled\x1b[0m',
    disabled: '\x1b[33mdisabled\x1b[0m',
    installed: '\x1b[34minstalled\x1b[0m',
    error: '\x1b[31merror\x1b[0m',
  };
  
  console.log(`  ${'ID'.padEnd(20)} ${'Name'.padEnd(20)} ${'Version'.padEnd(10)} ${'Status'.padEnd(12)} Description`);
  console.log(`  ${'─'.repeat(20)} ${'─'.repeat(20)} ${'─'.repeat(10)} ${'─'.repeat(12)} ${'─'.repeat(40)}`);
  
  for (const plugin of plugins) {
    const status = statusColors[plugin.status] || plugin.status;
    console.log(
      `  ${plugin.manifest.metadata.id.padEnd(20)} ${plugin.manifest.metadata.name.padEnd(20)} ${plugin.manifest.metadata.version.padEnd(10)} ${status.padEnd(12)} ${plugin.manifest.metadata.description}`
    );
  }
}

export const pluginsCmd = new Command('plugins')
  .description('Manage VectaHub plugins')
  .command('list')
  .description('List all installed plugins')
  .action(async () => {
    await pluginManager.loadPlugins();
    const plugins = pluginManager.getAllPlugins();
    logger.info('\nInstalled plugins:\n');
    formatPluginTable(plugins);
    console.log(`\nTotal: ${plugins.length} plugin(s)`);
  })
  .command('enable')
  .description('Enable a plugin')
  .argument('<plugin-id>', 'Plugin ID')
  .action(async (pluginId: string) => {
    try {
      await pluginManager.enablePlugin(pluginId);
      logger.info(`\n✅ Plugin enabled: ${pluginId}`);
    } catch (error) {
      logger.error(`Failed to enable plugin: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('disable')
  .description('Disable a plugin')
  .argument('<plugin-id>', 'Plugin ID')
  .action(async (pluginId: string) => {
    try {
      await pluginManager.disablePlugin(pluginId);
      logger.info(`\n✅ Plugin disabled: ${pluginId}`);
    } catch (error) {
      logger.error(`Failed to disable plugin: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('uninstall')
  .description('Uninstall a plugin')
  .argument('<plugin-id>', 'Plugin ID')
  .action(async (pluginId: string) => {
    try {
      await pluginManager.uninstallPlugin(pluginId);
      logger.info(`\n✅ Plugin uninstalled: ${pluginId}`);
    } catch (error) {
      logger.error(`Failed to uninstall plugin: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('update')
  .description('Update a plugin')
  .argument('<plugin-id>', 'Plugin ID')
  .action(async (pluginId: string) => {
    try {
      await pluginManager.updatePlugin(pluginId);
      logger.info(`\n✅ Plugin updated: ${pluginId}`);
    } catch (error) {
      logger.error(`Failed to update plugin: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('info')
  .description('Show detailed information about a plugin')
  .argument('<plugin-id>', 'Plugin ID')
  .action(async (pluginId: string) => {
    await pluginManager.loadPlugins();
    const plugin = pluginManager.getPlugin(pluginId);
    
    if (!plugin) {
      logger.error(`Plugin not found: ${pluginId}`);
      process.exit(1);
    }
    
    const manifest = plugin.manifest.metadata;
    logger.info(`\nPlugin Details:\n`);
    console.log(`  ID: ${manifest.id}`);
    console.log(`  Name: ${manifest.name}`);
    console.log(`  Version: ${manifest.version}`);
    console.log(`  Author: ${manifest.author}`);
    console.log(`  Description: ${manifest.description}`);
    if (manifest.homepage) console.log(`  Homepage: ${manifest.homepage}`);
    if (manifest.license) console.log(`  License: ${manifest.license}`);
    if (manifest.keywords) console.log(`  Keywords: ${manifest.keywords.join(', ')}`);
    console.log(`  Status: ${plugin.status}`);
    
    if (plugin.commands && plugin.commands.length > 0) {
      console.log('\n  Commands:');
      plugin.commands.forEach(cmd => {
        console.log(`    - ${cmd.name}: ${cmd.description}`);
      });
    }
    
    console.log();
  });
