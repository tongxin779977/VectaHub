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
| `npm run lint` | 当前等同于 `tsc --noEmit`。 |
| `npm run compile:extension` | 编译 VS Code extension workspace。 |
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

