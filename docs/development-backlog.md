# Development Backlog

> Document Status: Current Planning Queue / Migration Contract
> Authority: NL Workflow Orchestrator backlog entry point. Detailed task state lives in `docs/backlog/items/*.md`; selection and lock behavior is governed by `docs/backlog/protocol.md`.
> Last Reorganized: 2026-06-08

## Purpose

This file is the lightweight entry point for the development backlog. It intentionally does not store full task bodies, status, locks, completion evidence, or review findings.

Automation agents must use:

- [Backlog Automation Protocol](./backlog/protocol.md)
- [Backlog Items](./backlog/items/)
- [Automation Prompt](./backlog/automation-prompt.md)
- [Cross-Project Template](./backlog/cross-project-template.md)

## Responsibilities

| File | Responsibility |
|------|----------------|
| `docs/development-backlog.md` | Navigation and stable entry point. |
| `docs/backlog/protocol.md` | Locking, task selection, status transitions, verification evidence, and multi-subagent rules. |
| `docs/backlog/items/<TASK_ID>.md` | Current state, dependencies, scope, evidence, verification, completion, lock, and latest review findings for one task. |
| `docs/backlog/automation-prompt.md` | Copyable automation prompt. |
| `docs/backlog/cross-project-template.md` | Rules for reusing this backlog system in another project. |
| `docs/backlog/history/` | Optional archive for resolved historical findings. |

## Task Index

Current task status is intentionally not duplicated here. Read the matching item file for `status`, `depends_on`, `lock`, `completion`, and `review_findings`.

Only tasks with an existing file under `docs/backlog/items/` are listed in the active index below.

| Task | Priority | Title |
|------|----------|-------|
| [P0-001](./backlog/items/P0-001.md) | P0 | 统一 `run --dry-run --json` 输出 envelope |
| [P0-002](./backlog/items/P0-002.md) | P0 | 建立 `OrchestrationPlan` runtime schema |
| [P0-003](./backlog/items/P0-003.md) | P0 | 建立 `WorkflowDraft` runtime schema |
| [P0-004](./backlog/items/P0-004.md) | P0 | 建立 NL request envelope 和入口 normalization 合同 |
| [P0-005](./backlog/items/P0-005.md) | P0 | 建立 Command Surface Validator |
| [P0-006](./backlog/items/P0-006.md) | P0 | 统一机器响应和错误 JSON envelope |
| [P1-001](./backlog/items/P1-001.md) | P1 | 实现 Project Context Pack builder |
| [P1-002](./backlog/items/P1-002.md) | P1 | 实现 Capability Catalog builder |
| [P1-003](./backlog/items/P1-003.md) | P1 | 实现 LLM Planner 输出 `OrchestrationPlan` |
| [P1-004](./backlog/items/P1-004.md) | P1 | 接入 PlanSafetyReview |
| [P1-005](./backlog/items/P1-005.md) | P1 | 将多步骤 NL plan 转为 WorkflowDraft |
| [P1-006](./backlog/items/P1-006.md) | P1 | 扩展 semantic acceptance cases |
| [P1-007](./backlog/items/P1-007.md) | P1 | 实现 confirmation flow 最小闭环 |
| [P1-008](./backlog/items/P1-008.md) | P1 | 实现 VerificationPlan runner 和结果分类 |
| [P1-009](./backlog/items/P1-009.md) | P1 | 实现 WorkflowDraft 持久化、读取和列表 |
| [P1-010](./backlog/items/P1-010.md) | P1 | 统一 human-readable 与 machine-readable response contract |
| [P1-011](./backlog/items/P1-011.md) | P1 | 建立多样本 semantic user-test harness |
| [P1-012](./backlog/items/P1-012.md) | P1 | 将文档任务接入 OrchestrationPlan / WorkflowDraft |
| [P1-013](./backlog/items/P1-013.md) | P1 | 将 confirmed WorkflowDraft 接入 workflow execution |
| [P2-001](./backlog/items/P2-001.md) | P2 | FeedbackRecord 存储与回放候选 |
| [P2-002](./backlog/items/P2-002.md) | P2 | Worker Capability Matrix |
| [P2-003](./backlog/items/P2-003.md) | P2 | Delegation Policy |
| [P2-004](./backlog/items/P2-004.md) | P2 | Worker Result Contract |
| [P2-005](./backlog/items/P2-005.md) | P2 | Native Feature Passthrough Policy |
| [P2-006](./backlog/items/P2-006.md) | P2 | Checkpoint Reference Policy |
| [P2-007](./backlog/items/P2-007.md) | P2 | Agent delegate runtime 接线和 preflight |
| [P2-008](./backlog/items/P2-008.md) | P2 | Artifact handoff 合同与最小实现 |
| [P2-009](./backlog/items/P2-009.md) | P2 | Workflow snapshot/hash guard |
| [P2-010](./backlog/items/P2-010.md) | P2 | 打通 plan / draft / execution / recovery trace identity |
| [P2-011](./backlog/items/P2-011.md) | P2 | 将 orchestration failure 接入 recovery loop |
| [P2-012](./backlog/items/P2-012.md) | P2 | Prompt / eval / rule proposal 治理闭环 |
| [P2-013](./backlog/items/P2-013.md) | P2 | NL / plan / draft / feedback 全链路脱敏审计 |
| [P2-014](./backlog/items/P2-014.md) | P2 | 实现标准化语义评分报告 |
| [P4-001](./backlog/items/P4-001.md) | P4 | Secondary 能力是否恢复主线评估 |

