# VectaHub NL Workflow Orchestrator

> Document Status: Product Direction / Current Shape Assessment
> Authority: 产品定位入口。字段级合同以 [核心合同](./contracts.md) 和 `docs/contracts/` 为准，当前能力边界以 [能力地图](./capabilities.md) 和源码为准。
> Last Verified: 2026-05-30

## 定位

VectaHub 当前最适合被定位为一个**单用户、本地优先的 NL Workflow Orchestrator**。

它不是传统意义上的 Agent CLI，也不是 autonomous agent swarm。它的价值不在于“自己成为最强 agent”，而是在自然语言、本地命令、文档任务、外部 Agent CLI、workflow、安全、trace、验证和恢复之间建立一层可治理的编排层。

推荐主链路：

```text
User intent / task document
-> goal parsing
-> capability routing
-> plan proposal
-> workflow draft
-> safety review
-> execution
-> verification
-> trace / recovery
```

## 当前真实形态

当前已经成立的产品能力：

- `run` 是自然语言入口，可以进入能力路由、LLM fallback 或 workflow 执行路径。
- workflow engine 已支持 `exec`、`if`、`for_each`、`parallel`、`opencli` 和 `delegate` step 类型。
- `parse-doc`、`run-task`、`doc-task-runs` 和 `recover-task` 已形成文档任务执行链路。
- Agent runtime 已有内建 registry 和 adapter，覆盖 `codex`、`claude`、`gemini`、`aider`。
- 安全、sandbox、audit、trace、execution record、recovery 基础设施已经存在。
- 标准体系已经覆盖质量评分、智能化原则、文档治理和验证门禁。

当前仍是 Partial Implementation 的部分：

- 还没有统一的 `OrchestrationPlan` 作为 NL 编排结果合同。
- `run --dry-run --json` 在不同输入路径下的输出形态仍需要统一。
- workflow draft 生命周期尚未完整收口到 review、confirm、persist、snapshot/hash、execute、recover。
- `delegate` 已有类型和 handler，但默认 workflow executor 尚未完整接入 Agent Runtime 执行闭环。
- artifact handoff、plan-level safety review、semantic acceptance gate 仍是目标能力。
- NL AI 化需要按 Hybrid AI NL Engine 路线补齐 Project Context Pack、Capability Catalog、LLM Planner 和 feedback learning。

## 非目标

当前阶段不建议把 VectaHub 描述成：

- 托管式多用户 control plane。
- 分布式 workflow scheduler。
- 完整 autonomous agent loop。
- 多 agent swarm supervisor。
- 通用 MCP marketplace。
- chat-first assistant。
- template marketplace 作为主产品。

这些方向可以保留为远期可能性，但不应干扰当前 NL Workflow Orchestrator 主线。

## 核心产品能力

### 1. 自然语言入口

用户通过 `run` 输入自然语言。系统应先判断输入是直接回复、澄清、能力路由、workflow draft、文档任务，还是需要阻断。

LLM 可以用于意图解析、工具选择、参数提取和解释，但不能绕过确定性合同、安全策略和 schema 校验。

### 2. 计划优先

多步骤任务不应直接隐藏在一次 Agent 调用里执行。系统应先生成可审查计划，再决定是否落成 workflow draft。

计划至少要说明：

- 用户目标。
- 子任务拆解。
- 推荐执行者。
- 可能的副作用。
- 需要确认的步骤。
- 验证方式。
- 失败后的恢复路径。

### 3. Workflow Draft

复杂任务最终应落成 workflow draft，而不是直接执行自由文本计划。

workflow draft 应支持：

- dry-run。
- 用户审查。
- 风险摘要。
- 执行前确认。
- 保存。
- 执行记录。
- rerun / resume / recover。

### 4. Agent 作为 Worker

外部 Agent CLI 是 worker，不是系统真相源。

VectaHub 负责：

- 选择 Agent。
- 构建任务输入。
- 控制执行生命周期。
- 记录输出摘要。
- 运行验证。
- 分类失败。
- 触发恢复或要求人工处理。

### 5. 安全、验证和恢复

NL Workflow Orchestrator 必须默认可控。

要求：

- 有副作用的步骤必须进入确认边界。
- 高风险命令必须被阻断或要求确认。
- Agent 成功退出不等于任务成功。
- 验证结果必须进入执行记录。
- trace 和 audit 不得污染 JSON stdout。
- recovery 必须基于失败分类、trace 链接和上下文 hash，而不是靠模型猜测。

## 建议主命令面

当前主线建议优先维护：

```text
vectahub run
vectahub run --dry-run --json
vectahub run --file
vectahub parse-doc
vectahub run-task
vectahub doc-task-runs
vectahub recover-task
vectahub trace
vectahub tools agents --json
vectahub security
vectahub doctor
```

建议降级、隐藏或后续重评的命令：

```text
vectahub serve
vectahub client
vectahub daemon
vectahub monitor
vectahub debug
vectahub generate
vectahub schedule
vectahub templates
vectahub provider
```

这些命令不一定要立即删除，但不应再作为当前产品主线宣传。

## 后续阅读

- [NL Workflow Orchestrator 产品设计](./design/nl-workflow-orchestrator-product-design.md)
- [Hybrid AI NL Engine 设计](./design/hybrid-ai-nl-engine.md)
- [编排计划合同](./contracts/orchestration-plan.md)
- [Workflow Draft 合同](./contracts/workflow-draft.md)
- [语义验收标准](./standards/semantic-acceptance.md)
- [模块范围整理建议](./design/module-scope-cleanup.md)
- [能力地图](./capabilities.md)
- [架构总览](./architecture.md)
