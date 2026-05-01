import { Command } from 'commander';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      process.exit(1);
    }

    const args = ['vitest', 'run'];
    if (options.coverage) {
      args.push('--coverage');
    }
    args.push(...patterns);

    const child = spawn('npx', args, {
      cwd: join(__dirname, '..', '..'),
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ All tests passed');
      } else {
        console.error(`\n❌ Tests failed with exit code ${code}`);
        process.exit(code || 1);
      }
    });
  });
