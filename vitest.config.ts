import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec,bench}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/*.test.js',
      '**/vectahub-vscode-extension/src/test/**',
      'tests/e2e/**',
      'tests/mutation/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,js,mjs,cjs}'],
      exclude: [
        'src/**/*.test.{ts,js,mjs,cjs}',
        'src/**/*.spec.{ts,js,mjs,cjs}',
        'src/**/*.bench.{ts,js,mjs,cjs}',
        'src/**/index.ts',
        'src/**/types.ts',
        'src/**/__mocks__/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
});