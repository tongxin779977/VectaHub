# Hybrid AI NL Engine 设计

> Document Status: Target Design / Migration Contract
> Authority: NL Engine AI 化、智能规划、反馈学习和语义评估的当前主线设计。字段级输出以 [编排计划合同](../contracts/orchestration-plan.md) 为准。
> Last Verified: 2026-05-31

## Problem

当前 NL 路径已经具备 capability route、LLM fallback、tool-calling、直接安全 shell fallback 和 workflow step 生成能力，但整体仍存在三个问题：

- 输出结构不统一，难以稳定进入 workflow draft、UI 和语义测试。
- capability、Agent runtime、项目上下文和安全策略没有形成稳定的 LLM 上下文包。
- 反馈学习还没有成为可审计、可回放、可进入 eval 的闭环。

NL AI 化的目标不是让 LLM 直接执行命令，而是让 LLM 更好地理解、选择、规划和解释；由 VectaHub 负责合同、安全、执行、验证和恢复。

## Goals

- 让所有 NL 输入收敛为统一 `OrchestrationPlan` 或明确的 `reply` / `clarify` / `blocked`。
- 用 `Project Context Pack` 给 LLM 提供当前项目事实。
- 用 `Capability Catalog` 限制 LLM 只能选择真实存在的能力。
- 用 LLM Planner 生成计划，而不是直接执行。
- 用 schema validation、command surface validation 和 safety review 阻止越权。
- 用 feedback record 把用户纠正、执行失败和语义 E2E 结果沉淀为可审计学习材料。
- 用 semantic acceptance gate 判断回复意义、计划质量、安全边界和 JSON 合同。

## Non-Goals

本设计不要求：

- LLM 绕过安全策略直接执行。
- 运行时静默自学习并改变行为。
- 把 prompt 作为状态机或权限系统。
- 让 LLM 编造不存在的 VectaHub 命令、Agent 或 workflow step。
- 一次性实现 MCP marketplace 或社区 skill 生态。

## Target Architecture

```text
User input
-> Input Normalizer
-> Project Context Pack
-> Capability Catalog
-> LLM Planner
-> OrchestrationPlan
-> Schema Validation
-> Command Surface Validation
-> PlanSafetyReview
-> WorkflowDraft
-> Confirmation
-> Execution
-> Verification
-> Trace / Audit
-> Feedback Record
-> Eval / Prompt / Rule Update Proposal
```

核心原则：

- LLM 负责理解、规划、解释和候选选择。
- VectaHub 负责合同、安全、执行、验证和状态。
- 学习必须显式、可审计、可回放，不能静默改变生产行为。

## Project Context Pack

`Project Context Pack` 是给 LLM Planner 的压缩项目事实视图。

推荐内容：

```ts
interface ProjectContextPack {
  schemaVersion: '1.0';
  cwd: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';
  packageScripts: Array<{ name: string; command: string }>;
  git?: {
    branch?: string;
    hasUncommittedChanges?: boolean;
    summary?: string;
  };
  workflows: Array<{ id: string; name: string; source: 'file' | 'system' }>;
  agents: AgentRuntimeSummary[];
  capabilities: CapabilitySummary[];
  securityMode: 'strict' | 'relaxed' | 'consensus';
  recentFailures: Array<{ kind: string; summary: string; traceId?: string }>;
}
```

边界：

- 不包含 secrets、完整环境变量、完整 stdout、完整 trace、完整 diff。
- 不把全仓源码塞进 prompt。
- 上下文包是事实摘要，不是权限来源。
- 生成失败时应保守降级为 clarification 或 blocked，而不是让 LLM 猜。

## Capability Catalog

`Capability Catalog` 描述 VectaHub 当前真实能做什么。

推荐字段：

```ts
interface CapabilitySummary {
  id: string;
  title: string;
  inputKinds: string[];
  outputKinds: string[];
  sideEffects: Array<'none' | 'read' | 'write' | 'command' | 'network'>;
  requiresConfirmation: boolean;
  verificationRequired: boolean;
  currentStatus: 'current' | 'partial' | 'target' | 'unsupported';
}
```

要求：

- catalog 从 CLI command surface、Agent runtime registry、workflow step types 和文档任务合同派生。
- LLM 只能选择 catalog 中 `current` 或允许 preview 的 `partial` 能力。
- `target` 能力只能用于解释或 roadmap，不能生成可执行计划。
- catalog 不得成为第二套 registry；真实状态仍以源码、registry、合同和验证路径为准。

## LLM Planner

