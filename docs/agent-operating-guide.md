# Agent Operating Guide

This guide defines the operating method for complex tasks, reviews, recovery work, and multi-file changes. `AGENTS.md` contains the short mandatory baseline; this document explains how to apply it.

## Contract First

Before changing code, identify the relevant contracts:

- Data contract: field meaning, source of truth, lifecycle, persistence format.
- State contract: allowed states, transitions, failure classification.
- Boundary contract: allowed files, forbidden files, public APIs, compatibility limits.
- Verification contract: what proves the task is complete.

Do not fix only the local symptom if the upstream or downstream contract remains inconsistent.

<!-- 中文注释：先识别数据、状态、边界和验证合同，再动代码。 -->

## Single Source of Truth

- Prefer reusing the authoritative source over recomputing equivalent values in another layer.
- If a value cannot be reproduced with equivalent factors, treat it as unavailable instead of guessing.
- Avoid duplicated inference logic across CLI, plugin, workflow, recovery, and docs.
- When multiple modules depend on the same fact, name the owner explicitly in the plan.

<!-- 中文注释：优先收敛事实来源，避免多个模块各自推导同一个事实。 -->

## Phase Control

Work in phases:

1. Blocking correctness.
2. Regression tests.
3. Documentation and contract cleanup.
4. Non-blocking hardening or refactor.

Do not mix unrelated phases unless the user explicitly asks for a combined change.

<!-- 中文注释：先修阻断问题，再补测试，再清文档，最后处理技术债。 -->

## Minimal Effective Change

- Choose the smallest change that closes the verified risk.
- Do not turn a bug fix into an architecture rewrite.
- Do not add dependencies, change public contracts, or redesign state machines without approval.
- Record adjacent issues as follow-ups instead of fixing them opportunistically.

<!-- 中文注释：用最小可验证改动解决核心问题，避免顺手扩大范围。 -->

## Evidence Discipline

- Do not claim a fact about code, tests, configuration, or behavior without checking the relevant source.
- Prefer direct evidence from files, tests, logs, command output, or documented contracts.
- If evidence is incomplete, state the uncertainty explicitly.
- Do not infer implementation details from filenames alone.

<!-- 中文注释：关键结论必须基于证据，不要凭印象判断。 -->

## Verification Driven

- Code is not complete until the behavior is verified.
- Add or update tests that would fail on the old behavior.
- Prefer testing real risk paths over testing only helper functions.
- Run focused tests first, then broader checks when appropriate.
- If tests or type-checks are not run, state that clearly.

<!-- 中文注释：完成标准是行为被验证，不是代码已经改过。 -->

## Test Quality

A good regression test must:

- Fail on the old behavior.
- Exercise the real production path when practical.
- Assert the externally visible contract, not only private implementation details.
- Cover both success and failure paths when the distinction matters.

Do not weaken assertions just to make tests pass.

<!-- 中文注释：测试要证明风险路径已被锁住，而不是只覆盖实现细节。 -->

## Failure Protocol

When an attempted fix, command, or test fails:

1. Stop and identify the immediate failure.
2. Classify the failure as environment, test expectation, implementation bug, missing dependency, permission, or unclear requirement.
3. Retry only with a new hypothesis.
4. If the next attempt fails, report the blocker or narrow the scope.

Do not repeatedly retry the same command without changing anything.

<!-- 中文注释：失败后先分类再行动，避免无限重试。 -->

## No Silent Fallbacks

- Do not silently fall back to weaker behavior when a required contract cannot be satisfied.
- If a fallback is necessary, make it explicit in code, tests, docs, or the final report.
- A fallback must preserve safety and correctness before convenience.
- If correctness cannot be preserved, fail closed instead of guessing.

<!-- 中文注释：降级必须显式，不能悄悄削弱合同。 -->

## Risk Classification

Classify findings and decisions as:

- Blocking: can cause wrong behavior, data loss, unsafe execution, broken recovery, or contract mismatch.
- Non-blocking: maintainability, naming, documentation residue, or incomplete coverage that does not break the core path.
- Residual risk: accepted limitation that must be documented and tracked.

<!-- 中文注释：把阻断问题、非阻断问题和残余风险分开处理。 -->

## Boundary Discipline

Before substantial edits, define:

- Primary objective.
- Allowed files or modules.
- Forbidden files or modules.
- Expected behavior change.
- Verification target.

During implementation:

- Do not fix adjacent issues unless they block the primary objective.
- Record adjacent issues as follow-ups.
- If the required change exceeds the declared scope, stop and ask.

<!-- 中文注释：先锁定范围，再实现；超过范围要停下来确认。 -->

## Default Context Boundary

The repository currently enforces the `getDefaultContext()` boundary with `npm run check:default-context-usage`.

