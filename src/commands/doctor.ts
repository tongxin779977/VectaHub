import { Command } from 'commander';
import type { InfrastructureContext } from '../infrastructure/context.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { createCliOutput } from '../infrastructure/cli-output.js';

const join = (environment: IEnvironmentService, ...args: string[]) => environment.joinPath(...args);

async function execWithTimeout(environment: IEnvironmentService, command: string, timeoutMs = 5000): Promise<{ stdout: string; stderr: string }> {
  const result = await environment.exec(command, { timeout: timeoutMs });
  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}

function formatDoctorResults(checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[]): string {
  const lines = ['\n🔍 VectaHub Doctor\n' + '─'.repeat(50)];

  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
    lines.push(`${icon} ${check.name.padEnd(20)} ${check.message}`);
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;

  lines.push('\n' + '─'.repeat(50));
  lines.push(`Results: ${passed} passed, ${warnings} warnings, ${failed} failed`);

  if (failed > 0) {
    lines.push('\n❌ Some checks failed. Please fix the issues above.\n');
  } else if (warnings > 0) {
    lines.push('\n⚠️  Some checks have warnings. VectaHub may not work optimally.\n');
  } else {
    lines.push('\n✅ All checks passed! VectaHub is ready to use.\n');
  }

  return lines.join('\n');
}

type DoctorCheck = { name: string; status: 'pass' | 'fail' | 'warn'; message: string };

async function hasPackageDependency(environment: IEnvironmentService, name: string): Promise<boolean> {
  try {
    const packageJson = JSON.parse(environment.readFile(join(environment, environment.getCwd(), 'package.json')));
    return Boolean(packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);
  } catch {
    return false;
  }
}

export async function runChecks(environment: IEnvironmentService, verbose = false): Promise<DoctorCheck[]> {
  const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

  try {
    const nodeVersion = process.version;
    const nodeMatch = nodeVersion.match(/^v(\d+)\./);
    const nodeMajor = nodeMatch ? parseInt(nodeMatch[1], 10) : 0;

    checks.push({
      name: 'Node.js',
      status: nodeMajor >= 21 ? 'pass' : 'fail',
      message: `${nodeVersion} (requires >=21.0.0)`
    });

    if (verbose) {
      checks.push({
        name: '  Node Platform',
        status: 'pass',
        message: `${process.platform} ${process.arch}`,
      });
      checks.push({
        name: '  Node Env',
        status: 'pass',
        message: `NODE_ENV=${environment.getEnv('NODE_ENV') || 'undefined'}`,
      });
    }
  } catch {
    checks.push({ name: 'Node.js', status: 'fail', message: 'Could not detect' });
  }

  try {
    const { stdout } = await execWithTimeout(environment, 'npx tsc --version');
    checks.push({ name: 'TypeScript', status: 'pass', message: stdout.trim() });

    if (verbose) {
      const tsConfigPath = join(environment, environment.getCwd(), 'tsconfig.json');
      const tsConfigExists = environment.exists(tsConfigPath);
      checks.push({
        name: '  tsconfig.json',
        status: tsConfigExists ? 'pass' : 'warn',
        message: tsConfigExists ? 'Found' : 'Not found',
      });
    }
  } catch {
    checks.push({ name: 'TypeScript', status: 'fail', message: 'Not found' });
  }

  try {
    const { stdout } = await execWithTimeout(environment, 'npx tsx --version');
    checks.push({ name: 'tsx', status: 'pass', message: stdout.trim() });
  } catch {
    const packageExists = environment.exists(join(environment, environment.getCwd(), 'package.json'));
    const srcExists = environment.exists(join(environment, environment.getCwd(), 'src'));
    const hasLocalTsx = packageExists && await hasPackageDependency(environment, 'tsx');

    if (hasLocalTsx && srcExists) {
      checks.push({ name: 'tsx', status: 'pass', message: 'Declared in devDependencies' });
    } else {
      checks.push({
        name: 'tsx',
        status: 'warn',
        message: 'Not available (only needed for source dev)',
      });
    }
  }

  try {
    const { stdout } = await execWithTimeout(environment, 'npx vitest --version');
    checks.push({ name: 'Vitest', status: 'pass', message: stdout.trim() });

    if (verbose) {
      const vitestConfigPath = join(environment, environment.getCwd(), 'vitest.config.ts');
      const vitestConfigExists = environment.exists(vitestConfigPath);
      checks.push({
        name: '  vitest.config',
        status: vitestConfigExists ? 'pass' : 'warn',
        message: vitestConfigExists ? 'Found' : 'Not found',
      });
    }
  } catch {
    checks.push({ name: 'Vitest', status: 'warn', message: 'Not found (optional)' });
  }

  const srcExists = environment.exists(join(environment, environment.getCwd(), 'src'));
  const docsExists = environment.exists(join(environment, environment.getCwd(), 'docs'));
  const packageExists = environment.exists(join(environment, environment.getCwd(), 'package.json'));

  checks.push({
    name: 'Directory structure',
    status: srcExists && docsExists && packageExists ? 'pass' : 'fail',
    message: srcExists ? 'src/' : 'Missing src/',
  });

  if (srcExists && docsExists && packageExists) {
    checks.push({
      name: 'Project files',
      status: 'pass',
      message: 'All required files present'
    });

    if (verbose) {
      const srcFiles = environment.readDir(join(environment, environment.getCwd(), 'src'));
      checks.push({
        name: '  Source modules',
        status: 'pass',
        message: `${srcFiles.length} top-level modules`,
      });

      const packageJson = JSON.parse(environment.readFile(join(environment, environment.getCwd(), 'package.json')));
      checks.push({
        name: '  Package version',
        status: 'pass',
        message: packageJson.version || 'unknown',
      });
      checks.push({
        name: '  Dependencies',
        status: 'pass',
        message: `${Object.keys(packageJson.dependencies || {}).length} deps, ${Object.keys(packageJson.devDependencies || {}).length} devDeps`,
      });
    }
  } else {
    const missing: string[] = [];
    if (!srcExists) missing.push('src/');
    if (!docsExists) missing.push('docs/');
    if (!packageExists) missing.push('package.json');
    checks.push({
      name: 'Project files',
      status: 'fail',
      message: `Missing: ${missing.join(', ')}`
    });
  }

  return checks;
}

export function createDoctorCmd(context: InfrastructureContext): Command {
  return new Command('doctor')
    .description('Run diagnostics to check system requirements')
    .option('--verbose', 'Show detailed diagnostic information')
    .option('--json', 'Output results in JSON format')
    .action(async (options: { verbose?: boolean; json?: boolean }) => {
      const output = createCliOutput({ json: Boolean(options.json) });
      const checks = await runChecks(context.environment, options.verbose || false);
      if (options.json) {
        output.json({
          ok: checks.every(c => c.status !== 'fail'),
          checks,
          summary: {
            passed: checks.filter(c => c.status === 'pass').length,
            failed: checks.filter(c => c.status === 'fail').length,
            warnings: checks.filter(c => c.status === 'warn').length
          }
        }, { space: 2 });
      } else {
        output.text(formatDoctorResults(checks));
      }
    });
}
