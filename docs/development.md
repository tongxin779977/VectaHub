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

## 谷歌工程规范 (Google Engineering Standards)

本项目严格遵循谷歌工程规范，所有核心逻辑必须通过基础设施层进行解耦。

### 1. 依赖注入 (DI) 与环境隔离
严禁在业务代码（`src/utils/` 或 `src/commands/`）中直接调用 Node.js 原生模块（如 `fs`, `process`, `child_process`）。
- **必须**使用 `getDefaultContext().environment` 进行文件操作、环境变量读取或进程产生。
- **好处**：确保了代码的可测试性（Hermeticity），支持在内存中运行完整的集成测试。

### 2. 日志规范 (Logger Discipline)
- **严禁**使用 `console.log` 输出调试信息。
- **必须**使用 `InfrastructureContext.logger` 获取 pino 实例。
- **Stderr 优先**：所有日志、告警、进度信息必须输出到 `stderr`。`stdout` 仅保留给业务数据输出（特别是 `--json` 模式）。

### 3. 结构化遥测 (Structured Trace)
所有复杂的业务流程必须包裹在 `startSpan` 或 `withSpan` 中。
- 遵循 OpenTelemetry 规范选择合适的 `SpanKind`。
- 确保 Trace ID 在整个调用链（插件 -> CLI -> Agent）中透传。

### 4. 零 any 政策
新代码严禁使用 `any` 类型。应优先使用 `unknown` 并配合 Zod 或类型守卫（Type Guards）进行类型收敛。

## 技术债管理 (Lint & Types)

当前项目存在 1100+ ESLint 警告（主要是 `any` 类型使用、`unused-vars` 和 `console` 语句）。

### 处理原则

1. **渐进式清理**：遵循“童子军军规”，在修改某个模块时，顺便清理该模块内的 Lint 警告。
2. **禁止暴力全量修复**：严禁进行全量 `eslint --fix` 或大规模修改 `any` 类型，除非经过充分的回归测试。
3. **新增代码零警告**：新提交的代码应严格遵守 Lint 规约，不产生新的警告。
4. **质量基线**：使用 `bash scripts/collect_quality_signals.sh` 监控警告总数，确保其处于下降趋势。

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

