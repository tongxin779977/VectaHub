import { Command } from 'commander';
import { parse } from 'yaml';
import { getDefaultContext } from '../infrastructure/context.js';

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

function findConfigFile(): string | null {
  const ctx = getDefaultContext();
  const searchPaths = [
    ctx.environment.resolvePath(ctx.environment.getCwd(), 'config/vectahub-dev.config.yaml'),
    ctx.environment.resolvePath(ctx.environment.getCwd(), 'vectahub-dev.config.yaml'),
    ctx.environment.getPath('vectahub-dev.config.yaml'),
  ];
  
  for (const path of searchPaths) {
    if (ctx.environment.exists(path)) {
      return path;
    }
  }
  
  return null;
}

export const status = new Command('status')
  .description('View project development progress')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const ctx = getDefaultContext();
    const configPath = findConfigFile();

    if (!configPath) {
      console.log('No vectahub-dev.config.yaml found. Search paths:');
      console.log('  - ./config/vectahub-dev.config.yaml');
      console.log('  - ./vectahub-dev.config.yaml');
      console.log('  - ~/.vectahub/vectahub-dev.config.yaml');
      console.log('\nRun "vectahub dev init" first.');
      return;
    }

    const content = ctx.environment.readFile(configPath);
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
