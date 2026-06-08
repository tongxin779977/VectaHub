# Backlog Automation Protocol

> Document Status: Current Operating Contract
> Authority: Task selection, locking, status transitions, verification evidence, and multi-agent coordination for `docs/backlog/items/*.md`.
> Last Updated: 2026-06-08

## Purpose

This protocol defines how automation agents select, claim, update, verify, and complete backlog items.

Use [../development-backlog.md](../development-backlog.md) as the stable entry point. Use this file as the operational contract before editing any item file.

## Item Files

Each active backlog task must have one item file:

```text
docs/backlog/items/<TASK_ID>.md
```

The item file is the source of truth for:

- status
- priority
- dependencies
- scope
- lock state
- completion evidence
- verification evidence
- latest review findings

The index in `docs/development-backlog.md` is navigation only. Do not use it as proof that a task is complete.

## Required Item Metadata

Each item file should expose these fields near the top of the document:

```text
> Status: todo | in_progress | blocked | review | done
> Priority: P0 | P1 | P2 | P3 | P4
> Source: <origin>
> Module: <primary module or document>
> Completed: YYYY-MM-DD
```

`Completed` is required only when `Status: done`.

## Status Contract

| Status | Meaning |
|--------|---------|
| `todo` | The task is not started and may be selected when dependencies are satisfied. |
| `in_progress` | The task is actively claimed and should not be selected by another agent. |
| `blocked` | The task cannot proceed without external input, missing files, missing permissions, or an upstream task. |
| `review` | Implementation is complete but needs review or verification before completion. |
| `done` | The task has implementation evidence and strict verification evidence. |

Do not mark a task `done` unless verification evidence is current and reproducible.

## Selection Rules

Select work in this order:

1. Items with `review_findings.status=needs-fix`.
2. Unblocked `P0` items.
3. Unblocked `P1` items.
4. Lower priority items in priority order.

Skip an item when:

- the item file does not exist
- dependencies are missing or not done
- another active lock exists and is not stale
- scope is unclear
- the required change exceeds the current task boundary

## Lock Contract

Use a lock section in the item file when claiming a task:

```markdown
## Lock

- owner: <agent or user>
- started_at: YYYY-MM-DDTHH:mm:ssZ
- expires_at: YYYY-MM-DDTHH:mm:ssZ
- status: active
```

Locks expire after 1 hour unless refreshed. A stale lock may be replaced only after the current time is later than `expires_at`.

Remove or mark the lock inactive when the task reaches `done`, `blocked`, or is explicitly released.

## Implementation Rules

Before editing code or docs:

1. Read the item file.
2. Identify the authoritative contract.
3. Confirm dependencies and scope.
4. Define the minimal implementation approach.
5. Define the verification commands.

Do not delete files, move files, change public contracts, add dependencies, or perform broad refactors without explicit user approval.

## Completion Evidence

A `done` item must include:

- changed files
- behavior or contract change summary
- verification commands
- verification results
- known residual risks, if any

Use this structure:

```markdown
## Completion

### Changes

- `<path>`: <summary>

### Verification Evidence

- Typecheck: `<command>` passed
- Tests: `<command>` passed
- Lint: `<command>` passed
- Docs: `<command>` passed
```

If a check is not applicable or cannot be run, state why.

## Review Findings

When review finds issues, record them in the item file:

```markdown
## Review Findings

- status: needs-fix | accepted | resolved
- reviewed_at: YYYY-MM-DD
- findings:
  - severity: P0 | P1 | P2
    location: `<path>:<line>`
    issue: <description>
    recommendation: <fix>
```

`needs-fix` makes the item a review-fix priority.

## Multi-Agent Rules

Multiple agents may work on different item files at the same time only when:

- each agent has a distinct claimed item
- claimed scopes do not overlap
- no shared public contract is being changed by more than one task
- verification commands are recorded per task

Stop and coordinate when two tasks require changes to the same contract, state machine, persisted data, or CLI response format.

## Verification Gate

Before reporting completion, run the smallest relevant checks first, then broader checks when practical:

```bash
npm run typecheck
npm run lint
npm run check:docs
npm run test:run
```

Focused tests are acceptable for local task completion only when the item records why full verification was not run.

