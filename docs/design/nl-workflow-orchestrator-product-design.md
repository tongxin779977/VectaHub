# NL Workflow Orchestrator 产品设计

> Document Status: Product Design / Migration Contract
> Authority: 解释 VectaHub 作为 NL Workflow Orchestrator 的产品功能设计。字段级结构以 [编排计划合同](../contracts/orchestration-plan.md) 和 [Workflow Draft 合同](../contracts/workflow-draft.md) 为准。
> Last Verified: 2026-05-30

## Problem

VectaHub 已经具备自然语言入口、workflow engine、文档任务执行、Agent Runtime、安全、trace 和 recovery 等能力，但这些能力仍然分散在多个入口和合同中。

当前主要问题不是“缺一个 Agent”，而是缺少一条权威的自然语言编排主链路：

```text
NL input
-> goal
-> capability match
-> plan proposal
-> workflow draft
-> safety review
-> execute
-> verify
-> recover
```

如果没有这条主链路，产品会表现成一组 CLI 功能集合，而不是一个可解释、可审查、可恢复的 NL Workflow Orchestrator。

## Goals

- 把 VectaHub 的主产品定位收敛为单用户、本地优先的 NL Workflow Orchestrator。
- 让自然语言输入先形成可审查计划，再进入 workflow 或任务执行。
- 让 capability、workflow、Agent Runtime、安全、trace、验证和恢复都围绕同一套编排合同工作。
- 把用户测试从“命令是否通过”提升到“语义是否正确、回复是否有意义、下一步是否合理”。
- 保留现有文档任务执行优势，同时把多阶段文档任务升级到 workflow draft。

## Non-Goals

本设计不要求当前阶段实现：

- 托管式多用户平台。
- 分布式 workflow scheduler。
- autonomous swarm。
- 完整 MCP marketplace。
- runtime 自动生成 TypeScript adapter。
- chat-first 隐式执行产品。
- 模板市场、调度系统或监控平台作为主产品。

## Proposal

### 产品主链路

推荐的产品主链路如下：

```text
User intent / task document
-> input normalization
-> goal parsing
-> capability routing
-> OrchestrationPlan
-> WorkflowDraft
-> PlanSafetyReview
-> confirmation
-> execution
-> verification
-> trace / audit / recovery
```

这个链路应成为 `run`、文档任务、Agent delegation 和后续 UI 的共同基础。

### 模块状态

| 模块 | 当前状态 | 产品判断 |
|------|----------|----------|
| NL entry | Current Implementation | 保留为主入口，后续统一 plan 输出。 |
| Capability Router | Current Implementation / Partial | 保留并升级为 capability catalog。 |
| Hybrid AI NL Engine | Target Design / Migration Contract | 补齐 Project Context Pack、LLM Planner、反馈学习和语义评估闭环。 |
| Workflow Engine | Current Implementation / Hardening Needed | 保留为执行核心，补 draft 生命周期。 |
| Document Task | Current Implementation | 保留为当前最成熟产品路径。 |
| Agent Runtime | Current Implementation / Migration Contract | 保留内建 registry，延后 custom marketplace。 |
| Delegate Step | Partial Implementation | 补 runtime 接线前不能宣传成完整多 Agent 执行。 |
| Security / Sandbox | Current Implementation | 保留并前移到 plan-level review。 |
| Trace / Audit / Recovery | Current Implementation / Partial | 保留并统一计划、workflow、文档任务引用。 |
| Service / Daemon / API | Partial / Secondary | 从主产品面降级，后续重评。 |
| Monitor / Debug | Secondary | 从主产品面降级，按内部工具处理。 |
| Templates / Schedule | Secondary / Target | 不作为当前 NL 编排主线。 |

## 功能设计

### 1. NL Entry

`run` 是默认自然语言入口。

它应该输出以下几类结果：

- `reply`：只需要解释或回答，不执行。
- `clarify`：输入不足，需要用户补充。
- `blocked`：请求不安全或当前不支持。
- `plan`：生成可审查编排计划。
- `workflow_draft`：生成可 dry-run 和执行的 workflow draft。
- `execution_result`：已确认后执行的结果。

当前能力路由、LLM fallback、直接 shell fallback 和 workflow 文件路径应逐步收敛到同一套 JSON 结构。

### 2. Capability Router

Capability Router 负责把目标映射到已知能力。

当前默认能力较少，后续应演进为 capability catalog。catalog 至少应描述：

