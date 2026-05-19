import { Command } from 'commander';
import { getDefaultContext, VectaHubError, ErrorType } from '../infrastructure/index.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

interface VerifyReport {
  checks: CheckResult[];
  verdict: 'PASS' | 'FAIL';
}

export async function runVerification(type: string): Promise<VerifyReport> {
  const checks: CheckResult[] = [];

  if (type === 'typecheck' || type === 'all') {
    checks.push(await runTypeCheck());
  }

  if (type === 'test' || type === 'all') {
    checks.push(await runTests());
  }

  if (type === 'coverage' || type === 'all') {
    checks.push(await runCoverageCheck());
  }

  const verdict = checks.every(c => c.status !== 'fail') ? 'PASS' : 'FAIL';
  return { checks, verdict };
}

async function runTypeCheck(): Promise<CheckResult> {
  const env = getDefaultContext().environment;
  try {
    const { stdout, stderr } = await env.exec('npx tsc --noEmit 2>&1');
    const hasErrors = stderr.includes('error TS') || stdout.includes('error TS');
    const errorCount = (stderr.match(/error TS/g) || stdout.match(/error TS/g) || []).length;

    if (hasErrors) {
      return { name: 'TypeCheck', status: 'fail', detail: `${errorCount} TypeScript errors` };
    }
    return { name: 'TypeCheck', status: 'pass', detail: '0 errors' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCount = (message.match(/error TS/g) || []).length;
    return { name: 'TypeCheck', status: 'fail', detail: `${errorCount} TypeScript errors` };
  }
}

async function runTests(): Promise<CheckResult> {
  const env = getDefaultContext().environment;
  try {
    const { stdout } = await env.exec('npx vitest --run --reporter=basic 2>&1');
    const passMatch = stdout.match(/(\d+) passed/);
    const failMatch = stdout.match(/(\d+) failed/);
    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;

    if (failed > 0) {
      return { name: 'Tests', status: 'fail', detail: `${passed}/${passed + failed} passed` };
    }
    return { name: 'Tests', status: 'pass', detail: `${passed} passed` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name: 'Tests', status: 'fail', detail: `Tests crashed: ${message.substring(0, 100)}` };
  }
}

async function runCoverageCheck(): Promise<CheckResult> {
  const env = getDefaultContext().environment;
  try {
    const { stdout } = await env.exec('npx vitest --run --coverage 2>&1');
    const coverageMatch = stdout.match(/All files\s*\|\s*([\d.]+)\s*\|/);
    if (coverageMatch) {
      const coverage = parseFloat(coverageMatch[1]);
      const threshold = 70;
      if (coverage < threshold) {
        return { name: 'Coverage', status: 'warn', detail: `${coverage}% (< ${threshold}% threshold)` };
      }
      return { name: 'Coverage', status: 'pass', detail: `${coverage}% (>= ${threshold}% threshold)` };
    }
    return { name: 'Coverage', status: 'warn', detail: 'Could not parse coverage data' };
  } catch {
    return { name: 'Coverage', status: 'warn', detail: 'Coverage not available' };
  }
}

function formatReport(report: VerifyReport): string {
  const lines = [
    '\n' + '='.repeat(50),
    'VERIFICATION REPORT',
    '='.repeat(50),
  ];

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '[PASS]' : check.status === 'fail' ? '[FAIL]' : '[WARN]';
    lines.push(`${icon} ${check.name}: ${check.detail}`);
  }

  lines.push('');
  lines.push(`VERDICT: ${report.verdict}`);
  lines.push('='.repeat(50) + '\n');

  return lines.join('\n');
}

export const verifyCmd = new Command('verify')
  .description('Run verification checks (typecheck, tests, coverage)')
  .option('--type <type>', 'Check type: typecheck, test, coverage, or all (default: all)')
  .action(async (options: { type?: string }) => {
    const type = options.type || 'all';
    const validTypes = ['typecheck', 'test', 'coverage', 'all'];

    if (!validTypes.includes(type)) {
      console.error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
      throw new VectaHubError(`Invalid verification type: ${type}`, ErrorType.RUNTIME);
    }

    const report = await runVerification(type);
    console.log(formatReport(report));

    if (report.verdict === 'FAIL') {
      throw new VectaHubError('Verification failed', ErrorType.RUNTIME);
    }
  });
