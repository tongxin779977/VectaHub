# AGENTS.md — src/orchestration-plan/

> 只记本层非显然事实。父级全局规则见 `../../AGENTS.md`。

## OVERVIEW

Planning + governance layer: Intent/DocTask → OrchestrationPlan → WorkflowDraft → execute. Sits between `src/nl/` (intent) and `src/workflow/` (execution).

## STRUCTURE

47 files, flat directory. 24 source + 23 test. No subdirectories.

## WHERE TO LOOK

| Concern | File(s) |
|---|---|
| Entry point / plan creation | `planner.ts` → `createEmptyPlan()`, `planFromCapability()`, `planToReply()`, `planToClarify()`, `planToBlocked()` |
| Doc task → plan | `doc-task-planner.ts` → `planFromDocTasks()` |
| Execution plan conversion | `execution-plan-adapter.ts` → `executionPlanToOrchestrationPlan()` |
| Zod schema validation | `validator.ts` → `validateOrchestrationPlan()` + `OrchestrationPlanSchema` |
| Command surface check | `command-surface-validator.ts` |
| Safety review per task | `safety-reviewer.ts` → `reviewPlanSafety()`, risk levels: safe/caution/danger/critical |
| Confirmation UX | `confirmation-handler.ts` → `applyConfirmationToPlan()`, `applyNonInteractiveDenyToPlan()` |
| Plan → WorkflowDraft | `workflow-draft-converter.ts` → `convertPlanToDraft()` |
| WorkflowDraft → Workflow → execute | `draft-executor.ts` → `createDraftExecutor()`. Bridges to `src/workflow/engine.ts` via `createWorkflowEngine()` |
| Worker assignment | `delegation-policy.ts` + `worker-capability-matrix.ts` (codex/claude/gemini/aider) |
| Verification after execution | `verification-runner.ts` → `runVerificationPlan()` |
| WorkflowDraft ↔ Workflow adapters | `workflow-draft-adapter.ts` |
| Hash integrity checkpoint | `workflow-hash-guard.ts` |
| Persistence (JSON, redacted) | `draft-storage.ts`, `feedback-storage.ts`, `proposal-storage.ts`, `artifact-storage.ts` |
| Checkpoint reference | `checkpoint-reference-validator.ts` (git + worktree) |
| Native feature passthrough | `native-feature-passthrough-policy.ts` |
| Worker result normalization | `worker-result-normalizer.ts` |
| Public barrel | `index.ts` — re-exports all public symbols; uses `export type` for type-only re-exports |

## CONVENTIONS

- **Factory pattern**: all constructable objects use `createX(deps)` factories, not classes with `new`. deps receive `InfrastructureContext` or narrower slices (`IEnvironmentService`, `pino.Logger`).
- **No `getDefaultContext()`**: this layer receives deps explicitly. Invoking `getDefaultContext()` directly is a contract violation (see root `AGENTS.md`).
- **Zod for validation**: `validator.ts` defines `OrchestrationPlanSchema` (Zod), used by `validateOrchestrationPlan()`. Other validators (`workflow-draft-validator.ts`, `command-surface-validator.ts`) follow the same pattern.
- **Storage uses JSON + redaction**: all `*-storage.ts` files persist to disk as JSON. Output is redacted via `redactString()` from `src/utils/sensitive-data.js` before write.
- **Safety before execution**: `safety-reviewer.ts` runs before draft conversion. Plans with `maxRiskLevel: 'danger' | 'critical'` require confirmations before execution.
- **Worker routing is policy-driven**: `delegation-policy.ts` uses `worker-capability-matrix.ts` to decide which agent CLI (codex/claude/gemini/aider) handles each task. Don't hardcode worker assignments.
- **Plan lifecycle**: draft → reviewed → confirmed → converted-to-draft → executed → verified. Each stage has a dedicated module.
- **Tests are co-located**: every source file (except `index.ts`, `hash.ts`, `trace-link.ts`) has a paired `.test.ts`.

## ANTI-PATTERNS

- **Don't bypass the planner**: always go through `planner.ts` functions to create plans. Never construct `OrchestrationPlan` objects inline.
- **Don't execute without safety review**: `safety-reviewer.ts` must run on every plan before `workflow-draft-converter.ts` converts it.
- **Don't skip storage redaction**: all persistence paths must pass through `redactString()`. Raw sensitive values in stored JSON are a security bug.
- **Don't hardcode worker routing**: use `delegation-policy.ts` + `worker-capability-matrix.ts`. Hardcoding a tool name (e.g. always `codex`) bypasses capability checks and policy rules.
- **Don't call `workflowEngine.execute()` directly from this layer**: go through `draft-executor.ts`, which handles hash verification, draft validation, and verification hooks.
- **Don't add storage fields without migration plan**: JSON persistence files have no version header. Changing stored shape requires characterization tests and reader compatibility.
