import { Command } from 'commander';
import { getDefaultContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

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
      const [cmd, ...args] = tsupCmd.split(' ');
      const child = environment.spawn(cmd, args, { stdio: 'inherit' });
      await new Promise<void>((resolve, reject) => {
        child.on('exit', (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`Exit code ${code}`));
        });
        child.on('error', reject);
      });

      console.log('\n✅ Build complete!');
      console.log(`   Output: ${outDir}/`);
    } catch {
      throw new VectaHubError('Build failed', ErrorType.RUNTIME);
    }
  });
