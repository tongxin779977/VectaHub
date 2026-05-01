import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export const build = new Command('build')
  .description('Build the project')
  .option('--watch', 'Watch mode for development')
  .action(async (options) => {
    console.log('\n🔨 Building VectaHub...\n');

    const entryFile = 'src/cli.ts';
    const outDir = 'dist';

    if (!existsSync(entryFile)) {
      console.error(`❌ Entry file not found: ${entryFile}`);
      process.exit(1);
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
      console.error('\n❌ Build failed');
      process.exit(1);
    }
  });
