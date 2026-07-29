#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');
const allowlistedFiles = new Set([
  'src/infrastructure/context.ts',
  'src/cli-main.ts',
  'src/cli-bootstrap.ts',
  'src/infrastructure/event/event-manager.ts',
]);

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const testFilePattern = /\.(test|spec)\.[cm]?tsx?$/;
const usagePattern = /\bgetDefaultContext\s*\(/g;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join(path.posix.sep);
}

function isSourceFile(relativePath) {
  if (relativePath.endsWith('.d.ts')) {
    return false;
  }

  if (testFilePattern.test(relativePath)) {
    return false;
  }

  return sourceExtensions.has(path.extname(relativePath));
}

function isBridgeFile(relativePath) {
  const baseName = path.posix.basename(relativePath);
  return baseName === 'compat-bridge.ts' || baseName.endsWith('-bridge.ts');
}

function isAllowlisted(relativePath) {
  return allowlistedFiles.has(relativePath) || isBridgeFile(relativePath);
}

function collectSourceFiles(currentDir) {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    const relativePath = toPosixPath(path.relative(repoRoot, absolutePath));
    if (isSourceFile(relativePath)) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function scanFile(absolutePath) {
  const relativePath = toPosixPath(path.relative(repoRoot, absolutePath));
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split('\n');
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    usagePattern.lastIndex = 0;
    let match = usagePattern.exec(line);

    while (match) {
      matches.push({
        relativePath,
        line: index + 1,
        column: match.index + 1,
        snippet: line.trim(),
      });
      match = usagePattern.exec(line);
    }
  }

  return matches;
}

function formatMatch(match) {
  return `  - ${match.relativePath}:${match.line}:${match.column} ${match.snippet}`;
}

const sourceFiles = collectSourceFiles(srcRoot);
const matches = sourceFiles.flatMap(scanFile);
const allowlistedMatches = matches.filter((match) => isAllowlisted(match.relativePath));
const violatingMatches = matches.filter((match) => !isAllowlisted(match.relativePath));
const allowlistedPaths = Array.from(new Set(allowlistedMatches.map((match) => match.relativePath))).sort();
const violatingPaths = Array.from(new Set(violatingMatches.map((match) => match.relativePath))).sort();

console.log('== Default Context Usage Check ==');
console.log(`Scanned files: ${sourceFiles.length}`);
console.log(`Matched usages: ${matches.length}`);
console.log(`Allowlisted files with usage: ${allowlistedPaths.length}`);
console.log(`Violating files: ${violatingPaths.length}`);
console.log('');
console.log('Allowlist contract:');
console.log('  - src/infrastructure/context.ts');
console.log('  - src/cli-main.ts');
console.log('  - src/cli-bootstrap.ts');
console.log('  - src/**/compat-bridge.ts');
console.log('  - src/**/*-bridge.ts');
console.log('');

if (allowlistedMatches.length > 0) {
  console.log('Allowlisted usages:');
  for (const match of allowlistedMatches) {
    console.log(formatMatch(match));
  }
  console.log('');
}

if (violatingMatches.length > 0) {
  console.error('Unauthorized getDefaultContext() usages detected:');
  for (const match of violatingMatches) {
    console.error(formatMatch(match));
  }
  console.error('');
  console.error('Result: FAIL');
  process.exit(1);
}

console.log('Result: PASS');
