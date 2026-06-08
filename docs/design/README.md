# 设计文档索引

> Document Status: Current Design Index
> Authority: 当前主线设计文档入口。字段级合同以 `docs/contracts/` 为准，标准化规则以 `docs/standards/` 为准。
> Last Verified: 2026-06-09

## 当前主线

| 文档 | 职责 |
|------|------|
| [NL Workflow Orchestrator 产品设计](./nl-workflow-orchestrator-product-design.md) | 产品功能设计和模块边界。 |
| [Hybrid AI NL Engine 设计](./hybrid-ai-nl-engine.md) | NL AI 化、上下文包、能力目录、LLM Planner、反馈学习和语义评估。 |
| [NL Task Contract 重设计](./nl-task-contract-redesign.md) | 将 NL 主对象从 `intent` 迁移为 `TaskContract`，统一理解、执行策略和展示语义。 |
| [编排、委托与任务拆解架构设计](./orchestration-and-delegation-architecture.md) | 多步骤任务如何形成计划、workflow draft、Agent delegation 和 artifact handoff。 |
| [Workflow Engine 架构设计](./workflow-engine-architecture.md) | workflow engine、step model、执行语义和 hardening 方向。 |
| [安全、Trace、执行记录与恢复架构设计](./safety-trace-recovery-architecture.md) | 安全确认、trace、执行记录、输出摘要、失败分类和恢复决策。 |

## Agent 和文档任务

| 文档 | 职责 |
|------|------|
| [Agent CLI Runtime 架构设计](./agent-cli-runtime-architecture.md) | Agent registry、runtime catalog、adapter、bootstrap、preflight 与 `delegate` 目标分层。 |
| [Agent CLI Adapter 架构设计](./agent-cli-adapter-architecture.md) | Agent CLI 通用渲染、LLM 上下文和 migration sequencing。 |
| [Agent 执行系统设计](./agent-execution-system.md) | Agent 执行、context pack、runtime catalog 和 CLI/VS Code 共享模型。 |
| [文档处理架构设计](./document-processing-architecture.md) | 文档任务解析、合同构建、任务边界和执行链路。 |

## 边界和迁移

| 文档 | 职责 |
|------|------|
| [插件/CLI 边界设计](./plugin-cli-boundary.md) | VS Code 插件和 CLI 的职责分离。 |
| [合同单一事实源设计](./contract-single-source.md) | 合同推导、共享包和重复规则收敛。 |
| [NL Task Contract Migration Plan](./nl-task-contract-migration.md) | 现有 `templates / tool-calling / category-router / chat` 向 `TaskContract` 收敛的分阶段迁移计划。 |
| [Run Task 类型路由](./run-task-type-router.md) | 生成命令、任务分诊和非法命令阻断。 |
| [Worktree 隔离设计](./worktree-isolation.md) | worktree 隔离、diff 归因和清理策略目标。 |
| [Recovery Model](./recovery-model.md) | 恢复模型背景和迁移方向。 |
| [模块范围整理建议](./module-scope-cleanup.md) | 哪些模块保留、合并、降级或后续删除。 |
| [Secondary Capability Follow-Up](./secondary-capability-follow-up.md) | 记录 secondary 能力的当前保留/降级决策和后续动作。 |
| [VS Code UI 逻辑设计](./vscode-ui-logic.md) | VS Code 插件 UI 的目标交互逻辑。 |

## 不在当前主线

历史模块增强草案、service/daemon/template/schedule 方向和阶段性评估报告已从 `docs/` 移除。需要恢复时，应先建立合同、验证门禁和实现追踪。
