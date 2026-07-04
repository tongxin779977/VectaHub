#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const summaryPath = resolve(rootDir, 'coverage', 'coverage-summary.json');

if (!existsSync(summaryPath)) {
  console.error(`Missing coverage summary at ${summaryPath}`);
  console.error('Run `npm run test:coverage` first.');
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

const thresholds = {
  lines: 50,
  functions: 50,
  branches: 45,
  statements: 50,
};

let failed = false;
for (const [metric, min] of Object.entries(thresholds)) {
  const actual = summary.total?.[metric]?.pct;
  if (typeof actual !== 'number') {
    console.error(`Coverage metric "${metric}" missing from summary.`);
    failed = true;
    continue;
  }
  const status = actual >= min ? 'OK' : 'FAIL';
  console.log(`[${status}] ${metric}: ${actual.toFixed(2)}% (>= ${min}%)`);
  if (actual < min) {
    failed = true;
  }
}

if (failed) {
  console.error('\nCoverage threshold check failed.');
  process.exit(1);
}
console.log('\nCoverage threshold check passed.');