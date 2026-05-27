import { Command } from 'commander';
import { format } from 'node:util';
import { getProviderRegistrar, loadProvidersFromConfig } from '../agent-runtime/provider-registrar.js';
import { getAgentRegistry } from '../agent-runtime/registry.js';
import type { AgentDescriptor } from '../types/agent.js';
import type { InfrastructureContext } from '../infrastructure/context.js';

interface ProviderCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
  json(payload: unknown, options?: { space?: number }): void;
}

function createProviderCommandOutput(): ProviderCommandOutput {
  const writeLine = (stream: NodeJS.WriteStream, message?: unknown, optionalParams: unknown[] = []): void => {
    stream.write(`${format(message, ...optionalParams)}\n`);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stdout, message, optionalParams);
    },
    warn(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
    error(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
    json(payload: unknown, options?: { space?: number }): void {
      process.stdout.write(`${JSON.stringify(payload, null, options?.space ?? 2)}\n`);
    },
  };
}

function formatProviderList(descriptors: AgentDescriptor[]): string {
  if (descriptors.length === 0) {
    return '\n⚠️  No providers registered.\n';
  }

  const lines = ['\n📦 Registered Providers:', '─'.repeat(80)];

  for (const descriptor of descriptors) {
    lines.push(`${descriptor.id.padEnd(20)} ${descriptor.displayName}`);
    if (descriptor.description) {
      lines.push(`  ${descriptor.description}`);
    }
    lines.push(`  Command: ${descriptor.entryCommand}`);
    lines.push(`  Transport: ${descriptor.promptTransport}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatProviderDetail(descriptor: AgentDescriptor): string {
  const lines = [
    `\n📦 ${descriptor.displayName}`,
    '─'.repeat(80),
    `ID: ${descriptor.id}`,
    `Command: ${descriptor.entryCommand}`,
  ];

  if (descriptor.subcommand) {
    lines.push(`Subcommand: ${descriptor.subcommand}`);
  }

  lines.push(`Prompt Transport: ${descriptor.promptTransport}`);

  if (descriptor.promptArgName) {
    lines.push(`Prompt Arg: ${descriptor.promptArgName}`);
  }

  if (descriptor.workingDirectoryArg) {
    lines.push(`Working Directory Arg: ${descriptor.workingDirectoryArg}`);
  }

  if (descriptor.nonInteractiveFlags.length > 0) {
    lines.push(`Non-Interactive Flags: ${descriptor.nonInteractiveFlags.join(', ')}`);
  }

  if (descriptor.description) {
    lines.push(`\nDescription: ${descriptor.description}`);
  }

  if (descriptor.usageHabits) {
    lines.push(`\nUsage Habits: ${descriptor.usageHabits}`);
  }

  lines.push('');

  return lines.join('\n');
}

function formatTestResult(providerId: string, result: { available: boolean; version?: string; error?: string }): string {
  if (result.available) {
    const versionStr = result.version ? ` (${result.version})` : '';
    return `\n✅ ${providerId} is available${versionStr}\n`;
  } else {
    return `\n❌ ${providerId} is not available: ${result.error || 'Unknown error'}\n`;
  }
}

export function createProviderCmd(context: InfrastructureContext): Command {
  const cliOutput = createProviderCommandOutput();
  const providerCmd = new Command('provider')
    .description('AI Provider management commands');

  providerCmd
    .command('list')
    .description('List all registered providers')
    .option('--json', 'Output results in JSON format')
    .action(async (options: { json?: boolean }) => {
      await loadProvidersFromConfig();
      const registrar = getProviderRegistrar();
      const descriptors = registrar.list();

      if (options.json) {
        cliOutput.json({
          ok: true,
          providers: descriptors.map(d => ({
            id: d.id,
            displayName: d.displayName,
            entryCommand: d.entryCommand,
            promptTransport: d.promptTransport,
            description: d.description,
          }))
        });
      } else {
        cliOutput.log(formatProviderList(descriptors));
      }
    });

  providerCmd
    .command('add <cliCommand>')
    .description('Register a new provider from CLI command')
    .option('-n, --name <displayName>', 'Display name for the provider')
    .option('-d, --description <description>', 'Description for the provider')
    .option('--json', 'Output results in JSON format')
    .action(async (cliCommand: string, options: { name?: string; description?: string; json?: boolean }) => {
      const registrar = getProviderRegistrar();

      cliOutput.log(`\n🔍 Detecting CLI: ${cliCommand}...`);

      const result = await registrar.register({
        cliCommand,
        displayName: options.name,
        description: options.description,
      });

      if (options.json) {
        cliOutput.json(result);
        return;
      }

      if (result.success) {
        cliOutput.log(`\n✅ Successfully registered provider: ${result.providerId}`);
        if (result.descriptor) {
          cliOutput.log(formatProviderDetail(result.descriptor));
        }
      } else {
        cliOutput.error(`\n❌ Failed to register provider: ${result.error}`);
      }
    });

  providerCmd
    .command('remove <providerId>')
    .description('Remove a registered provider')
    .option('--json', 'Output results in JSON format')
    .action(async (providerId: string, options: { json?: boolean }) => {
      const registrar = getProviderRegistrar();

      const success = await registrar.unregister(providerId);

      if (options.json) {
        cliOutput.json({ ok: success, providerId });
        return;
      }

      if (success) {
        cliOutput.log(`\n✅ Successfully removed provider: ${providerId}`);
      } else {
        cliOutput.error(`\n❌ Provider not found: ${providerId}`);
      }
    });

  providerCmd
    .command('test <providerId>')
    .description('Test if a provider is available')
    .option('--json', 'Output results in JSON format')
    .action(async (providerId: string, options: { json?: boolean }) => {
      const registrar = getProviderRegistrar();

      const result = await registrar.test(providerId);

      if (options.json) {
        cliOutput.json({ ok: true, providerId, ...result });
        return;
      }

      cliOutput.log(formatTestResult(providerId, result));
    });

  providerCmd
    .command('info <providerId>')
    .description('Show detailed provider information')
    .option('--json', 'Output results in JSON format')
    .action(async (providerId: string, options: { json?: boolean }) => {
      const registry = getAgentRegistry();
      const descriptor = registry.getAgentDescriptor(providerId);

      if (!descriptor) {
        cliOutput.error(`\n❌ Provider not found: ${providerId}`);
        return;
      }

      if (options.json) {
        cliOutput.json({ ok: true, provider: descriptor });
        return;
      }

      cliOutput.log(formatProviderDetail(descriptor));
    });

  providerCmd
    .command('refresh <providerId>')
    .description('Refresh provider configuration')
    .option('--json', 'Output results in JSON format')
    .action(async (providerId: string, options: { json?: boolean }) => {
      const registrar = getProviderRegistrar();

      cliOutput.log(`\n🔄 Refreshing provider: ${providerId}...`);

      const result = await registrar.refresh(providerId);

      if (options.json) {
        cliOutput.json(result);
        return;
      }

      if (result.success) {
        cliOutput.log(`\n✅ Successfully refreshed provider: ${providerId}`);
        if (result.descriptor) {
          cliOutput.log(formatProviderDetail(result.descriptor));
        }
      } else {
        cliOutput.error(`\n❌ Failed to refresh provider: ${result.error}`);
      }
    });

  return providerCmd;
}
