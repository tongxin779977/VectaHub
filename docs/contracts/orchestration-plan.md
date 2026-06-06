# 编排计划合同

> Document Status: Target Design / Migration Contract
> Authority: NL 编排输出的目标合同。当前实现已有 capability `ExecutionPlan` 和 workflow step 路径，但尚未完整实现本文定义的统一 `OrchestrationPlan`。
> Last Verified: 2026-05-30

## 目标

`OrchestrationPlan` 是自然语言或文档任务进入执行前的权威计划结构。

它解决的问题是：

- 让 NL 输出可审查。
- 让多步骤任务不再隐藏在一次 Agent 调用里。
- 让安全、确认、workflow draft、验证和恢复使用同一份计划。
- 让语义测试有稳定结构可断言。

推荐链路：

```text
NL input / task document
-> parsed goal
-> capability match
-> OrchestrationPlan
-> PlanSafetyReview
-> WorkflowDraft
-> execution
```

## 状态边界

| 状态 | 含义 |
|------|------|
| `draft` | 计划已生成，但还没有完成安全审查或用户确认。 |
| `needs_confirmation` | 存在副作用或风险，需要用户确认。 |
| `ready` | 已通过必要审查，可以转换为 workflow draft 或执行。 |
| `blocked` | 不安全、不支持、缺少上下文或违反合同，不能执行。 |
| `executed` | 计划已被执行路径消费。 |

当前实现不要求一次性支持全部状态，但任何文档或 UI 不得把目标状态写成已完成能力。

## 核心结构

```ts
interface OrchestrationPlan {
  schemaVersion: '1.0';
  planId: string;
  source: 'run' | 'chat' | 'document' | 'manual';
  goal: string;
  status: 'draft' | 'needs_confirmation' | 'ready' | 'blocked' | 'executed';
  assumptions: string[];
  tasks: OrchestrationTask[];
  safetyReview: PlanSafetyReview;
  requiredConfirmations: ConfirmationRequest[];
  verification: VerificationPlan;
  workflowDraft?: WorkflowDraftSummary;
  trace?: PlanTraceLink;
  metadata: OrchestrationPlanMetadata;
}
```

## `OrchestrationTask`

```ts
interface OrchestrationTask {
  id: string;
  kind: 'reply' | 'inspect' | 'transform' | 'apply' | 'verify' | 'recover';
  title: string;
  description?: string;
  executor: 'local' | 'workflow' | 'agent' | 'human';
  command?: CommandInvocation;
  delegateTo?: 'codex' | 'claude' | 'gemini' | 'aider' | 'custom';
  dependsOn: string[];
  inputs: PlanInputRef[];
  outputs: PlanOutputRef[];
  sideEffect: 'none' | 'read' | 'write' | 'command' | 'network';
  confidence: 'low' | 'medium' | 'high';
  needsConfirmation: boolean;
  blockingReason?: string;
}
```

要求：

- `id` 必须在计划内唯一。
- `dependsOn` 只能引用同一计划内存在的 task id。
- `executor: 'agent'` 时必须明确 `delegateTo`，除非状态为 `blocked` 或需要人工选择。
- `kind: 'reply'` 不应携带 command。
- `kind: 'apply'` 默认需要确认，除非安全策略明确允许。
- `sideEffect` 必须由规则或安全策略计算，LLM 不能单独决定。

## `CommandInvocation`

```ts
interface CommandInvocation {
  cli: string;
  args: string[];
  cwd?: string;
  envPolicy?: 'inherit-safe' | 'explicit-only';
}
```

要求：

- `cli` 不能为空。
- `args` 必须是字符串数组，不能是一整段未解析 shell 字符串。
- 生成命令必须经过命令面校验和安全评估。
- 未注册的 `vectahub` 子命令必须阻断，而不是继续执行。

## `PlanSafetyReview`

```ts
interface PlanSafetyReview {
  status: 'not_reviewed' | 'safe' | 'needs_confirmation' | 'blocked';
  maxRiskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  findings: SafetyFinding[];
  reviewedAt?: string;
}
```

```ts
interface SafetyFinding {
  taskId?: string;
  level: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  category: 'filesystem' | 'network' | 'command' | 'agent' | 'data' | 'unknown';
  reason: string;
  requiredAction: 'allow' | 'confirm' | 'block';
}
```

