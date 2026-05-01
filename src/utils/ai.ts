import { Command } from 'commander';
import { EnvironmentDetector } from '../workflow/ai-env-detector.js';
import { ProviderRegistry } from '../workflow/ai-provider-registry.js';
import { FallbackStrategy } from '../workflow/ai-fallback-strategy.js';
import { loadAIConfig, saveAIConfig, getDefaultAIConfig } from '../utils/ai-config.js';
import { delegateExecutor } from '../workflow/ai-delegate.js';
import type { AIDelegateProvider } from '../workflow/ai-delegate.js';

export const aiCmd = new Command('ai')
  .description('AI CLI environment management commands');

function formatEnvironmentReport(report: any): string {
  const lines = [
    '📊 Environment Report:',
    '─'.repeat(50),
    `Scanned at: ${report.scannedAt.toLocaleString()}`,
    `Total available: ${report.totalAvailable}`,
    `Recommended: ${report.recommendedProvider}`,
  ];

  if (report.warnings.length > 0) {
    lines.push('\n⚠️  Warnings:');
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  
  return lines.join('\n');
}

function formatProviderList(available: any[]): string {
  if (available.length === 0) {
    return [
      '⚠️  No AI CLI tools detected.',
      '   Install an AI CLI tool for better experience:',
      '   - gemini: npm install -g @google/gemini-cli',
      '   - claude: npm install -g @anthropic-ai/claude-code',
      '   - codex: npm install -g @openai/codex',
    ].join('\n');
  }

  const lines = available.map(provider => {
    const version = provider.version ? ` v${provider.version}` : '';
    return `✅ ${provider.name}${version} (priority: ${provider.priority})`;
  });

  return lines.join('\n');
}

function formatTestResult(provider: string, target: any, result?: any, error?: any): string {
  const lines = [
    `\n🧪 Testing ${provider}...`,
    '─'.repeat(50),
    `Status: ${target.status}`,
    `Version: ${target.version || 'N/A'}`,
  ];

  if (target.missingRequirements) {
    lines.push(`Missing: ${target.missingRequirements.join(', ')}`);
  }

  if (target.status === 'available') {
    if (result) {
      if (result.success) {
        lines.push(`\n✅ Provider is available. Running test task...`);
        lines.push(`✅ Test completed (${result.duration}ms)`);
        lines.push(`Output: ${result.output?.substring(0, 100)}`);
      } else {
        lines.push(`\n✅ Provider is available. Running test task...`);
        lines.push(`❌ Test failed: ${result.error}`);
      }
    } else if (error) {
      lines.push(`\n✅ Provider is available. Running test task...`);
      lines.push(`❌ Test error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    lines.push('\n❌ Provider is not available. Cannot test.');
  }

  return lines.join('\n');
}

function formatAIConfig(config: any): string {
  return [
    '\n⚙️  AI Configuration:',
    '─'.repeat(50),
    `Environment Scan: ${config.environment_scan.enabled ? 'Enabled' : 'Disabled'}`,
    `Auto Fallback: ${config.fallback.auto_fallback ? 'Enabled' : 'Disabled'}`,
    `Prompt Before Switch: ${config.fallback.prompt_before_switch ? 'Yes' : 'No'}`,
    `Max Fallback Attempts: ${config.fallback.max_attempts}`,
    `Built-in AI: ${config.built_in_ai.enabled ? 'Enabled' : 'Disabled'}`,
    `Model: ${config.built_in_ai.model}`,
    '',
  ].join('\n');
}

function formatFallbackPaths(registry: ProviderRegistry): string {
  const lines = ['\n🔄 Fallback Paths:', '─'.repeat(50)];

  for (const provider of registry.getAllProviders().sort((a, b) => b.priority - a.priority)) {
    const fallbacks = registry.getFallbackTargets(provider.name);
    const status = provider.status === 'available' ? '✅' : '❌';
    lines.push(`${status} ${provider.name} → ${fallbacks.join(' → ')}`);
  }

  return lines.join('\n') + '\n';
}

aiCmd
  .command('status')
  .description('Show current AI CLI environment status')
  .option('-v, --verbose', 'Show detailed report')
  .option('-f, --force', 'Force rescan')
  .action(async (options) => {
    const detector = new EnvironmentDetector();
    const report = await detector.scan(options.force);
    const registry = new ProviderRegistry(report);

    registry.printStatus();

    if (options.verbose) {
      console.log(formatEnvironmentReport(report));
    }
  });

aiCmd
  .command('rescan')
  .description('Rescan AI CLI environment')
  .action(async () => {
    console.log('🔄 Rescanning AI CLI environment...');

    const detector = new EnvironmentDetector();
    detector.clearCache();

    const report = await detector.scan(true);
    const registry = new ProviderRegistry(report);

    console.log(`✅ Rescan complete: ${report.totalAvailable} providers available`);
    registry.printStatus();
  });

aiCmd
  .command('list')
  .description('List all available AI providers')
  .action(async () => {
    const detector = new EnvironmentDetector();
    const report = await detector.scan();
    const registry = new ProviderRegistry(report);

    console.log('\n🤖 Available AI Providers:');
    console.log('─'.repeat(50));

    const available = registry.getAvailableProviders();
    console.log(formatProviderList(available));

    console.log(`\n🎯 Recommended: ${registry.getRecommendedProvider()}\n`);
  });

aiCmd
  .command('test <provider>')
  .description('Test a specific AI provider')
  .action(async (provider: string) => {
    const detector = new EnvironmentDetector();
    const report = await detector.scan();
    const registry = new ProviderRegistry(report);

    const target = registry.getProvider(provider);
    if (!target) {
      console.error(`❌ Unknown provider: ${provider}`);
      console.log('Available providers:', registry.getAllProviders().map(p => p.name).join(', '));
      process.exit(1);
    }

    if (target.status === 'available') {
      try {
        const result = await delegateExecutor.delegate({
          provider: provider as AIDelegateProvider,
          prompt: 'Say "Hello from VectaHub!" and nothing else.',
          timeout: 10000,
        });

        console.log(formatTestResult(provider, target, result));
      } catch (error) {
        console.log(formatTestResult(provider, target, undefined, error));
      }
    } else {
      console.log(formatTestResult(provider, target));
    }
    console.log('');
  });

aiCmd
  .command('config')
  .description('Manage AI configuration')
  .argument('[key]', 'Config key (e.g., fallback.auto_fallback)')
  .argument('[value]', 'Config value')
  .option('--show', 'Show current configuration')
  .option('--reset', 'Reset to default configuration')
  .action(async (key?: string, value?: string, options?: { show?: boolean; reset?: boolean }) => {
    if (options?.reset) {
      const defaultConfig = getDefaultAIConfig();
      await saveAIConfig(defaultConfig);
      console.log('✅ Configuration reset to defaults');
      return;
    }

    if (options?.show || (!key && !value)) {
      const config = await loadAIConfig();
      console.log(formatAIConfig(config));
      return;
    }

    if (key && value !== undefined) {
      const config = await loadAIConfig();
      const parts = key.split('.');

      if (parts.length === 2) {
        const section = parts[0] as keyof typeof config;
        const setting = parts[1];

        if (config[section] && typeof config[section] === 'object') {
          const sectionObj = config[section] as any;
          if (setting in sectionObj) {
            const currentValue = sectionObj[setting];
            if (typeof currentValue === 'boolean') {
              sectionObj[setting] = value.toLowerCase() === 'true';
            } else if (typeof currentValue === 'number') {
              sectionObj[setting] = parseInt(value, 10);
            } else {
              sectionObj[setting] = value;
            }

            await saveAIConfig(config);
            console.log(`✅ Updated ${key} = ${sectionObj[setting]}`);
          } else {
            console.error(`❌ Unknown setting: ${key}`);
            process.exit(1);
          }
        }
      } else {
        console.error('❌ Invalid key format. Use section.setting (e.g., fallback.auto_fallback)');
        process.exit(1);
      }
    }
  });

aiCmd
  .command('fallback')
  .description('Show fallback paths for providers')
  .action(async () => {
    const detector = new EnvironmentDetector();
    const report = await detector.scan();
    const registry = new ProviderRegistry(report);

    console.log(formatFallbackPaths(registry));
  });
