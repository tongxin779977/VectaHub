# Workflow Draft 合同

> Document Status: Target Design / Migration Contract
> Authority: 从编排计划到可审查 workflow 的目标生命周期合同。当前 workflow engine 已存在，但本文定义的 draft 生命周期仍需迁移实现。
> Last Verified: 2026-05-30

## 目标

`WorkflowDraft` 是 `OrchestrationPlan` 和真实 workflow execution 之间的中间状态。

它的作用是：

- 承接多步骤自然语言计划。
- 让用户在执行前审查步骤和风险。
- 把计划转换成 workflow engine 可以执行的结构。
- 保存执行前快照，支持 rerun、resume 和 recovery。
- 为语义测试和 UI 提供稳定中间对象。

## 生命周期

```text
OrchestrationPlan
-> WorkflowDraft(draft)
-> review
-> safety_reviewed
-> confirmed
-> persisted or ephemeral
-> executing
-> completed / failed / cancelled
-> recoverable / archived
```

## 状态模型

| 状态 | 含义 |
|------|------|
| `draft` | 已从 plan 生成，但还没有完成审查。 |
| `reviewed` | 用户或系统已查看步骤和风险摘要。 |
| `needs_confirmation` | 存在副作用或风险，等待确认。 |
| `confirmed` | 已通过必要确认，可以执行。 |
| `persisted` | 已保存为 workflow 文件或本地记录。 |
| `executing` | 已进入 workflow execution。 |
| `completed` | 执行完成且 verification 通过或无需 verification。 |
| `failed` | 执行失败或 verification 失败。 |
| `cancelled` | 用户取消或系统中断。 |
| `recoverable` | 失败后可进入 recovery。 |
| `archived` | 已归档，不应继续作为 active draft。 |

## 核心结构

```ts
interface WorkflowDraft {
  schemaVersion: '1.0';
  draftId: string;
  planId: string;
  status: WorkflowDraftStatus;
  name: string;
  mode: 'strict' | 'relaxed' | 'consensus';
  steps: WorkflowDraftStep[];
  safetyReview: DraftSafetyReview;
  confirmation?: DraftConfirmation;
  snapshot: WorkflowDraftSnapshot;
  verification: DraftVerification;
  trace?: WorkflowDraftTraceLink;
  metadata: WorkflowDraftMetadata;
}
```

## `WorkflowDraftStep`

```ts
interface WorkflowDraftStep {
  id: string;
  sourceTaskId: string;
  type: 'exec' | 'if' | 'for_each' | 'parallel' | 'opencli' | 'delegate';
  label: string;
  dependsOn: string[];
  command?: {
    cli: string;
    args: string[];
  };
  delegate?: {
    to: 'codex' | 'claude' | 'gemini' | 'aider' | 'custom';
    prompt: string;
  };
  outputVar?: string;
  artifactOutputs?: string[];
  sideEffect: 'none' | 'read' | 'write' | 'command' | 'network';
}
```

要求：

- `sourceTaskId` 必须引用 `OrchestrationPlan.tasks[]` 中的 task。
- `type: 'exec'` 必须提供 `command`。
- `type: 'delegate'` 必须提供 `delegate`，且目标 Agent 必须能被 runtime catalog 验证。
- `dependsOn` 必须能拓扑排序。
- `parallel` 只能用于依赖清楚且没有写冲突的步骤。

## `DraftSafetyReview`

```ts
interface DraftSafetyReview {
  status: 'not_reviewed' | 'safe' | 'needs_confirmation' | 'blocked';
  findings: DraftSafetyFinding[];
}
```

要求：

- 由 plan-level safety review 转换或重新计算。
- 不能因为转换成 workflow draft 就跳过安全审查。
- 如果任一步骤为 blocked，draft 不能进入 `confirmed`。

## `DraftConfirmation`

```ts
interface DraftConfirmation {
  confirmedAt: string;
  confirmedBy: 'user' | 'non_interactive_policy';
  confirmedTaskIds: string[];
  deniedTaskIds: string[];
}
```

要求：

- 确认必须绑定具体步骤或风险。
- 非交互模式不能默认允许高风险操作。
- 确认记录应可进入 audit 或 execution metadata。

## `WorkflowDraftSnapshot`

```ts
interface WorkflowDraftSnapshot {
  planHash: string;
  workflowHash: string;
  generatedAt: string;
  sourceCwd: string;
}
```

要求：

- `workflowHash` 用于 rerun / resume / recover 时判断定义是否变化。
- 如果执行记录中的 workflow hash 和当前 workflow 不一致，恢复必须保守处理。
- hash 不应包含 secrets 或未脱敏大输出。

## `DraftVerification`

```ts
interface DraftVerification {
  required: boolean;
  commands: Array<{
    cli: string;
    args: string[];
  }>;
  successCriteria: string[];
}
```

要求：

- 含 `apply`、`delegate` 或写文件步骤时默认需要 verification。
- 验证命令必须经过同样的安全评估。
- verification 失败时 draft 或 execution 不能标记为成功。

## `WorkflowDraftTraceLink`

```ts
interface WorkflowDraftTraceLink {
  traceId?: string;
  planId: string;
  executionId?: string;
  auditEventIds: string[];
}
```

要求：

- draft、plan、execution record、recovery record 应能互相定位。
- trace 写入失败不应污染 JSON stdout。
- trace 不得保存 secrets、完整 prompt、完整 diff 或未脱敏输出。

## `WorkflowDraftMetadata`

```ts
interface WorkflowDraftMetadata {
  createdAt: string;
  createdFrom: 'run' | 'chat' | 'document' | 'manual';
  cwd: string;
  dryRunAvailable: boolean;
  persistRequested: boolean;
}
```

## 转换规则

从 `OrchestrationPlan` 转换为 `WorkflowDraft` 时：

- `reply` task 不进入 workflow steps。
- `inspect` 可转换为只读 `exec`、`opencli` 或 Agent task。
- `transform` 可转换为 Agent task、本地脚本或 workflow step。
- `apply` 必须进入确认边界。
- `verify` 应转换为 verification plan 或 workflow step。
- `recover` 应进入 recovery loop，不应直接作为普通 apply step。

## 执行前阻断

以下情况不能执行 draft：

- draft 状态为 `draft` 且未审查。
- safety review 为 `blocked`。
- 需要确认但没有确认记录。
- step 依赖无法拓扑排序。
- `delegate` 目标 Agent 不可用。
- command schema 校验失败。
- workflow hash 或 plan hash 缺失且当前路径需要 recovery safety。

## 与现有 Workflow 的关系

当前 `Workflow` 是可执行结构，`WorkflowDraft` 是执行前结构。

迁移原则：

- 不破坏现有 `Workflow` 类型。
- 先让 `run --dry-run --json` 暴露 draft summary。
- 再逐步把 NL 多步骤任务转换为 `WorkflowDraft`。
- 最后将 confirmed draft 转换为现有 workflow engine 可执行的 `Workflow`。

## 验收要求

实现本文合同后至少应验证：

- NL 多步骤输入能生成 draft。
- draft dry-run 输出和执行输出结构一致。
- 未确认的副作用步骤不能执行。
- workflow hash 进入执行记录或可关联 metadata。
- rerun / resume / recover 能检测 workflow 定义变化。
- `delegate` draft 在 Agent 不可用时阻断。
