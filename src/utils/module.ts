import { Command } from 'commander';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

interface ModuleConfig {
  name: string;
  files: string[];
}

const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  cli: { name: 'cli', files: ['src/cli.ts'] },
  nl: {
    name: 'nl',
    files: ['src/nl/parser.ts', 'src/nl/intent-matcher.ts', 'src/nl/templates/.gitkeep'],
  },
  workflow: { name: 'workflow', files: ['src/workflow/engine.ts'] },
  executor: { name: 'executor', files: ['src/workflow/executor.ts'] },
  sandbox: { name: 'sandbox', files: ['src/sandbox/detector.ts', 'src/sandbox/sandbox.ts'] },
  storage: { name: 'storage', files: ['src/workflow/storage.ts'] },
  utils: { name: 'utils', files: ['src/utils/logger.ts', 'src/utils/config.ts'] },
};

export const moduleCmd = new Command('module')
  .description('Generate module template')
  .argument('<module-name>', 'Name of the module to generate')
  .option('--agent <name>', 'Agent assigned to this module')
  .action(async (moduleName: string, options) => {
    const config = MODULE_CONFIGS[moduleName];

    if (!config) {
      console.error(`Unknown module: ${moduleName}`);
      console.log(`Available modules: ${Object.keys(MODULE_CONFIGS).join(', ')}`);
      process.exit(1);
    }

    console.log(`Generating module: ${moduleName}`);

    for (const file of config.files) {
      const filePath = join(process.cwd(), file);
      const dir = join(process.cwd(), file).replace(/\/[^/]+$/, '');

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      if (!existsSync(filePath)) {
        writeFileSync(filePath, getSkeletonCode(file, moduleName));
        console.log(`  ✅ Created: ${file}`);
      } else {
        console.log(`  ⚠️  Skipped (exists): ${file}`);
      }
    }

    console.log(`\nModule "${moduleName}" template generated successfully.`);
  });

function getSkeletonCode(filePath: string, moduleName: string): string {
  if (filePath.endsWith('.ts')) {
    return `// ${moduleName} module skeleton\n// TODO: Implement module functionality\nexport function ${moduleName.replace(/-/g, '_')}_placeholder() {\n  throw new Error('Not implemented');\n}\n`;
  }
  return '';
}