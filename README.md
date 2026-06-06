# VectaHub

> 一个小马拉大车的 CLI，擅长文档驱动自动化、结构化执行和 Agent 编排。

[![Version](https://img.shields.io/badge/version-1.0.14-blue)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D21.0.0-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)]()

[文档总览](./docs/README.md)

## 它是什么

VectaHub 是一个本地优先的 CLI 内核，面向这样一类用户：希望用一个工具同时完成下面几件事：

- 读取并执行任务文档，
- 进行基础的交互式回复，
- 运行结构化工作流，
- 注册并路由外部 Agent CLI，
- 协调多步骤和可并行执行的任务，
- 把安全、trace、验证、恢复放进同一条执行链路。

这个项目当前明确偏向“强大的单用户自动化内核”，而不是“多租户控制面”。

## 核心产品形态

VectaHub 当前最强的五个方向是：

1. **文档处理**
   解析任务文档、推导任务边界、提取聚焦片段，并通过 `run-task` 执行文档范围内的 Agent 任务。
2. **基础交互回复**
   提供本地 chat 风格 CLI，带 session 上下文、历史记录和意图路由。
3. **工作流执行**
   从自然语言或 YAML/JSON 运行工作流，支持 `exec`、`if`、`for_each`、`parallel`、`opencli`、`delegate` 等步骤。
4. **可扩展 Agent CLI 注册**
   通过基于 registry 的 adapter 层注册和描述外部 Agent CLI，而不是把整个产品强耦合到某一个 provider。
5. **强编排与任务拆解**
   把意图解析、文档合同、工作流步骤、并行执行、委托执行组合成一条可审计的运行路径。

## 它不是什么

VectaHub 当前不应被理解成：

- 托管式多用户编排服务，
- 底层 Agent CLI 的替代品，
- 纯聊天助手，
- 带数据库的企业级工作流平台。

## 快速开始

安装：

```bash
npm install -g vectahub
```

用自然语言直接运行：

```bash
vectahub run "show git status"
vectahub run --dry-run "delete node_modules"
```

运行直接命令并附带安全检查：

```bash
vectahub run-command -- npm test
```

启动交互式 chat：

```bash
vectahub chat
```

预览文档任务合同：

```bash
vectahub run-task --task-id T1 --task-label "Add tests" --doc ./docs/task.md --contract-preview --json
```

通过 Agent CLI 执行文档任务：

```bash
vectahub run-task --tool codex --task-id T1 --task-label "Add tests" --doc ./docs/task.md --json
```

## 能力亮点

- **文档任务执行**
  `run-task`、`parse-doc`、任务合同、验证、恢复、基于 trace 的执行收口。
- **工作流引擎**
  结构化步骤、插值、执行记录、detail/history/rerun/resume/archive 流程。
- **Agent runtime catalog**
  内建 `codex`、`claude`、`gemini`、`aider` 的 descriptor，以及部分 CLI 的 runtime bootstrap 规则。
- **编排能力**
  从自然语言到工作流计划、工作流级并行执行、委托步骤、带合同边界的任务路由。
- **安全能力**
  danger detection、语义检查、sandbox mode、安全规则、确认路径、脱敏。
- **可观测与恢复**
  audit、trace、执行记录、输出持久化、失败日志、恢复决策。

## 怎么读文档

- 先看 [docs/README.md](./docs/README.md)。
- 再看 [docs/capabilities.md](./docs/capabilities.md) 了解能力地图。
- 再看 [docs/capabilities-reference.md](./docs/capabilities-reference.md) 了解当前功能细节和边界。
- [docs/usage.md](./docs/usage.md) 看常用命令。
- [docs/architecture.md](./docs/architecture.md) 看当前系统结构。

## 开发

```bash
npm install
npm run build
npm run test:run
npm run typecheck
```

## 仓库当前重点

当前仓库主要包含：

- TypeScript CLI 内核，
- workflow 和 execution 基础设施，
- 文档任务执行链路，
- agent runtime 注册与 adapter，
- VS Code extension workspace，
- 共享 task-contract 工具。

文档目前正在围绕“真实的当前能力面”重组。历史文档和重叠文档还保留着，但主入口已经切换到文档索引和能力文档。
