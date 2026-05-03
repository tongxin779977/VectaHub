#!/usr/bin/env node
import { renameSync, existsSync } from 'fs';
import { join } from 'path';

const files = [
  'test-all-tasks.ts',
  'test-cli-tools.ts',
  'test-imports.ts',
  'test-tools-commands.ts'
];

const srcDir = process.cwd();
const destDir = join(srcDir, 'scripts');

console.log('Moving test scripts...\n');

for (const file of files) {
  const srcPath = join(srcDir, file);
  const destPath = join(destDir, file);
  
  if (existsSync(srcPath)) {
    try {
      renameSync(srcPath, destPath);
      console.log(`✅ Moved ${file}`);
    } catch (err) {
      console.log(`❌ Failed to move ${file}:`, err.message);
    }
  } else {
    console.log(`⏭️  ${file} not found in root`);
  }
}

console.log('\nDone!');
