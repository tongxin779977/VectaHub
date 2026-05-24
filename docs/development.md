# 开发者指南

本文面向 VectaHub 维护者，说明本地开发、构建和调试入口。更细的 Agent 执行规范见 [Agent 操作规范](./agent-operating-guide.md)。

## 环境要求

- Node.js `>=21.0.0`
- npm workspace
- macOS 或 Linux

版本要求以 `package.json` 的 `engines.node` 为准。

## 安装依赖

```bash
npm install
```

## 常用脚本

| 命令 | 用途 |
|------|------|
| `npm run build` | 使用 `tsup` 构建 CLI。 |
| `npm run build:watch` | 监听模式构建。 |
| `npm run dev` | 使用 `tsx src/cli.ts` 本地运行 CLI。 |
| `npm test` | 运行 Vitest。 |
| `npm run test:run` | 以非 watch 模式运行 Vitest。 |
| `npm run typecheck` | 运行 TypeScript 类型检查。 |
| `npm run lint` | 运行 ESLint 检查。 |
| `npm run compile:extension` | 编译 VS Code extension workspace。 |

## Google Engineering Standards

VectaHub keeps reusable production logic behind explicit dependencies and narrow runtime adapters.

### 1. Dependency Injection and Runtime Boundaries

Reusable business and support modules should receive `InfrastructureContext` or narrower service dependencies explicitly. Direct Node.js runtime access is allowed only at clear boundaries:

- CLI composition roots and local command output adapters.
- Standalone script entrypoints guarded by an executable `main()` path.
- Infrastructure services whose purpose is to wrap filesystem, environment, process, path, or logger APIs.
- Test helpers and documented compatibility bridges.

### 2. Logger and Output Discipline

- Do not use `console.*` for current-process production output.
- Use explicit `output` adapters for user-visible CLI text, JSON payloads, and command-line script output.
- Use `InfrastructureContext.logger` or narrower logger dependencies for internal diagnostics.
- Preserve stdout for business data and JSON payloads; route diagnostics, warnings, and errors through stderr or structured loggers.

### 3. Structured Trace

Complex business flows should use the trace helpers that are already part of the code path, such as `startSpan` or `withSpan`.

- Select span names and attributes from the caller-visible contract.
- Preserve trace identifiers across extension, CLI, workflow, and agent boundaries.

### 4. Zero Production `any`

Production source must not introduce `any`, `as any`, or `<any>` type escapes. External data should enter as `unknown` and be narrowed through project-owned types, parsers, or type guards.

## Technical Debt Management

The current production baseline is strict:

- `npm run lint` reports `0` problems.
- Production `any` usage is `0` by `scripts/collect_quality_signals.sh`.
- Current-process production `console.*` usage is `0` by `scripts/collect_quality_signals.sh`.
- Two remaining `console.log(...)` strings are allowed child-process code snippets passed to `node -e`; they are not current-process CLI output.
- Test files still contain historical explicit `any` usage. The quality script reports this as advisory debt, not a production gate.

### Handling Principles

1. Keep production `any` and current-process `console.*` at zero.
2. Do not run broad `eslint --fix` or large mechanical rewrites without focused regression coverage.
3. Keep new code warning-free under `npm run lint`.
4. Use `bash scripts/collect_quality_signals.sh` as the production quality gate and advisory test debt report.

| `npm run package:vsix` | 编译并打包 VSIX。 |

## 本地调试 CLI

直接通过 dev 脚本运行：

```bash
npm run dev -- --version
npm run dev -- run --dry-run "查看 Git 状态"
npm run dev -- doctor --json
```

也可以先构建，再运行产物：

```bash
npm run build
node dist/cli.js --version
```

## 目录入口

| 路径 | 职责 |
|------|------|
| `src/cli.ts` | CLI 入口。 |
| `src/cli-main.ts` | Commander 命令注册和全局行为。 |
| `src/commands/` | CLI 子命令实现。 |
| `src/types/` | 共享类型。 |
| `src/workflow/` | 工作流引擎、执行器、存储和模板。 |
| `src/sandbox/` | 沙箱和危险命令检测。 |
| `src/cli-tools/` | 外部工具集成。 |
| `packages/doc-task-contract-core/` | 文档任务合同纯函数包。 |
| `packages/vectahub-vscode-extension/` | VS Code 插件。 |

## 新增或修改命令

修改 CLI 命令时必须同步：

- [CLI 命令面规格](./specs/cli-command-surface.md)
- 相关用户文档，例如 [CLI 使用手册](./usage.md)
- 如果修改数据落点，同步 [配置与数据存储规格](./specs/config-data-storage.md)
- 如果修改 workflow 执行语义，同步 [工作流生命周期规格](./specs/workflow-lifecycle.md)

机器调用路径必须明确是否支持 `--json`，并保证 stdout 不被人类日志污染。

## 修改 Agent 任务链路

涉及 `run-task`、文档任务状态、trace、安全、验证或恢复时，先阅读：

- [Run-Task 执行合同](./specs/run-task-execution-contract.md)
- [文档任务状态机规格](./specs/doc-task-state-machine.md)
- [Trace 执行规格](./specs/trace-execution.md)
- [安全与权限闭环规格](./specs/security-permission-loop.md)
- [任务验证闭环规格](./specs/verification-loop.md)
- [恢复闭环规格](./specs/recovery-loop.md)

## 开发完成前检查

至少运行和改动相关的检查：

```bash
npm run typecheck
npm run test:run
```

如果改动 VS Code extension：

```bash
npm run compile:extension
```

更完整的测试要求见 [测试指南](./testing.md)。