LLM Planner 的输出必须是候选计划，而不是最终执行决定。

输入：

- 用户输入。
- Project Context Pack。
- Capability Catalog。
- 安全模式摘要。
- 语义约束和输出 schema。

输出：

```ts
type NLPlannerOutput =
  | { kind: 'reply'; reply: string; reason: string }
  | { kind: 'clarify'; question: string; missing: string[] }
  | { kind: 'blocked'; reason: string; safetyCategory?: string }
  | { kind: 'plan'; plan: OrchestrationPlan };
```

约束：

- 不能输出不存在的 CLI 命令。
- 不能把 `target` 能力写成可执行步骤。
- 不能绕过 `PlanSafetyReview`。
- 不能把 confidence 当作执行许可。
- 不能在没有验证计划时把 `apply` 或 `agent` task 标为完成。

## Validation Pipeline

LLM Planner 输出后必须经过：

1. Schema validation。
2. Capability id validation。
3. Command surface validation。
4. Workflow step validation。
5. Agent runtime validation。
6. PlanSafetyReview。
7. Confirmation policy。

失败策略：

- schema 失败：返回 `blocked` 或 internal error，不执行。
- command 不存在：返回 `blocked`，提示可用命令或要求澄清。
- Agent 不可用：返回 `clarify` 或 `blocked`。
- 风险为 `critical`：默认阻断。
- 风险为 `high`：默认需要确认。

## Feedback Learning

反馈学习必须显式记录。

```ts
interface NLFeedbackRecord {
  feedbackId: string;
  source: 'user_correction' | 'semantic_e2e' | 'execution_result' | 'safety_review' | 'recovery_result';
  inputHash: string;
  capability?: string;
  plannerDecision: string;
  outcome: 'accepted' | 'rejected' | 'failed_validation' | 'failed_execution' | 'needs_review';
  evidence: {
    traceId?: string;
    executionId?: string;
    testCaseId?: string;
  };
  appliedTo: 'eval' | 'prompt_proposal' | 'rule_proposal' | 'catalog_gap' | 'backlog';
}
```

规则：

- 反馈记录不得包含 secrets、完整 prompt、完整 trace、完整 stdout 或私密用户内容。
- 反馈不能在运行时静默改变生产行为。
- 自动学习的输出应优先进入 eval、prompt proposal、rule proposal 或 backlog。
- 只有经过审查的规则、prompt 或能力变更才能影响后续生产路径。

## Semantic Evaluation Gate

NL AI 化必须由语义验收保护。

每次 NL、LLM prompt、capability catalog、planner、workflow draft 或用户回复变更，至少验证：

- 同义表达是否得到一致计划。
- 模糊表达是否要求澄清。
- 危险表达是否阻断或确认。
- 普通问答是否不触发执行。
- JSON 输出是否是单个纯 JSON 对象。
- 计划是否包含合理 verification。
- 回复是否说明正确下一步。

详细标准见 [语义验收标准](../standards/semantic-acceptance.md)。

## Migration Plan

### Phase 1: 统一输出

- 让 `run --dry-run --json` 输出统一 plan envelope。
- 保留现有字段兼容，新增 `orchestrationPlan` 或 `result.kind`。
- 让 direct shell fallback、capability route 和 LLM fallback 都可映射到统一结构。

### Phase 2: 上下文和能力目录

- 实现 Project Context Pack builder。
- 实现 Capability Catalog builder。
- 从 Agent runtime、CLI command surface、workflow step types 和 document-task 合同派生上下文。

### Phase 3: LLM Planner

- LLM Planner 只输出 schema 化候选计划。
- 用 schema validation 和 command surface validation 阻断幻觉命令。
- 将不可执行计划返回 `clarify` 或 `blocked`。

### Phase 4: Safety And Workflow Draft

- 将 PlanSafetyReview 接入 `OrchestrationPlan`。
- 将多步骤计划转换为 `WorkflowDraft`。
- 有副作用的 draft 必须确认后执行。

### Phase 5: Feedback And Eval

- 写入 NLFeedbackRecord。
- 将用户纠正、失败样本和 semantic E2E 失败自动生成 eval 候选。
- 把 prompt/rule/catalog 改进作为审查项，不做静默自学习。

## Acceptance Criteria

- NL 当前主路径有专门设计文档和合同入口。
- LLM Planner 不直接执行，只生成 `OrchestrationPlan` 候选。
- 所有可执行计划都经过 schema、命令面、安全和确认校验。
- feedback learning 有记录、有证据、有应用去向。
- semantic acceptance 成为 NL 变更必跑门禁。