Allowed locations are limited to:

- `src/infrastructure/context.ts` as the default context definition point.
- `src/cli-main.ts` and `src/cli-bootstrap.ts` as the CLI composition roots.
- Explicit compatibility bridge files named `compat-bridge.ts` or `*-bridge.ts`.

Direct `getDefaultContext()` usage outside that allowlist is a contract violation, not a style preference.

Ordinary business and support modules must not call `getDefaultContext()` directly.
They must receive `InfrastructureContext` or narrower dependencies explicitly through constructors, factories, or helper parameters.

Preferred patterns for new or migrated modules:

- Constructor injection for long-lived services.
- Factory functions such as `createX(context)`, `createX(deps)`, or `createXWithDeps(deps, options)`.
- Narrow service contracts such as `logger`, `environment`, `config`, `audit`, or other module-specific dependency objects instead of broad hidden globals.

Compatibility APIs are allowed only when the project intentionally keeps a historical no-argument entrypoint.
When that happens:

- Put the compatibility entrypoint in a clearly named bridge file: `compat-bridge.ts` or `*-bridge.ts`.
- Keep `getDefaultContext()` inside a small private bridge helper or bridge-local dependency builder.
- Keep business logic in the explicit-dependency module, and let the bridge only assemble dependencies and delegate.
- Mark the compatibility export with `@deprecated`.
- The `@deprecated` note must point callers to the explicit dependency API, for example `createTraceAuditSystemWithDeps(deps, config)` or `createRunCmd(context)`.

This rule describes the current repository state:

- CLI command composition happens in `src/cli-main.ts` and `src/cli-bootstrap.ts`.
- Infrastructure compatibility wrappers such as `src/infrastructure/paths/compat-bridge.ts`, `src/infrastructure/logger/compat-bridge.ts`, and `src/infrastructure/trace-audit/compat-bridge.ts` remain valid bridge locations.
- Non-bridge production modules are expected to migrate to explicit dependency injection instead of adding new default-context access.

During review, any new `getDefaultContext()` usage in a non-allowlisted file should be treated as a regression and blocked until it is moved to a composition root or compatibility bridge, or replaced with explicit dependency injection.

## Explicit Dependency Boundary

Normal business modules must not replace `getDefaultContext()` with another hidden default such as module-level `process.env`, `homedir()`, `pino({ level: 'silent' })`, or mutable singleton state.

Allowed direct runtime boundary access is limited to:

- CLI composition roots that assemble dependencies and delegate to explicit-dependency modules.
- Standalone script entrypoints guarded by an executable `main()` path.
- Infrastructure services whose purpose is to wrap Node.js runtime APIs.
- Test helpers and explicit compatibility bridges.

When a module exposes reusable functions, those functions should accept explicit dependencies even if the same file also contains a CLI `main()` bridge.

<!-- 中文注释：清理默认 context 后，不能把隐式依赖换成新的全局默认值。 -->

## Change Safety

- Preserve existing behavior unless the task explicitly requires changing it.
- For every behavior change, identify who consumes the behavior.
- For every persisted field, state its writer, reader, and compatibility expectation.
- For every state transition, state the source event and downstream effect.

<!-- 中文注释：修改行为、状态或持久化字段时必须考虑上下游。 -->

## Review Standard

When reviewing code, prioritize:

1. Incorrect behavior.
2. Broken contracts.
3. Missing tests for risky paths.
4. Security or data exposure.
5. Concurrency, persistence, and recovery risks.
6. Maintainability issues.

Findings must include file and line references. If there are no findings, state residual risks and unverified areas.

<!-- 中文注释：审查优先找行为和合同问题，不要只挑风格。 -->

## Documentation Truthfulness

- Documentation must describe current behavior unless clearly marked as planned or future work.
- Do not document an aspirational state as already implemented.
- If code and docs disagree, identify which one should be changed before editing both.
- Known gaps must be marked as limitations, hardening backlog, or follow-up work.
- Cross-module capabilities must be checked against `docs/specs/implementation-traceability.md`; if a capability has no implementation entry point or verification entry point, it must not be described as current behavior.

<!-- 中文注释：文档必须反映真实现状，不能提前宣称已完成。 -->

## Decision Records

For non-trivial choices, record:

- Decision.
- Reason.
- Alternatives considered.
- Tradeoff.
- Verification plan.

Keep this concise. Do not write a design essay for small fixes.

<!-- 中文注释：关键取舍要留痕，但不要过度文档化。 -->

## Handoff Quality

Every completed task should make review easy:

- What changed.
- Why it changed.
- How it was verified.
- What was intentionally not changed.
- What residual risks remain.

<!-- 中文注释：交付时让后续审查和接手成本最低。 -->
