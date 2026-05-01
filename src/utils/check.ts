import { Command } from 'commander';

export const check = new Command('check')
  .description('Check development environment and dependencies')
  .action(async () => {
    console.log('Checking development environment...\n');

    const checks = [
      { name: 'Node.js', expected: '>= 21.0.0', fn: checkNode },
      { name: 'TypeScript', expected: '>= 5.0.0', fn: checkTypeScript },
      { name: 'Directory structure', expected: 'src/ exists', fn: checkDirectories },
    ];

    for (const { name, expected, fn } of checks) {
      const result = await fn();
      console.log(`${result ? '✅' : '❌'} ${name}: ${expected} ${result ? '✓' : '✗'}`);
    }
  });

async function checkNode(): Promise<boolean> {
  const version = process.version.slice(1);
  const [major] = version.split('.').map(Number);
  return major >= 21;
}

async function checkTypeScript(): Promise<boolean> {
  try {
    const ts = await import('typescript');
    const major = ts.version.split('.')[0];
    return Number(major) >= 5;
  } catch {
    return false;
  }
}

async function checkDirectories(): Promise<boolean> {
  const { existsSync } = await import('fs');
  return existsSync('./src');
}