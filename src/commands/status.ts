import { Command } from 'commander';
import { format } from 'node:util';
import { parse } from 'yaml';
import type { InfrastructureContext } from '../infrastructure/context.js';

interface StatusCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  json(payload: unknown, options?: { space?: number }): void;
}

function createStatusCommandOutput(): StatusCommandOutput {
  const formatMessage = (message?: unknown, optionalParams: unknown[] = []): string => {
    if (message === undefined && optionalParams.length === 0) {
      return '';
    }
    return format(message, ...optionalParams);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${formatMessage(message, optionalParams)}\n`);
    },
    json(payload: unknown, options?: { space?: number }): void {
      process.stdout.write(`${JSON.stringify(payload, null, options?.space ?? 2)}\n`);
    },
  };
}

interface ModuleStatus {
  name: string;
  agent: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'review';
  progress: number;
  dependencies: string[];
}

interface Config {
  modules: ModuleStatus[];
  overallProgress: number;
}

function isValidModuleStatus(obj: unknown): obj is ModuleStatus {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    typeof record.agent === 'string' &&
    typeof record.status === 'string' &&
    ['pending', 'in_progress', 'completed', 'blocked', 'review'].includes(record.status) &&
    typeof record.progress === 'number' &&
    Array.isArray(record.dependencies) &&
    record.dependencies.every((dep: unknown) => typeof dep === 'string')
  );
}

function isValidConfig(obj: unknown): obj is Config {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return (
    Array.isArray(record.modules) &&
    record.modules.every(isValidModuleStatus) &&
    typeof record.overallProgress === 'number'
  );
}

function findConfigFile(context: InfrastructureContext): string | null {
  const searchPaths = [
    context.environment.resolvePath(context.environment.getCwd(), 'config/vectahub-dev.config.yaml'),
    context.environment.resolvePath(context.environment.getCwd(), 'vectahub-dev.config.yaml'),
    context.environment.getPath('vectahub-dev.config.yaml'),
  ];

  for (const path of searchPaths) {
    if (context.environment.exists(path)) {
      return path;
    }
  }

  return null;
}

/**
 * 创建状态命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createStatusCmd(context: InfrastructureContext): Command {
  const output = createStatusCommandOutput();

  return new Command('status')
    .description('View project development progress')
    .option('--json', 'Output in JSON format')
    .action(async (options: { json?: boolean }) => {
      const configPath = findConfigFile(context);

      if (!configPath) {
        output.log('No vectahub-dev.config.yaml found. Search paths:');
        output.log('  - ./config/vectahub-dev.config.yaml');
        output.log('  - ./vectahub-dev.config.yaml');
        output.log('  - ~/.vectahub/vectahub-dev.config.yaml');
        output.log('\nRun "vectahub dev init" first.');
        return;
      }

      const content = context.environment.readFile(configPath);
      const parsed = parse(content);
      if (!isValidConfig(parsed)) {
        output.log('Error: Invalid configuration file format.');
        output.log('Expected a YAML file with "modules" array and "overallProgress" number.');
        return;
      }
      const config = parsed;

      if (options.json) {
        output.json(config, { space: 2 });
      } else {
        output.log('\n📊 VectaHub Development Progress\n');
        output.log('Module       | Agent    | Status       | Progress');
        output.log('-------------|----------|--------------|----------');

        for (const mod of config.modules) {
          const progressBar = '█'.repeat(Math.floor(mod.progress / 10)) + '░'.repeat(10 - Math.floor(mod.progress / 10));
          output.log(
            `${mod.name.padEnd(12)} | ${mod.agent.padEnd(8)} | ${mod.status.padEnd(12)} | ${progressBar} ${mod.progress}%`
          );
        }

        const totalProgress = config.modules.reduce((sum, m) => sum + m.progress, 0) / config.modules.length;
        output.log(`\nOverall Progress: ${totalProgress.toFixed(0)}%`);
      }
    });
}