- capability id。
- 支持的任务类型。
- 输入边界。
- 输出类型。
- 是否会执行命令。
- 是否会写文件。
- 需要哪些验证。
- 对应的安全策略。

LLM 可以使用 catalog 做选择，但不能自行声明不存在的能力。NL AI 化的完整设计见 [Hybrid AI NL Engine 设计](./hybrid-ai-nl-engine.md)。

### 3. OrchestrationPlan

`OrchestrationPlan` 是自然语言编排结果的权威结构。

它不等于 workflow，也不等于 Agent 任务。它是执行前的审查对象。

计划必须说明：

- 目标。
- 假设。
- 子任务。
- 推荐执行者。
- 副作用等级。
- 风险摘要。
- 确认要求。
- 验证计划。

详细合同见 [编排计划合同](../contracts/orchestration-plan.md)。

### 4. Workflow Draft

当任务包含多个步骤、依赖关系、副作用或验证要求时，应生成 workflow draft。

workflow draft 不是已执行 workflow，而是一个可审查、可保存、可转换为执行记录的中间状态。

详细合同见 [Workflow Draft 合同](../contracts/workflow-draft.md)。

### 5. Plan Safety Review

Plan Safety Review 应在执行前评估整份计划，而不是只在单个命令执行时评估。

安全审查应覆盖：

- 文件读取。
- 文件写入。
- 命令执行。
- 网络访问。
- Agent CLI 调用。
- 高风险命令。
- 需要用户确认的步骤。

LLM 可以解释风险和建议替代方案，但 deterministic policy 决定 allow、confirm 或 block。

### 6. Agent Runtime

Agent Runtime 负责描述和调用外部 Agent CLI。

当前内建 Agent：

- `codex`
- `claude`
- `gemini`
- `aider`

产品原则：

- Agent CLI 是 worker。
- VectaHub 持有状态、计划、验证、trace 和恢复真相。
- 未完成 runtime 接线前，`delegate` 只能写成 Partial Implementation。
- custom Agent 需要 registry、preflight、permission、trace、verification 都稳定后再声明为当前能力。

### 7. Document Task

文档任务是当前最成熟的产品路径。

单个明确任务可以继续走：

```text
parse-doc
-> AgentTaskContract
-> run-task
-> verification
-> doc-task-runs
-> recover-task
```

多阶段任务应升级为：

```text
task document
-> parsed task candidates
-> OrchestrationPlan
-> WorkflowDraft
-> execution
-> verification / recovery
```

### 8. Trace, Audit, Verification, Recovery

所有执行路径最终都应能回答：

- 用户输入是什么。
- 计划是什么。
- 执行了哪些步骤。
- 哪些步骤被确认或阻断。
- 哪个 Agent 或命令被调用。
- 验证是否通过。
- 失败是否可恢复。

Agent exit code 不能单独决定任务成功。验证闭环才是最终完成依据。

## Tradeoffs

### 保持本地优先

本地优先让系统更轻、更容易审计，也更适合开发者工作流。代价是暂时不追求多用户平台和远程协作控制面。

### 计划优先而不是直接执行

计划优先会增加一步确认和结构化输出成本，但它能显著提升安全、可解释性、测试稳定性和 recovery 质量。

### 保留 Agent Runtime 但不追 MCP 生态

内建 Agent Runtime 足够支撑当前产品。过早做 MCP 或 marketplace 会引入额外权限、schema、审计和失败处理复杂度。

## Test Plan

本设计落地后，后续实现应覆盖：

- `run --dry-run --json` 输出统一 plan shape。
- capability route、LLM fallback、direct shell fallback 的语义一致性。
- workflow draft 创建、确认、执行、记录、恢复状态。
- plan-level safety review 的 allow / confirm / block。
- Agent delegation 的 preflight、execution、verification、failure classification。
- 文档任务从单任务执行升级到多阶段 workflow draft。
- 语义验收测试覆盖同义表达、危险输入、模糊输入、非执行回复和多步骤任务。

## Assumptions

- 本设计描述的是产品方向和迁移合同，不声明所有目标能力已经实现。
- 现有 `run-task` 文档任务路径仍然是当前最成熟执行路径。
- `run` 是 NL Workflow Orchestrator 的默认产品入口。
- Service、daemon、monitor、debug、templates、schedule 可以暂时保留，但不作为当前主产品面。
