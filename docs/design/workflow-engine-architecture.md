# 工作流引擎架构设计

> Document Status: Design / Hardening Roadmap
> Authority: 本文解释 workflow engine 的当前真实能力、缺口、目标合同和阶段路线。字段级语法以 [Workflow 规格](../workflow-spec.md) 为准。

## 定位

Workflow engine 是 VectaHub 的自动化内核。

它不应该被理解成一个大型分布式调度平台，而应该被理解成一个**单用户、本地优先、强合同、强恢复、可编排外部 Agent CLI 的轻量执行器**。

它的价值是：

- 把自然语言、文档任务或手写 YAML 转成明确步骤。
- 让步骤有顺序、依赖、变量、输出和失败语义。
- 把外部 CLI 和 Agent CLI 纳入同一套执行记录。
- 在执行前后保留审计、trace、恢复和安全边界。

## 当前能力事实

当前源码中的 step 类型包括：

```text
exec
for_each
if
parallel
opencli
delegate
```

当前已经稳定存在的能力：

- `exec` 可以执行本地命令。
- `if` 可以按条件执行子步骤。
- `for_each` 可以遍历 items 并执行 body。
- `parallel` 可以并行执行 body 内的子步骤。
- `opencli` 有默认 handler，可以调用 `opencli`。
- workflow 执行会做依赖校验和拓扑排序。
- workflow 执行会保存 execution record。
- `resumeFromFailure` 可以从失败步骤恢复执行。
- 执行过程中会进行安全检测、审计和 output 记录。

当前必须谨慎描述的能力：

- `delegate` 已经进入类型和校验，但默认 executor 没有注册 `delegate` handler。
- 独立的 `parallel-executor` 已有依赖感知队列，但主 workflow engine 仍以拓扑排序后的串行 loop 为主。
- workflow 文件文档建议 `schemaVersion`，但源码类型还没有强制该字段。
- workflow 保存当前主要是序列化写盘，没有统一 parse、normalize、validate、round-trip 校验。
- execution record 当前按 `workflowId` 找回 workflow，尚未绑定 workflow 定义快照或 hash。

## 视角拆解

### 类型与持久化视角

当前 `Workflow` 更像运行时对象，不是完整的文件合同。

现状问题：

- 缺少强制 `schemaVersion`。
- 缺少 `definitionVersion`。
- 缺少 `definitionHash`。
- 保存前没有回读校验。
- 读取时大量依赖类型断言。
- history version 与主 workflow 存储还没有统一成一个版本化定义系统。

建议合同：

```text
WorkflowDefinition v1
-> WorkflowFileEnvelope
-> WorkflowRunSnapshot
```

职责拆分：

- `WorkflowDefinition v1`：定义顶层字段、steps、依赖关系、静态可执行性。
- `WorkflowFileEnvelope`：定义文件版本、定义版本、hash、来源和更新时间。
- `WorkflowRunSnapshot`：定义一次执行到底使用哪个 workflow 定义。

### 执行与控制流视角

当前主 engine 的执行模型是：

```text
validate dependencies
-> topological sort
-> sequential execution loop
-> update context
-> persist execution record
```

这对本地 CLI 很务实，但还不是完整调度器。

应补强的点：

- 明确主 engine 和 `parallel-executor` 的边界。
- 让 DAG ready queue 成为统一执行模型，而不是主 loop 和独立 parallel executor 并存。
- 支持 workflow 级 `maxConcurrency`。
- 支持 step 级失败策略，例如 `failFast`、`continueOnError`、`retry`。
- 让 `parallel` 继续作为用户可见语法，但底层复用统一 scheduler。

不建议优先做的点：

- 分布式 worker。
- 长驻任务队列。
- 多租户调度。
- Web 控制台式的复杂编排管理。

### 多 Agent CLI 编排视角

VectaHub 的目标不是自己替代所有 Agent CLI，而是调度它们。

推荐模型：

```text
VectaHub workflow
-> Agent registry
-> Agent adapter
-> Agent process
-> artifacts / outputVar
-> next step
```

最小可行 `delegate` 合同应包括：

- `delegateTo`：目标 agent，例如 `codex`、`gemini`、`claude`、`aider`、`custom`。
- `delegatePrompt`：明确任务输入。
- `delegateContext`：结构化上下文。
- `delegateOptions`：turns、timeout、output format、allowed tools。
- `inputArtifacts`：读取哪些上游产物。
- `artifacts`：本步骤写出哪些产物。
- `permissionPolicy`：执行前后需要怎样确认。

当前优先级应该是把 `delegate` 做成可靠的 workflow step handler，而不是直接做复杂的 multi-agent swarm。

### 安全、trace 与恢复视角

workflow engine 的恢复不能只靠“重新跑一次”。

必须回答这些问题：

