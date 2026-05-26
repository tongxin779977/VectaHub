# 安全、Trace、执行记录与恢复架构设计

> Document Status: Design / Hardening Roadmap
> Authority: 本文解释 VectaHub 如何统一安全确认、trace、执行记录、输出摘要、失败分类和恢复决策。`run-task` 的完整执行语义以 [Run-Task 执行合同规格](../specs/run-task-execution-contract.md) 为准。

## 定位

这层是 VectaHub 的执行闭环。

它不负责“做任务”，而负责保证任务执行过程：

- 可确认，
- 可追踪，
- 可记录，
- 可验证，
- 可恢复，
- 不泄露敏感信息，
- 不在过期上下文上继续自动执行。

推荐总链路：

```text
Plan / Workflow / Agent Step
-> Permission Gate
-> Execution
-> Trace / Audit
-> Output Summary
-> Verification
-> Failure Classification
-> Recovery Decision
```

## 当前能力事实

当前已经存在的能力：

- `run-task` 已经定义执行前确认、执行后确认、未收口执行。
- `run-task` 已经有 trace spans，例如 contract、security、preflight、spawn、collect git changes、verification。
- `run-task` 输出包含 `gitChanges`、`verification`、`riskAssessment`、`failureKind`、`unclosedExecution` 等结构化字段。
- workflow execution record 会保存执行状态和 step records。
- workflow output store 会把大输出拆到独立输出目录并在 record 中保留摘要引用。
- doc-task recovery 已有 `decideRecovery()` 纯函数。
- `recover-task` 可以执行 `retry_direct`，对 `suggest_fix` 和 `blocked` 返回结构化建议。
- security protocol、sandbox、detector、redactor、trace-audit system 已有基础设施。

当前边界：

- `run-task` 的安全与恢复语义最清楚，但还没有统一到 chat、workflow、delegate 的所有入口。
- workflow resume 尚未绑定 workflow 定义 hash 或 snapshot。
- workflow execution record 尚未完整记录 permission decision、agent target、artifact refs、recovery refs。
- trace、execution record、artifact、recovery record 之间还缺统一引用合同。
- trace-audit adapter 存在，但不代表所有 workflow 路径已经完整接入统一 trace。
- 恢复记录第一版仍偏 doc-task，workflow 通用恢复和 doc-task recovery 不能混成一个实现。

## 核心合同

### Permission Gate

Permission Gate 是所有有副作用执行的统一入口。

它必须区分：

| 类型 | 时机 | 是否已有副作用 | 处理 |
|------|------|----------------|------|
| 执行前确认 | spawn / command 前 | 没有 | 用户确认后可继续。 |
| 执行后确认 | 已有 `gitChanges` 后 | 有 | 必须先看 diff 或进入 bounded fix。 |
| fail closed | 执行前或恢复前 | 不一定 | 阻断并返回结构化原因。 |

必须 fail closed：

- `critical` 主命令风险。
- 未知 Agent 直接执行。
- `manual_only` Agent 自动执行。
- Agent runtime bootstrap 或 preflight 失败。
- workflow 定义 hash 和历史执行不一致。
- instruction hash / source document hash 不一致。
- artifact 缺失且下游 step 依赖它。
- 安全规则初始化失败且无法进入安全默认模式。

可以确认后继续：

- `high` 主命令风险，且调用方具备确认能力。
- `high/critical` 验证命令风险，且尚未运行验证命令。
- 执行计划明确、风险可解释、用户确认边界清楚的写操作。

### RunContext

所有执行入口都应共享一个最小上下文。

```ts
interface RunContext {
  traceId: string;
  rootSpanId?: string;
  source: 'chat' | 'run' | 'run-task' | 'workflow' | 'delegate' | 'recover-task';
  planId?: string;
  workflowId?: string;
  workflowDefinitionHash?: string;
  executionId?: string;
  taskId?: string;
  instructionHash?: string;
  sourceDocumentHash?: string;
  artifactRefs?: string[];
  recoveryRunId?: string;
  sourceRunId?: string;
}
```

注意：这是目标合同，不代表当前源码已经完整实现。

### Execution Record

执行记录应保存“可恢复所需摘要”，不是保存完整世界。

最小字段：

- run id / execution id，
- source，
- status，
- startedAt / endedAt，
- workflow id / definition hash，
- task id / instruction hash，
- trace id，
- step records，
- output summaries，
- artifact refs，
- permission decisions，
- failure kind，
- recovery decision ref。

### FailureKind

失败分类应该在 workflow、run-task、delegate 中逐步收敛。

推荐统一分类：

```text
failed_config
failed_preflight
failed_permission
failed_agent
failed_command
failed_json_protocol
failed_timeout
failed_test
failed_conflict
failed_artifact
failed_system_internal
needs_confirmation
cancelled
```

`needs_confirmation` 必须继续区分执行前确认和执行后确认，不能只用一个布尔值。

### RecoveryDecision

恢复决策应先分流，再执行。

