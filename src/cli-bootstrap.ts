import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultContext } from './infrastructure/context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  const ctx = getDefaultContext();
  const pkgPath = join(__dirname, '../package.json');
  const pkg = JSON.parse(ctx.environment.readFile(pkgPath));
  return pkg.version;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isVersionOnly = args.length === 1 && (args[0] === '--version' || args[0] === '-V');
  const isVersionCmd = args.length > 0 && args[0] === 'version' && args.every(arg => arg === 'version' || arg === '--json');

  if (isVersionOnly) {
    console.log(getVersion());
    return;
  }

  if (isVersionCmd) {
    const version = getVersion();
    if (args.includes('--json')) {
      console.log(JSON.stringify({ version, ok: true }));
    } else {
      console.log(`v${version}`);
    }
    return;
  }

  await import('./cli-main.js');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ ${message}`);
  process.exit(1);
});
