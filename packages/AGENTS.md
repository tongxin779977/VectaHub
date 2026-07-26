# AGENTS.md — packages/

> npm workspace 包。父级规则见 `../AGENTS.md`。

## OVERVIEW

两个 workspace 包共享版本号，被 root CLI 和 VS Code extension 消费。

## STRUCTURE

### `doc-task-contract-core/` — shared contract library

- **3 files**: `index.js` + `index.d.ts` + `index.test.ts`
- **零依赖**（仅 node:crypto/fs/path），**无构建步骤**，`"private": true`
- 导出 10 个纯函数：`computeInstructionHash`、`buildGlobalConfigDigest`、`deriveDocExcerpt*`（4 variants）、`normalizeAgentTaskFiles`、`deriveAgentTaskBoundary`、`deriveValidationCommands`、`decideAgentTaskConcurrency`、`extractCandidateFiles`、`expandRelatedFiles`
- 消费方：CLI (`src/commands/run-task.ts`) + vscode-extension (`project/docTaskContract.ts`)，均通过 workspace link

### `vectahub-vscode-extension/` — VS Code extension

- **71 source + 32 test files**，入口 `extension.ts` → `activate()` → CLI discovery → 注册 20+ commands
- 通过 `child_process.spawn` + `--json` 协议消费 CLI（`cli/adapter.ts`、`cli/discovery.ts`）
- 构建：`tsc` → `out/` + `prepare-doc-task-contract-core-runtime.cjs`（ESM→CommonJS 转译）
- 关键子目录：
  - `cli/` — adapter, discovery, process-manager, readiness, dangerDetection
  - `commands/` — 28 个命令文件，`runDocTasks.ts` 超 1200 行
  - `project/` — 16 个文件，`docTaskContract.ts` 消费 core
  - `views/`、`ui/`、`trace/`、`security/`、`config/`、`execution/`
- 打包：`npm run package:vsix`（`vsce package --allow-missing-repository --no-dependencies`）

## WHERE TO LOOK

| 要做什么 | 起点 |
|----------|------|
| 改共享任务合同逻辑 | `doc-task-contract-core/index.js`（纯 JS，无构建） |
| 改 extension 的 CLI 通信 | `vectahub-vscode-extension/cli/adapter.ts` |
| 改 extension 的任务命令 | `vectahub-vscode-extension/commands/runDocTasks.ts` |
| 改 VSIX 打包流程 | `vectahub-vscode-extension/package.json` `scripts.package:vsix` |
| 扩展测试 | `npm test -w packages/vectahub-vscode-extension` |
| 版本号同步 | `scripts/bump-version.mjs`（3-way sync） |

## CONVENTIONS

- `doc-task-contract-core` 改动：无构建，`npm test -w packages/doc-task-contract-core` 即可验证
- Extension 改动：先 `npm run compile:extension`，再 `npm test -w packages/vectahub-vscode-extension`
- Extension 通过 `@vectahub/doc-task-contract-core` workspace alias 导入 core，不要用相对路径 `../doc-task-contract-core/`
- `prepare-doc-task-contract-core-runtime.cjs` 是构建产物（gitignored），不要手动编辑；改 core 后重新 `npm run compile:extension`
- VSIX 打包前必须：`npm run build`（CLI 构建）+ `npm run compile:extension`（extension + runtime 转译）

## ANTI-PATTERNS

- ❌ 在 extension 中重新实现 core 的函数 — 始终通过 `@vectahub/doc-task-contract-core` 导入
- ❌ 给 `doc-task-contract-core` 加依赖 — 保持零依赖
- ❌ 用 CLI 的 `InfrastructureContext` 或任何 `src/` 导入 — extension 通过 subprocess JSON 协议消费 CLI
- ❌ 手动同步版本号 — 始终用 `npm run bump`