```text
failure record
-> stale-context guard
-> side-effect check
-> recovery decision
-> optional execution
```

最小决策：

- `retry_direct`：无副作用、上下文未变、失败可重试。
- `suggest_fix`：已有副作用、验证失败、未收口执行或需要基于现有 diff 修复。
- `blocked`：配置错误、冲突、系统错误、上下文过期、权限不足。

## Trace 设计

Trace 不是日志替代品。

它回答：

- 这次用户操作从哪里开始？
- 调用了哪个 CLI？
- 哪个阶段失败？
- 失败时有哪些关键摘要？
- 恢复 trace 是否关联原始 trace？

目标 parent-child 关系：

```text
user action trace
-> plan span
-> workflow span
   -> step span
      -> permission span
      -> runtime preflight span
      -> agent spawn span
      -> verification span
-> recovery span
```

要求：

- CLI 直接运行时创建 root trace。
- 插件或上层入口调用 CLI 时继承 trace env。
- `recover-task` 必须创建新 trace，并关联 `sourceTraceId`。
- `delegate` step 应成为 workflow step span 的 child span。
- trace 不能污染 stdout。

## 输出与 Artifact

输出分三类：

| 类型 | 适用 | 记录方式 |
|------|------|----------|
| 小输出 | 短 stdout、简单结果 | execution record 摘要。 |
| 大输出 | 长文档、研究结果、报告 | artifact ref + summary + hash。 |
| 敏感输出 | token、auth、env、secret | 不保存；必要时只保存脱敏摘要。 |

禁止保存：

- secrets / token / auth 文件内容，
- 完整 env，
- 完整 prompt，
- 完整 stdout / stderr，
- 完整 git diff，
- 完整 trace spans 放入普通 run record，
- 完整源文档。

如果确实需要失败日志，也必须：

- 脱敏，
- 限制保留时间，
- 保留摘要和引用，
- 不进入普通 JSON 输出主体。

## 恢复规则

### 可直接重试

满足全部条件才允许：

- 没有 `gitChanges`，
- 没有 workflow / instruction / source document hash 变化，
- failure kind 属于 timeout、json protocol、agent transient 这类可重试失败，
- runtime 仍可用，
- 用户确认或策略允许。

### 必须 suggest_fix

以下情况不允许直接重试：

- 已有 `gitChanges`。
- timeout 但已有仓库副作用。
- Agent 失败但已有文件修改。
- JSON 协议失败但已有文件修改。
- verification failed。
- 未收口执行。

这类恢复必须基于现有 diff 做 bounded fix。

### 必须 blocked

以下情况必须阻断：

- config failure。
- conflict。
- system internal failure。
- cancelled。
- stale instruction hash。
- stale workflow definition hash。
- artifact missing。
- permission denied。

## 各入口统一规则

### Chat

- 普通回复不能执行。
- workflow proposal 不能自动越过确认边界。
- `/execute` 或明确确认才进入执行。
- shell / command bridge 必须显式前缀和风险确认。

### Run

- dry-run 不产生副作用。
- 从自然语言生成 workflow 后，保存和执行应有明确文案。
- 高风险命令走 Permission Gate。

### Run-Task

- 继续以 [Run-Task 执行合同规格](../specs/run-task-execution-contract.md) 为权威。
- 不要在其他文档重复定义完整生命周期。
- recovery 使用 `decideRecovery()` 这类确定性模型优先。

### Workflow

- 执行记录需要绑定 workflow 定义 hash。
- step record 应补 permission decision、artifact refs、agent target。
- resume 前必须做 stale-context guard。

### Delegate

- 每个 delegate step 都是独立 Agent execution。
- 必须有 runtime resolution、bootstrap、preflight、permission gate、trace child span。
- 输出进入 `outputVar` 或 artifact。

## 阶段路线

### Phase 1: PermissionDecision 合同

目标：

- 统一执行前确认、执行后确认、fail closed。
- run-task、workflow、delegate 使用同一类结构表达风险结果。

### Phase 2: RunContext 合同

目标：

- 引入最小统一上下文。
- 串起 traceId、executionId、workflow hash、instruction hash、artifact refs。

### Phase 3: Workflow Record Hardening

目标：

- workflow execution record 绑定 workflow definition hash。
- step record 记录 permission decision、agent target、artifact refs。

### Phase 4: Recovery Decision Unification

目标：

- workflow resume 和 doc-task recovery 共用恢复判断原则。
- 不强行共用同一个实现，但共用 failure kind 和 stale guard。

### Phase 5: Artifact-Aware Recovery

目标：

- artifact 缺失、过期、hash 不一致时能阻断下游步骤。
- recovery plan 能指向 producer step。

## 架构师收口

VectaHub 的安全恢复闭环应该坚持：

- 副作用前先确认。
- 副作用后先审查。
- 记录只存摘要和引用。
- 失败先分类，再决定动作。
- 上下文过期就阻断。
- Agent 输出不是状态真相源。

这层做稳以后，VectaHub 才能安全地承载多 Agent 编排。
