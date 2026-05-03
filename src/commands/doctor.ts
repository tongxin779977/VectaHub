import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

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

async function runChecks(verbose = false): Promise<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string }[]> {
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
        message: `NODE_ENV=${process.env.NODE_ENV || 'undefined'}`,
      });
    }
  } catch {
    checks.push({ name: 'Node.js', status: 'fail', message: 'Could not detect' });
  }

  try {
    const { stdout } = await execAsync('npx tsc --version');
    checks.push({ name: 'TypeScript', status: 'pass', message: stdout.trim() });

    if (verbose) {
      const tsConfigPath = join(process.cwd(), 'tsconfig.json');
      const tsConfigExists = existsSync(tsConfigPath);
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
    const { stdout } = await execAsync('npx tsx --version');
    checks.push({ name: 'tsx', status: 'pass', message: stdout.trim() });
  } catch {
    checks.push({ name: 'tsx', status: 'fail', message: 'Not found' });
  }

  try {
    const { stdout } = await execAsync('npx vitest --version');
    checks.push({ name: 'Vitest', status: 'pass', message: stdout.trim() });

    if (verbose) {
      const vitestConfigPath = join(process.cwd(), 'vitest.config.ts');
      const vitestConfigExists = existsSync(vitestConfigPath);
      checks.push({
        name: '  vitest.config',
        status: vitestConfigExists ? 'pass' : 'warn',
        message: vitestConfigExists ? 'Found' : 'Not found',
      });
    }
  } catch {
    checks.push({ name: 'Vitest', status: 'warn', message: 'Not found (optional)' });
  }

  const srcExists = existsSync(join(process.cwd(), 'src'));
  const docsExists = existsSync(join(process.cwd(), 'docs'));
  const packageExists = existsSync(join(process.cwd(), 'package.json'));

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
      const srcFiles = await readdir(join(process.cwd(), 'src'));
      checks.push({
        name: '  Source modules',
        status: 'pass',
        message: `${srcFiles.length} top-level modules`,
      });

      const { readFileSync } = await import('fs');
      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
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

export const doctorCmd = new Command('doctor')
  .description('Run diagnostics to check system requirements')
  .option('--verbose', 'Show detailed diagnostic information')
  .action(async (options: { verbose?: boolean }) => {
    const checks = await runChecks(options.verbose || false);
    console.log(formatDoctorResults(checks));
  });
