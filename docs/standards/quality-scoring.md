# Quality Scoring Standard

> Document Status: Current Implementation / Migration Contract
> Authority: Canonical scoring standard for VectaHub module and capability assessments.
> Last Verified: 2026-05-29

This standard replaces ad hoc module scores and the retired health-check report format. It defines a reusable scoring system that can be applied to NL, workflow, security, recovery, tooling, skill, audit, CLI, and extension-facing capabilities.

## Principles

- Evidence first: every score must cite commands, tests, source files, contracts, or traceable review findings.
- Same dimensions: all modules use the same top-level dimensions and weights.
- Reproducible output: the same evidence set should produce the same score.
- Actionable gaps: every dimension below `3/5` must produce P0/P1/P2/P3 follow-up items.
- No impression scores: historical `60/100` or `65/100` estimates are not formal baselines unless recalculated with this standard.

## Score Formula

Each dimension is scored from `0` to `5`.

```text
module_score = sum((dimension_score / 5) * weight)
```

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100 | A | Stable baseline. |
| 80-89 | B | Usable with a small number of clear improvements. |
| 70-79 | C | Functional but carries material quality risk. |
| 60-69 | D | Needs prioritized hardening before adding major capability. |
| <60 | F | Do not expand scope until correctness and safety are addressed. |

## Canonical Dimensions

| Dimension | Weight | Objective Evidence | Score Rule |
|-----------|--------|--------------------|------------|
| Contract correctness | 20 | Typecheck, contract docs, schema/state-machine tests, JSON contract checks | Score by contract drift, missing schema, invalid state transitions, and type failures. |
| Runtime correctness | 20 | Focused tests, `npm run test:run`, semantic E2E, command smoke checks | Score by failing paths, untested core paths, timeout/flakiness, and incorrect failure semantics. |
| Safety and guardrails | 15 | Security tests, command risk checks, audit logs, permission prompts, redaction checks | Score by fail-closed behavior, confirmation coverage, sandbox boundaries, and sensitive-data handling. |
| Adaptability and intelligence | 15 | Hardcode inventory, LLM eval set, tool-calling tests, feedback records, fallback tests | Score by intelligent selection, learning loop, verification loop, and deterministic fallback quality. |
| Maintainability | 10 | Lint, dependency boundary checks, context usage checks, duplication/file-size findings | Score by module cohesion, dependency direction, duplication, naming, and operational complexity. |
| Observability and recovery | 10 | Trace tests, recovery tests, run records, checkpoint records, audit-query checks | Score by whether failures can be traced, classified, recovered, replayed, and audited. |
| User experience | 10 | CLI JSON contract, human CLI output checks, UI smoke checks, troubleshooting coverage | Score by stable output, understandable errors, minimal surprise, and documented operation paths. |

## Objective Dimension Scoring

Use this rubric for every dimension:

| Score | Criteria |
|-------|----------|
| 5 | All required evidence passes; no open findings in this dimension. |
| 4 | Evidence passes with 1-2 P3 findings or documented low-risk limitations. |
| 3 | Evidence mostly passes with 1 P2 finding or 3-5 P3 findings. |
| 2 | Evidence has multiple P2 findings, 1 P1 finding, or incomplete required checks. |
| 1 | Evidence has any P0 finding, multiple P1 findings, or the core path is not reliably verifiable. |
| 0 | No meaningful implementation, no meaningful verification, or behavior contradicts the owning contract. |

Severity is defined as:

| Severity | Definition |
|----------|------------|
| P0 | Crash, data loss, security exposure, contract-breaking regression, or blocked release gate. |
| P1 | Functional failure, missing required safety boundary, type/runtime failure in a core path, or major maintainability risk. |
| P2 | Quality issue that affects reliability, maintainability, or observability without blocking the core path. |
| P3 | Improvement suggestion or minor consistency issue. |

## Adaptability And Intelligence Subscore

The `Adaptability and intelligence` dimension is scored by five one-point checks:

| Check | Point | Standard |
|-------|-------|----------|
| Hardcode inventory | 1 | Decision tables, keyword lists, templates, and allowlists are centralized, owned, and tested. |
| LLM use fit | 1 | LLMs are used for semantic planning, ranking, diagnosis, extraction, or summarization, not for deterministic safety boundaries. |
| Feedback loop | 1 | User corrections, execution outcomes, failures, and confirmations are recorded in a reusable feedback format. |
| Verification loop | 1 | LLM output is validated by schema, contract, sandbox, tests, audit, or explicit user confirmation. |
| Offline fallback | 1 | LLM-unavailable behavior is explicit, conservative, and does not pretend success. |

## Evidence Pack

Each score must include:

| Evidence | Required When |
|----------|---------------|
| `npm run typecheck` | Source code, contracts, generated types, or exported API behavior changed. |
| `npm run lint` | Source code changed, lint config changed, or quality scoring claims depend on lint. |
| `npm run check:default-context-usage` | Context, composition root, infrastructure, CLI bootstrap, or dependency boundary changed. |
| `npm run test:run` | Runtime behavior, contracts, state, workflow, NL, security, recovery, trace, or storage changed. |
| Focused regression tests | A specific bug or contract gap is fixed. |
| Semantic E2E | NL, CLI output semantics, command interpretation, or user-facing automation behavior changed. |
| Extension smoke checks | VS Code extension code, CLI JSON consumed by the extension, or UI workflow contracts changed. |
| Link and fence scan | Documentation paths, markdown links, or markdown structure changed. |

## Module Boundaries

Use these default boundaries unless a narrower scope is explicitly stated:

| Module | Primary Area |
|--------|--------------|
| CLI Entry | `src/cli.ts`, `src/cli-bootstrap.ts`, `src/cli-main.ts`, `src/commands/` |
| Workflow Engine | `src/workflow/` |
| NL Engine | `src/nl/` |
| Skills | `src/skills/` |
| Agent Runtime | Agent CLI registration, adapter, run-task, and worker contract paths |
| Execution | Execution records, queues, outputs, archiving, and lifecycle paths |
| Sandbox | `src/sandbox/` |
| Security Protocol | `src/security-protocol/`, `src/command-rules/`, security command paths |
| Infrastructure | Audit, config, errors, logger, path, and persistence utilities |
| CLI Tools | `src/cli-tools/` |
| Types | `src/types/` |
| Setup | `src/setup/` |
| Daemon and Service | `src/daemon/`, local service, import/export paths |

## Retired Health-Check Mapping

The retired 20-dimension model maps into the canonical dimensions as follows:

| Retired Area | Canonical Dimension |
|--------------|---------------------|
| Architecture design | Maintainability, Contract correctness |
| Type safety | Contract correctness |
| Code style | Maintainability |
| Error handling | Runtime correctness, Safety and guardrails, Observability and recovery |
| Test quality | Runtime correctness |
| Third-party dependency discipline | Maintainability, Safety and guardrails |
| Documentation and comments | User experience, Contract correctness |
| Duplication and technical debt | Maintainability |
| Google engineering practices | All dimensions, especially Maintainability and Runtime correctness |

The retired dimensions may still be used as diagnostic checklists, but the published score must use the canonical seven-dimension model above.
