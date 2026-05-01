import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export const doctorCmd = new Command('doctor')
  .description('Run diagnostics to check system requirements')
  .action(async () => {
    const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

    console.log('\n🔍 VectaHub Doctor\n' + '─'.repeat(50));

    try {
      const nodeVersion = process.version;
      const nodeMatch = nodeVersion.match(/^v(\d+)\./);
      const nodeMajor = nodeMatch ? parseInt(nodeMatch[1], 10) : 0;

      checks.push({
        name: 'Node.js',
        status: nodeMajor >= 21 ? 'pass' : 'fail',
        message: `${nodeVersion} (requires >=21.0.0)`
      });
    } catch {
      checks.push({ name: 'Node.js', status: 'fail', message: 'Could not detect' });
    }

    try {
      await execAsync('npx tsc --version');
      checks.push({ name: 'TypeScript', status: 'pass', message: 'Available' });
    } catch {
      checks.push({ name: 'TypeScript', status: 'fail', message: 'Not found' });
    }

    try {
      await execAsync('npx tsx --version');
      checks.push({ name: 'tsx', status: 'pass', message: 'Available' });
    } catch {
      checks.push({ name: 'tsx', status: 'fail', message: 'Not found' });
    }

    try {
      await execAsync('npx vitest --version');
      checks.push({ name: 'Vitest', status: 'pass', message: 'Available' });
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

    console.log('');
    for (const check of checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
      console.log(`${icon} ${check.name.padEnd(20)} ${check.message}`);
    }

    const passed = checks.filter(c => c.status === 'pass').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const warnings = checks.filter(c => c.status === 'warn').length;

    console.log('\n' + '─'.repeat(50));
    console.log(`Results: ${passed} passed, ${warnings} warnings, ${failed} failed`);

    if (failed > 0) {
      console.log('\n❌ Some checks failed. Please fix the issues above.\n');
      process.exit(1);
    } else if (warnings > 0) {
      console.log('\n⚠️  Some checks have warnings. VectaHub may not work optimally.\n');
    } else {
      console.log('\n✅ All checks passed! VectaHub is ready to use.\n');
    }
  });
