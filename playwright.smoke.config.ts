import { defineConfig } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: resolve(__dirname, 'tests', 'e2e'),
  timeout: 30_000,
  reporter: 'list',
});