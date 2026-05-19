import { Command } from 'commander';
import { join } from 'path';
import { execSync } from 'child_process';
import { VectaHubError, ErrorType, getDefaultContext } from '../infrastructure/index.js';

export const build = new Command('build')
  .description('Build the project')
  .option('--watch', 'Watch mode for development')
  .action(async (options) => {
    const environment = getDefaultContext().environment;
    console.log('\n🔨 Building VectaHub...\n');

    const entryFile = 'src/cli.ts';
    const outDir = 'dist';

    if (!environment.exists(entryFile)) {
      throw new VectaHubError(`Entry file not found: ${entryFile}`, ErrorType.RUNTIME);
    }

    try {
      const tsupCmd = options.watch
        ? `npx tsup ${entryFile} --format esm,cjs --dts --watch`
        : `npx tsup ${entryFile} --format esm,cjs --dts`;

      console.log(`Running: ${tsupCmd}\n`);
      execSync(tsupCmd, { stdio: 'inherit' });

      console.log('\n✅ Build complete!');
      console.log(`   Output: ${outDir}/`);
    } catch (error) {
      throw new VectaHubError('Build failed', ErrorType.RUNTIME);
    }
  });
