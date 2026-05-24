import { Command } from 'commander';
import { format } from 'node:util';
import type { InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

interface BuildCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
}

function createBuildCommandOutput(): BuildCommandOutput {
  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${format(message, ...optionalParams)}\n`);
    },
  };
}

export function createBuildCmd(context: InfrastructureContext): Command {
  const output = createBuildCommandOutput();

  return new Command('build')
    .description('Build the project')
    .option('--watch', 'Watch mode for development')
    .action(async (options) => {
      const environment = context.environment;
      output.log('\n🔨 Building VectaHub...\n');

      const entryFile = 'src/cli.ts';
      const outDir = 'dist';

      if (!environment.exists(entryFile)) {
        throw new VectaHubError(`Entry file not found: ${entryFile}`, ErrorType.RUNTIME);
      }

      try {
        const tsupCmd = options.watch
          ? `npx tsup ${entryFile} --format esm,cjs --dts --watch`
          : `npx tsup ${entryFile} --format esm,cjs --dts`;

        output.log(`Running: ${tsupCmd}\n`);
        const [cmd, ...args] = tsupCmd.split(' ');
        const child = environment.spawn(cmd, args, { stdio: 'inherit' });
        await new Promise<void>((resolve, reject) => {
          child.on('exit', (code: number) => {
            if (code === 0) resolve();
            else reject(new Error(`Exit code ${code}`));
          });
          child.on('error', reject);
        });

        output.log('\n✅ Build complete!');
        output.log(`   Output: ${outDir}/`);
      } catch {
        throw new VectaHubError('Build failed', ErrorType.RUNTIME);
      }
    });
}
