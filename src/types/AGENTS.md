# AGENTS.md — src/types/

> 父级不重复。共享领域类型定义层。

## OVERVIEW

所有业务模块的类型契约源。纯 `interface` / `type` / `enum`，不得引入运行时依赖（见下方例外）。

## STRUCTURE

- 28 文件，平铺无子目录。
- `index.ts` barrel：re-export 23 个模块（不含 `recovery.ts`、`provider.ts` 及两个 `.test.ts`）。
- 例外：`recovery.ts` 和 `orchestration-recovery.ts` 包含纯函数决策逻辑（`decideRecovery` / `decideOrchestrationRecovery`），是唯一违反"纯类型"规则的文件，历史上遗留。新增类型文件必须保持纯定义。

## WHERE TO LOOK

| 领域 | 文件 | 关键类型 |
|------|------|----------|
| Workflow | `workflow.ts` | `Workflow`, `Step`, `ExecutionRecord`, `ExecutionStatus`, `StepType` |
| Workflow 草案 | `workflow-draft.ts` | `WorkflowDraft`, `WorkflowDraftStep`, `DraftSafetyReview` |
| NL 路由 | `nl.ts` | `IntentName`（37 种意图）, `Task`, `TaskList`, `NLRequestEnvelope`, `ParseResult` |
| Agent | `agent.ts` | `AgentDescriptor`, `AgentAdapter`, `AgentRegistry` |
| Agent 提供 | `provider.ts` | `ProviderRegistration`, `CliDetectionResult` |
| Agent 结果 | `worker-capability.ts`, `worker-result.ts`, `native-feature-passthrough.ts` | Worker 能力/结果/透传类型 |
| 安全 | `security.ts` | `SecurityDecision`, `SecurityEvaluator`, `SecurityGuard`, `CommandIntention` |
| 文档任务 | `doc-task.ts` | `DocTask`, `AgentTaskContract`, `DocTaskRunStatus`, `AgentTaskBoundary` |
| 编排 | `orchestration-plan.ts` | `OrchestrationPlan`, `OrchestrationTask`, `SafetyFinding`, `VerificationPlan` |
| 编排恢复 | `orchestration-recovery.ts` | `OrchestrationRecoveryDecision`, `decideOrchestrationRecovery` |
| 恢复 | `recovery.ts` | `DocTaskRecoveryInput`, `RecoveryDecision`, `decideRecovery` |
| 任务合同 | `task-contract.ts` | `TaskContract`（Reply / Clarify / Blocked / Execution） |
| 会话 | `session.ts` | `SessionContext`, `UserPreferences`, `LLMOptions` |
| 其他 | `diagnostic.ts`, `verification-result.ts`, `feedback.ts`, `backlog.ts`, `proposal.ts`, `artifact.ts`, `checkpoint-reference.ts`, `project-context.ts`, `machine-response.ts`, `prompt.ts` | 各域辅助类型 |

`security.ts` 有 41 个调用方，改动时需关注 blast radius。

## CONVENTIONS

- 消费层统一用 `import type { ... } from '../types/<file>.js'`，禁止从 `index.ts` 引入（避免循环依赖风险）。
- 新增类型文件 → 同步追回 `index.ts` barrel export（除非是内部辅助类型或含逻辑的例外文件）。
- 持久化字段改动 → 在 commit message 中说明 writer / reader / 兼容性预期。
- 类型命名：领域前缀 + 名词（`AgentDescriptor`、`SecurityDecision`），枚举用 PascalCase。

## ANTI-PATTERNS

- **不要**在 `src/types/` 中引入任何运行时依赖（`fs`、`path`、`child_process`、外部包等）；例外仅限已存在的 `recovery.ts` 和 `orchestration-recovery.ts`。
- **不要**从 `index.ts` 引入类型（`import { X } from '../types'`）——业务模块应直引具体文件。
- **不要**在此目录写测试文件 —— 测试放对应业务目录（现有两个 `.test.ts` 是历史遗留，不新增）。
- **不要**在此目录加逻辑文件 —— 类型定义与决策逻辑分离，决策逻辑放 `src/orchestration-plan/` 或对应业务目录。