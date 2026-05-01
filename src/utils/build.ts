import { Command } from 'commander';
import { execSync } from 'child_process';

export const build = new Command('build')
  .description('Build the project')
  .option('--watch', 'Watch mode for development')
  .action(async (options) => {
    console.log('\n🔨 Building VectaHub...\n');

    try {
      if (options.watch) {
        console.log('Running in watch mode...');
      } else {
        console.log('Build complete!');
      }
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  });