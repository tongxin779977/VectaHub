import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-console": "warn",
      "no-debugger": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: [
      "src/cli*.ts",
      "src/commands/**/*.ts",
      "src/setup/**/*.ts",
      "src/backlog/**/*.ts",
      "src/agent-runtime/registry.ts",
      "src/cli-tools/command-rules/engine.ts",
      "src/cli-tools/registry.ts",
      "src/cli-tools/tool-service.ts",
      "src/daemon/index.ts",
      "src/daemon/socket-server.ts",
      "src/infrastructure/audit/index.ts",
      "src/infrastructure/audit/service.ts",
      "src/infrastructure/trace-audit/alert-system.ts",
      "src/nl/orchestrator.ts",
      "src/security-protocol/manager.ts",
      "src/skills/executor.ts",
      "src/skills/init.ts",
      "src/skills/iterative-refinement/**/*.ts",
      "src/utils/gh-to-queue.ts",
      "src/utils/lazy-commands.ts",
      "src/utils/process-diagnostic-queue.ts",
      "src/workflow/template-market.ts"
    ],
    rules: {
      "no-console": "off"
    }
  },
  {
    files: [
      "src/chat/command-bridge.ts",
      "src/cli-tools/**/*.ts",
      "src/debugger/**/*.ts",
      "src/execution/record-manager.ts",
      "src/infrastructure/audit/**/*.ts",
      "src/infrastructure/concurrency/worker-pool.ts",
      "src/infrastructure/environment/index.ts",
      "src/infrastructure/interfaces/environment-service.ts",
      "src/infrastructure/loaders/lazy-loader.ts",
      "src/infrastructure/testing/**/*.ts",
      "src/infrastructure/trace-audit/index.ts",
      "src/sandbox/detector.ts",
      "src/sandbox/memory-monitor.ts",
      "src/skills/ai-modules/agent-delegate/agent-loop.ts",
      "src/types/diagnostic.ts",
      "src/types/backlog.ts",
      "src/backlog/**/*.ts",
      "src/utils/lazy-loader.ts",
      "src/utils/shell-tokenizer.ts",
      "src/utils/worker-pool.ts"
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "**/*.vsix"
    ]
  }
];
