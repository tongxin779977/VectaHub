# VectaHub

> Local-first workflow automation for document-driven tasks, structured execution, and Agent CLI orchestration.

[![Version](https://img.shields.io/badge/version-1.0.14-blue)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D21.0.0-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)]()

[中文介绍](#中文介绍) · [Documentation](./docs/README.md) · [Repository Policy](./docs/repository-permissions.md)

## English Overview

VectaHub is a single-user, local-first TypeScript CLI for turning natural-language requests, task documents, and workflow files into auditable local execution.

It is strongest when you need to:

- parse task documents and run bounded Agent tasks;
- execute YAML or JSON workflows;
- route work to external Agent CLIs such as Codex, Claude, Gemini, or Aider;
- preview risky operations before execution;
- keep safety checks, trace records, verification, and recovery in the same execution path.

VectaHub is not a hosted multi-tenant control plane, a replacement for external Agent CLIs, or an enterprise workflow database.

## Quick Start

```bash
npm install -g vectahub
```

Run a natural-language request:

```bash
vectahub run "show git status"
vectahub run --dry-run "delete node_modules"
```

Run an explicit command through the safety path:

```bash
vectahub run-command -- npm test
```

Preview a document task contract:

```bash
vectahub run-task --task-id T1 --task-label "Add tests" --doc ./docs/task.md --contract-preview --json
```

Execute a document task through an Agent CLI:

```bash
vectahub run-task --tool codex --task-id T1 --task-label "Add tests" --doc ./docs/task.md --json
```

## Core Capabilities

- **Document task execution**: `parse-doc`, `run-task`, task contracts, verification, recovery, and trace-aware execution.
- **Workflow engine**: structured steps, interpolation, execution records, history/detail/rerun/resume/archive flows.
- **Agent CLI runtime**: built-in descriptors and runtime probing for common external Agent CLIs.
- **Safety and governance**: danger detection, semantic checks, sandbox modes, confirmation paths, audit, and redaction.
- **Observability and recovery**: trace records, run records, failure classification, and recovery commands.
- **VS Code extension workspace**: a local UI surface that consumes the CLI and shared task contracts.

## Documentation

- [Documentation index](./docs/README.md)
- [CLI usage](./docs/usage.md)
- [Capability map](./docs/capabilities.md)
- [Architecture overview](./docs/architecture.md)
- [Repository visibility and permissions](./docs/repository-permissions.md)
- [Release guide](./docs/release.md)

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run test:run
npm run build
```

For extension work:

```bash
npm run compile:extension
```

## Repository Safety

This repository is public. Anything committed here should be treated as public information.

Do not commit secrets, private task documents, real user data, raw trace output, `.vectahub/`, Agent home directories, local logs, generated VSIX files, or local build artifacts.

See [Repository Visibility and Permissions](./docs/repository-permissions.md) for the maintained policy.

---

## 中文介绍

VectaHub 是一个**单用户、本地优先**的 TypeScript CLI 自动化内核，用于把自然语言请求、任务文档和结构化 workflow 转成可审计的本地执行流程。

它适合：

- 解析任务文档，并通过有边界的合同执行 Agent 任务；
- 运行 YAML 或 JSON workflow；
- 路由外部 Agent CLI，例如 Codex、Claude、Gemini、Aider；
- 在执行前预览高风险操作；
- 把安全检查、trace、验证和恢复放在同一条执行链路里。

它不应该被理解成托管式多租户控制面、外部 Agent CLI 替代品，或企业级 workflow 数据库。

### 快速开始

安装：

```bash
npm install -g vectahub
```

运行自然语言请求：

```bash
vectahub run "查看 Git 状态"
vectahub run --dry-run "删除 node_modules"
```

运行明确命令并经过安全检查：

```bash
vectahub run-command -- npm test
```

预览文档任务合同：

```bash
vectahub run-task --task-id T1 --task-label "补测试" --doc ./docs/task.md --contract-preview --json
```

通过 Agent CLI 执行文档任务：

```bash
vectahub run-task --tool codex --task-id T1 --task-label "补测试" --doc ./docs/task.md --json
```

### 核心能力

- **文档任务执行**：`parse-doc`、`run-task`、任务合同、验证、恢复和 trace 关联。
- **Workflow 引擎**：结构化步骤、变量插值、执行记录、历史、详情、重跑和恢复。
- **Agent CLI runtime**：内建常见 Agent CLI descriptor 和运行探测路径。
- **安全治理**：危险检测、语义检查、sandbox mode、确认路径、audit 和脱敏。
- **可观测与恢复**：trace、运行记录、失败分类和恢复命令。
- **VS Code extension workspace**：消费 CLI 和共享任务合同的本地 UI 入口。

### 文档入口

- [文档索引](./docs/README.md)
- [CLI 使用手册](./docs/usage.md)
- [能力地图](./docs/capabilities.md)
- [架构总览](./docs/architecture.md)
- [仓库可见性与提交权限](./docs/repository-permissions.md)
- [发布指南](./docs/release.md)