## Planned But Not Yet Itemized

These task IDs remain part of the planning queue, but they are not selectable backlog items until a matching `docs/backlog/items/<TASK_ID>.md` file exists.

| Task | Priority | Title |
|------|----------|-------|
| `P3-001` | P3 | VS Code/UI 消费统一 JSON contract |
| `P3-002` | P3 | CLI draft review / confirm UX |
| `P3-003` | P3 | Backlog automation runner / report hardening |
| `P4-002` | P4 | Custom rule / skill / MCP ecosystem 重新评估 |

### E2E Test Bugs (2026-06-08)

Source: 模拟用户端到端测试，7 个模块全覆盖。

| Task | Priority | Title |
|------|----------|-------|
| [BUG-P1-001](./backlog/items/BUG-P1-001.md) | P1 | `--variable` 参数替换不生效 |
| [BUG-P1-002](./backlog/items/BUG-P1-002.md) | P1 | `verify` 使用无效 vitest reporter (`--reporter=basic`) |
| [BUG-P1-003](./backlog/items/BUG-P1-003.md) | P1 | `resume` 执行记录中 workflowId 为 undefined |
| [BUG-P1-004](./backlog/items/BUG-P1-004.md) | P1 | Redactor 过度脱敏 trace/span ID |
| [BUG-P2-001](./backlog/items/BUG-P2-001.md) | P2 | 意图路由生成未注册命令 (`vectahub tool run ls`) |
| [BUG-P2-002](./backlog/items/BUG-P2-002.md) | P2 | `tools eval` 规则引擎覆盖不足（与 `security test` 不一致） |
| [BUG-P3-001](./backlog/items/BUG-P3-001.md) | P3 | `templates list` 未发现本地模板 |
| [ISSUES-001](./backlog/items/ISSUES-001.md) | P2-P3 | E2E 测试关注问题汇总（8 项） |

## Operating Notes

- Do not edit task status in this index; update the matching item file instead.
- A task is selectable only when its item file satisfies the protocol rules.
- Active lock and atomic claim stale timeout is 1 hour.
- `review_findings.status=needs-fix` in an item file makes that task a review-fix priority.
- `done` tasks must keep stable commit and strict verification evidence in their item files.
