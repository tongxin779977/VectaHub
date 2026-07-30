#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const resultDir = resolve(rootDir, 'benchmarks', 'results');
const baselinePath = resolve(rootDir, 'benchmarks', 'baseline.json');
const resultPath = resolve(resultDir, 'latest.json');

if (!existsSync(resultDir)) {
  mkdirSync(resultDir, { recursive: true });
}

let result;
try {
  result = JSON.parse(readFileSync(resultPath, 'utf-8'));
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(`Missing benchmark result at ${resultPath}`);
    console.error('Run `npm run bench` first.');
    process.exit(1);
  }
  throw err;
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
} catch (err) {
  if (err.code === 'ENOENT') {
    console.warn(`No baseline found at ${baselinePath}.`);
    console.warn('Creating baseline from current results; future runs will be compared against this.');
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
    process.exit(0);
  }
  throw err;
}

const REGRESSION_PERCENT = 10;
const HARD_FAIL_PERCENT = 25;

let failed = false;
const checks = [];

for (const bench of result.benchmarks ?? []) {
  const baseBench = (baseline.benchmarks ?? []).find(
    (b) => b.name === bench.name && b.suite === bench.suite,
  );
  if (!baseBench) {
    checks.push({ name: bench.name, status: 'NEW', delta: 0 });
    continue;
  }

  const baselineMs = baseBench.hz ? 1000 / baseBench.hz : null;
  const currentMs = bench.hz ? 1000 / bench.hz : null;

  if (baselineMs === null || currentMs === null) {
    continue;
  }

  const delta = ((currentMs - baselineMs) / baselineMs) * 100;

  let status = 'OK';
  if (delta > HARD_FAIL_PERCENT) {
    status = 'FAIL';
    failed = true;
  } else if (delta > REGRESSION_PERCENT) {
    status = 'WARN';
  }

  checks.push({
    name: bench.name,
    baseline: baselineMs.toFixed(2),
    current: currentMs.toFixed(2),
    delta: delta.toFixed(2),
    status,
  });
}

console.log('\n=== Benchmark Regression Report ===\n');
for (const c of checks) {
  const label = c.status === 'OK' ? 'OK  ' : c.status === 'WARN' ? 'WARN' : 'FAIL';
  const detail = c.delta === 0 ? 'baseline' : `delta=${c.delta}%`;
  console.log(`[${label}] ${c.name.padEnd(40)} ${detail}`);
}

if (failed) {
  console.error('\nBenchmark regression exceeded hard threshold; failing job.');
  process.exit(1);
}
console.log('\nBenchmark regression check passed.');