import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/*.test.js',
      '**/vectahub-vscode-extension/src/test/**',
    ],
  },
});