要求：

- `critical` 默认阻断。
- `high` 默认需要确认。
- 安全引擎不可用时必须保守处理。
- 安全 finding 不得包含 secrets 或完整敏感输出。

## `ConfirmationRequest`

```ts
interface ConfirmationRequest {
  id: string;
  taskIds: string[];
  reason: string;
  prompt: string;
  defaultAction: 'deny' | 'allow';
}
```

要求：

- 确认对象必须具体到 task 或 plan 级风险。
- 不能只展示泛泛的“是否继续”。
- 默认动作应保守，涉及写文件、网络或高风险命令时默认为 `deny`。

## `VerificationPlan`

```ts
interface VerificationPlan {
  required: boolean;
  commands: CommandInvocation[];
  semanticChecks: SemanticCheck[];
  successCriteria: string[];
}
```

```ts
interface SemanticCheck {
  id: string;
  description: string;
  expectedMeaning: string;
}
```

要求：

- Agent 执行成功不等于计划成功。
- 如果 plan 包含 `apply` 或 `agent` task，默认需要 verification。
- 验证命令同样必须经过安全评估。
- 验证结果应进入 execution record 或 task run record。

## 输入与输出引用

```ts
interface PlanInputRef {
  kind: 'text' | 'file' | 'artifact' | 'previous_output';
  ref: string;
  required: boolean;
}

interface PlanOutputRef {
  kind: 'text' | 'file' | 'artifact' | 'stdout' | 'report';
  ref: string;
  required: boolean;
}
```

要求：

- 大输出、研究材料、patch summary、审查结果应走 artifact，而不是塞进 stdout。
- artifact 必须绑定 producer task。
- artifact 应有摘要和 hash。
- artifact 不得保存 secrets、完整 trace、完整 prompt 或未脱敏大输出。

## `WorkflowDraftSummary`

```ts
interface WorkflowDraftSummary {
  draftId: string;
  stepCount: number;
  hasSideEffects: boolean;
  requiresConfirmation: boolean;
}
```

详细生命周期见 [Workflow Draft 合同](./workflow-draft.md)。

## `PlanTraceLink`

```ts
interface PlanTraceLink {
  traceId?: string;
  auditEventIds: string[];
  executionId?: string;
}
```

要求：

- trace 不得污染 JSON stdout。
- plan、workflow draft、execution record、recovery record 应能互相定位。
- trace 写入失败不能把安全判断降级为允许。

## `OrchestrationPlanMetadata`

```ts
interface OrchestrationPlanMetadata {
  createdAt: string;
  cwd: string;
  intentRecognitionMethod: 'capability' | 'llm' | 'direct' | 'document' | 'manual';
  matchedCapability?: string;
  confidence?: number;
}
```

要求：

- `confidence` 只能辅助展示，不能单独决定是否执行。
- `matchedCapability` 必须来自已注册 capability，不得由 LLM 编造。
- `cwd` 应来自运行环境，不应从用户自然语言中猜测。

## 阻断条件

计划必须阻断的情况：

- 生成了当前 CLI 不存在的命令。
- 命令风险为 critical。
- 需要写文件但没有明确目标或确认。
- Agent 选择未知且没有 runtime catalog 支持。
- 工作目录、输入文件或文档任务边界不可确认。
- LLM 输出无法通过 schema 校验。
- 多意图中存在不可执行或需要澄清的子句。

## 兼容策略

迁移期间允许保留现有 capability `ExecutionPlan`，但对外机器接口应逐步收敛到 `OrchestrationPlan`。

在未完成迁移前：

- 文档必须标注 Partial Implementation。
- `run --dry-run --json` 可以先增加兼容字段，但不应删除当前字段。
- UI 或测试不得依赖目标字段已存在，除非对应实现已经合入。

## 验收要求

实现本文合同后至少应验证：

- capability route 能生成 `OrchestrationPlan`。
- LLM fallback 输出必须通过 schema 校验。
- direct shell fallback 也能映射到统一 plan 结构。
- 危险输入产生 `blocked` 或 `needs_confirmation`。
- `run --dry-run --json` stdout 为单个纯 JSON 对象。
- 语义验收测试覆盖同义表达、模糊输入、危险输入和非执行回复。
