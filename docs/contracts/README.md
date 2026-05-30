# 合同规格索引

> Document Status: Current Implementation / Migration Contract
> Authority: `docs/contracts/` 下字段级合同、状态机、协议、存储、trace、recovery 和 security loop 的入口索引。
> Last Verified: 2026-05-31

## 使用方式

实现或审查跨模块能力时，先读本索引，再读对应合同。不要只根据设计文档或产品文档修改字段、状态、持久化记录或机器 JSON 输出。

如果一个能力还没有源码入口或验证路径，必须在文档中标注为 `Target Design` 或 `Migration Contract`。

## NL Workflow Orchestrator 合同

| 合同 | 职责 |
|------|------|
| [编排计划合同](./orchestration-plan.md) | 定义 NL 编排输出、计划状态、安全审查、确认和验证计划。 |
| [Workflow Draft 合同](./workflow-draft.md) | 定义 plan 到 workflow draft 的生命周期、snapshot/hash、执行前阻断和恢复边界。 |
| [工作流生命周期规格](./workflow-lifecycle.md) | 定义 workflow 保存、执行、历史、详情、重跑、恢复和归档。 |
| [CLI 命令面规格](./cli-command-surface.md) | 定义 CLI 命令面、机器输出和维护要求。 |

## 文档任务和 Agent 执行合同

| 合同 | 职责 |
|------|------|
| [Run-Task 执行合同](./run-task-execution-contract.md) | `run-task` 执行语义、预览、确认、验证、恢复和 LLM Context Pack 目标。 |
| [Agent Worker 合同](./agent-worker-contract.md) | Agent 任务输入、文件边界、验证命令、执行模式和 worker 约束。 |
| [文档任务状态机规格](./doc-task-state-machine.md) | 文档任务状态、失败分类和 UI/CLI 状态同步边界。 |

## 安全、Trace、恢复和验证

| 合同 | 职责 |
|------|------|
| [安全与权限闭环规格](./security-permission-loop.md) | 风险评估、确认拦截、脱敏和安全失败边界。 |
| [工具与安全规则规格](./tools-security-management.md) | `tools`、`security`、`run-command` 和 Agent runtime 相关命令语义。 |
| [Trace 执行规格](./trace-execution.md) | trace 传播、JSON stdout 隔离、插件/CLI/Agent 链路定位。 |
| [验证闭环规格](./verification-loop.md) | 验证命令、验证结果记录和成功判定边界。 |
| [恢复闭环规格](./recovery-loop.md) | 失败分类、恢复决策、instruction hash 和 trace 关联。 |

## 存储、性能和追踪矩阵

| 合同 | 职责 |
|------|------|
| [配置与数据存储规格](./config-data-storage.md) | VectaHub home、配置、执行记录、输出、trace、队列和归档落点。 |
| [性能与资源预算规格](./performance-budget.md) | 文档任务、trace、recovery 和 workflow 路径的资源预算。 |
| [实现追踪矩阵](./implementation-traceability.md) | 关联能力、权威合同、代码入口、验证路径和已知缺口。 |

## 已降级能力

本地 service、daemon、template、schedule、monitor、debug 等能力不属于当前 NL Workflow Orchestrator 主产品面。后续如果重新进入主线，必须先补合同和实现追踪矩阵，再更新能力地图。
