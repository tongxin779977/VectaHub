# VectaHub 文档

VectaHub 是面向 AI 辅助开发的工程执行控制面。

它不与底层 Agent 比“聪明”，而是把自然语言、文档任务、CLI 命令和 Agent 执行纳入同一套可预览、可追踪、可约束、可验证、可恢复的工作流。

```text
Agent = Worker
VectaHub = Orchestrator
```

## 核心问题

VectaHub 解决的是 AI 执行失控问题：

- Agent 输入过大，任务边界不清，容易改错文件。
- Agent 自述完成，但缺少真实验证。
- 执行过程缺少 trace，失败后难以定位。
- 高风险命令、权限确认和敏感信息脱敏没有统一闭环。
- CLI、VS Code 插件和未来服务端协议容易各自复制逻辑。
- 文档任务、执行记录、恢复记录之间缺少可靠状态来源。

## 关键要求

所有核心能力必须服务于以下要求：

| 要求 | 含义 |
|------|------|
| 可预览 | 自然语言和文档任务执行前必须能生成 preview。 |
| 可约束 | Agent 只能执行边界清楚的小任务，修改范围和验证命令必须结构化。 |
| 可追踪 | 每次用户操作、CLI 调用、Agent 执行和验证命令都能关联 trace。 |
| 可验证 | Agent 成功后必须进入验证阶段，不能只依赖 Agent 输出。 |
| 可恢复 | 失败必须分类，并提供恢复、重试或人工处理路径。 |
| 安全默认 | `dry-run` 零副作用，高风险命令确认，敏感信息不得落盘。 |
| 单一事实源 | CLI、插件、未来 SDK 不能长期维护重复合同逻辑。 |

## 文档入口

| 文档 | 用途 |
|------|------|
| [架构总览](./architecture.md) | 项目定位、系统边界、模块职责和演进方向。 |
| [核心合同](./contracts.md) | CLI JSON、任务状态、Agent 合同、Trace、安全、恢复等协议入口。 |
| [Agent 执行系统](./agent-execution.md) | `VectaHub = Orchestrator` 的执行模型和阶段边界。 |
| [设计文档](./design/agent-execution-system.md) | 关键能力的方案、取舍和非目标。 |
| [规格合同](./specs/agent-worker-contract.md) | 状态机、trace、验证、安全、恢复等细节规格。 |
| [UI 操作文档](./ui/vscode-extension.md) | VS Code 插件实际视图、命令和用户路径。 |
| [CLI 命令面](./specs/cli-command-surface.md) | 当前 CLI 命令、参数、JSON 支持和副作用边界。 |
| [工作流生命周期](./specs/workflow-lifecycle.md) | 工作流保存、执行、历史、详情、重跑、恢复和归档。 |
| [工具与安全规则](./specs/tools-security-management.md) | CLI 工具注册、命令规则、安全规则增删改查和风险检测。 |
| [生成、模板与调度](./specs/templates-generation-scheduling.md) | LLM 生成 workflow、模板市场、本地模板和 cron 调度。 |
| [服务与导入导出](./specs/service-import-export.md) | 本地 socket 服务、AI daemon、数据导入导出和模式切换。 |
| [配置与数据存储](./specs/config-data-storage.md) | `VECTAHUB_HOME`、执行记录、输出、trace、队列和归档落点。 |
| [路线图](./roadmap.md) | 当前优先级、下一步任务和不建议立即投入的方向。 |
| [归档说明](./archive.md) | 旧文档清理原则和仍保留的参考文档。 |
| [Agent 操作规范](./agent-operating-guide.md) | 开发 Agent 执行项目任务时必须遵守的工程规范。 |

## 阅读路径

新加入项目时按以下顺序阅读：

1. [架构总览](./architecture.md)
2. [Agent 执行系统](./agent-execution.md)
3. [核心合同](./contracts.md)
4. [插件/CLI 边界设计](./design/plugin-cli-boundary.md)
5. [VS Code 插件 UI](./ui/vscode-extension.md)
6. [CLI 命令面](./specs/cli-command-surface.md)
7. [工作流生命周期](./specs/workflow-lifecycle.md)
8. [工具与安全规则](./specs/tools-security-management.md)
9. [路线图](./roadmap.md)

做具体实现时再读取相关规格文档，不要默认通读所有历史材料。

## 当前事实边界

当前仓库是 TypeScript CLI + VS Code 插件 + 共享合同包项目。当前事实来源包括 `src/`、`packages/vectahub-vscode-extension/` 和 `packages/doc-task-contract-core/`。

文档中的“已有第一版”表示已有设计或实现记录，但最终状态必须以当前代码、测试和运行结果为准。完成任务前仍需运行相关验证命令。