- 这次执行使用的是哪个 workflow 定义？
- 上一次失败发生在哪个 step？
- 前序 step 的输出是否还能被信任？
- workflow 文件是否已经变化？
- 失败后是否产生了文件改动？
- 是否允许自动 retry？
- 需要用户先看 diff 吗？

最低要求：

- execution record 保存 `workflowDefinitionHash` 或 snapshot 引用。
- resume 前比较当前 workflow 定义和历史执行定义。
- 如果定义变化，默认阻断自动 resume，转为明确确认或 rerun。
- 每个 Agent CLI step 都单独进行风险评估。
- 不保存完整 stdout、完整 prompt、完整 diff、secrets。

## 目标合同

推荐的 workflow 定义形态：

```yaml
schemaVersion: "1.0"
definitionVersion: 1
name: research-then-write
mode: relaxed
maxConcurrency: 2
steps:
  - id: collect
    type: opencli
    site: project
    command: inspect
    outputVar: research_summary

  - id: draft
    type: delegate
    delegateTo: gemini
    dependsOn: [collect]
    delegatePrompt: "基于 ${research_summary} 生成文档草稿。"
    delegateOptions:
      maxTurns: 3
      outputFormat: text
    artifacts:
      - name: draft_doc
        path: artifacts/draft.md

  - id: apply
    type: delegate
    delegateTo: codex
    dependsOn: [draft]
    delegatePrompt: "读取 artifacts/draft.md 并更新项目文档。"
    inputArtifacts:
      - artifacts/draft.md
```

注意：上面的 `definitionVersion`、`maxConcurrency`、`artifacts`、`inputArtifacts` 仍是目标合同，不代表当前源码已经完整支持。

## 阶段路线

### Phase 1: WorkflowDefinition v1

目标：

- 给 workflow 文件定义强合同。
- 保存前做 round-trip 校验。
- 读取统一走 parser / normalizer / validator。
- 新文件写入 `schemaVersion: "1.0"`。

验收：

- 坏 workflow 文件在读取阶段失败。
- 保存出的 YAML 能立刻被同一套逻辑读回。
- 非法 step、缺失依赖、循环依赖在执行前暴露。

### Phase 2: Execution Snapshot

目标：

- execution record 绑定 workflow 定义 hash。
- resume / rerun 能判断定义是否变化。
- 恢复记录能解释“为什么允许恢复”。

验收：

- 修改 workflow 后，旧 execution 默认不能静默 resume。
- 用户能看到旧定义、新定义、失败 step 和建议动作。

### Phase 3: Delegate Handler

目标：

- `delegate` 成为可执行 step。
- 通过 Agent registry 查找目标 Agent CLI。
- 统一处理 timeout、cwd、env、stdout、stderr、exit code。
- 每个 delegate step 独立做权限确认和 trace。

验收：

- `delegateTo: codex`、`delegateTo: gemini` 等目标能通过统一 adapter 执行。
- 未安装或不可用的 Agent CLI 在 preflight 阶段明确失败。
- delegate 输出能进入 `outputVar` 或 artifact。

### Phase 4: Unified Scheduler

目标：

- 统一主 engine 和 parallel executor。
- 支持 DAG ready queue。
- 支持 workflow 级并发上限。
- 明确失败策略。

验收：

- 串行 workflow 行为保持兼容。
- 有独立依赖分支时可以安全并行。
- 失败、暂停、终止、恢复语义仍可审计。

### Phase 5: Artifact Handoff

目标：

- 大输出落 artifact。
- step 明确声明读写 artifact。
- trace 能从 artifact 回到 step 和 execution。

验收：

- 长文档、研究材料、代码审查结果不再塞进变量。
- resume / recovery 能知道每个 artifact 来自哪个 step。

## 架构取舍

应该优先做：

- 强 workflow 合同。
- 保存和读取正确性。
- 执行快照。
- 可执行的 `delegate` handler。
- 轻量 artifact 交接。
- 本地可审计恢复。

不应该优先做：

- 分布式调度。
- 多用户权限模型。
- 大型 workflow UI。
- 自动 swarm。
- 没有明确输入输出的 agent 自由协作。

## 与行业方案的关系

VectaHub 可以借鉴这些方向，但不需要照搬：

- Airflow / Dagster：借鉴 DAG、依赖和可观察性，不照搬服务化调度平台。
- Temporal：借鉴 durable execution 和 replay 思路，不照搬分布式 worker 模型。
- LangGraph：借鉴 agent state graph，不照搬复杂状态图作为第一版本。
- GitHub Actions：借鉴 step、job、artifact 和日志模型，不照搬远端 CI 平台。
- Make / Zapier：借鉴低门槛编排体验，不照搬多租户 SaaS 集成市场。

对 VectaHub 来说，最正确的路线是：

```text
local workflow contract
-> safe execution
-> agent CLI delegation
-> trace / recovery
-> lightweight artifacts
```

而不是：

```text
distributed platform
-> generic agent swarm
-> visual SaaS workflow builder
```
