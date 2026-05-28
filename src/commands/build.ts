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

/**
 * 创建构建命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 * @throws VectaHubError 如果入口文件不存在或构建失败
 */
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
      } catch (error) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        throw new VectaHubError(`Build failed: ${originalMessage}`, ErrorType.RUNTIME);
      }
    });
}
