import { Command } from 'commander';
import { parse } from 'yaml';
import type { InfrastructureContext } from '../infrastructure/context.js';

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

export function createStatusCmd(context: InfrastructureContext): Command {
  return new Command('status')
    .description('View project development progress')
    .option('--json', 'Output in JSON format')
    .action(async (options: { json?: boolean }) => {
      const configPath = findConfigFile(context);

      if (!configPath) {
        console.log('No vectahub-dev.config.yaml found. Search paths:');
        console.log('  - ./config/vectahub-dev.config.yaml');
        console.log('  - ./vectahub-dev.config.yaml');
        console.log('  - ~/.vectahub/vectahub-dev.config.yaml');
        console.log('\nRun "vectahub dev init" first.');
        return;
      }

      const content = context.environment.readFile(configPath);
      const config = parse(content) as Config;

      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log('\n📊 VectaHub Development Progress\n');
        console.log('Module       | Agent    | Status       | Progress');
        console.log('-------------|----------|--------------|----------');

        for (const mod of config.modules) {
          const progressBar = '█'.repeat(Math.floor(mod.progress / 10)) + '░'.repeat(10 - Math.floor(mod.progress / 10));
          console.log(
            `${mod.name.padEnd(12)} | ${mod.agent.padEnd(8)} | ${mod.status.padEnd(12)} | ${progressBar} ${mod.progress}%`
          );
        }

        const totalProgress = config.modules.reduce((sum, m) => sum + m.progress, 0) / config.modules.length;
        console.log(`\nOverall Progress: ${totalProgress.toFixed(0)}%`);
      }
    });
}
