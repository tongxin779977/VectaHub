import { Command } from 'commander';
import { getDefaultContext, VectaHubError, ErrorType } from '../infrastructure/index.js';

const ctx = getDefaultContext();

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

export const test = new Command('test')
  .description('Run module unit tests')
  .argument('[module-name]', 'Specific module to test', 'all')
  .option('--coverage', 'Show test coverage report')
  .action(async (moduleName: string, options: { coverage?: boolean }) => {
    console.log(`\n🧪 Running ${moduleName === 'all' ? 'all' : moduleName} module tests...\n`);

    const patterns = moduleMap[moduleName];
    if (!patterns) {
      console.error(`❌ Module "${moduleName}" not found.`);
      console.error('Available modules:', Object.keys(moduleMap).join(', '));
      throw new VectaHubError(`Module "${moduleName}" not found.`, ErrorType.RUNTIME);
    }

    const args = ['vitest', 'run'];
    if (options.coverage) {
      args.push('--coverage');
    }
    args.push(...patterns);

    const child = ctx.environment.spawn('npx', args, {
      cwd: ctx.environment.getCwd(),
      stdio: 'inherit',
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        console.log('\n✅ All tests passed');
      } else {
        throw new VectaHubError(`Tests failed with exit code ${code}`, ErrorType.RUNTIME);
      }
    });
  });
