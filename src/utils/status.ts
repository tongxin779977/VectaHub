import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

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

export const status = new Command('status')
  .description('View project development progress')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const configPath = join(process.cwd(), 'vectahub-dev.config.yaml');

    if (!existsSync(configPath)) {
      console.log('No vectahub-dev.config.yaml found. Run "vectahub dev init" first.');
      return;
    }

    const content = readFileSync(configPath, 'utf-8');
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
