import { Command } from 'commander';
import { format } from 'node:util';
import type { InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

interface TestCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

function createTestCommandOutput(): TestCommandOutput {
  const writeLine = (stream: NodeJS.WriteStream, message?: unknown, optionalParams: unknown[] = []): void => {
    stream.write(`${format(message, ...optionalParams)}\n`);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stdout, message, optionalParams);
    },
    error(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
  };
}

const moduleMap: Record<string, string[]> = {
  cli: ['src/cli.test.ts'],
  nl: ['src/nl/parser.test.ts', 'src/nl/intent-matcher.test.ts', 'src/nl/command-synthesizer.test.ts', 'src/nl/entity-extractor.test.ts'],
  workflow: ['src/workflow/engine.test.ts', 'src/workflow/storage.test.ts'],
  executor: ['src/workflow/executor.test.ts'],
  sandbox: ['src/sandbox/detector.test.ts', 'src/sandbox/sandbox.test.ts'],
  storage: ['src/workflow/storage.test.ts'],
  utils: ['src/utils/*.test.ts'],
  all: ['src/**/*.test.ts'],
};

/**
 * 创建测试命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createTestCmd(context: InfrastructureContext): Command {
  const cliOutput = createTestCommandOutput();

  return new Command('test')
    .description('Run module unit tests')
    .argument('[module-name]', 'Specific module to test', 'all')
    .option('--coverage', 'Show test coverage report')
    .action(async (moduleName: string, options: { coverage?: boolean }) => {
      cliOutput.log(`\n🧪 Running ${moduleName === 'all' ? 'all' : moduleName} module tests...\n`);

      const patterns = moduleMap[moduleName];
      if (!patterns) {
        cliOutput.error(`❌ Module "${moduleName}" not found.`);
        cliOutput.error('Available modules:', Object.keys(moduleMap).join(', '));
        throw new VectaHubError(`Module "${moduleName}" not found.`, ErrorType.RUNTIME);
      }

      const args = ['vitest', 'run'];
      if (options.coverage) {
        args.push('--coverage');
      }
      args.push(...patterns);

      const child = context.environment.spawn('npx', args, {
        cwd: context.environment.getCwd(),
        stdio: 'inherit',
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          cliOutput.log('\n✅ All tests passed');
        } else {
          throw new VectaHubError(`Tests failed with exit code ${code}`, ErrorType.RUNTIME);
        }
      });
    });
}
