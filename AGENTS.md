# VectaHub

Workflow editor + execution engine. TypeScript CLI project.

## Rule Priority

1. System and developer instructions
2. User request
3. This file (`AGENTS.md`)

Note: `.trae/` is Trae IDE-specific configuration and is not part of Codex instructions.

<!-- 中文注释：先明确优先级，避免仓库规则覆盖系统规则或用户明确要求。 -->

## Scope

This file defines the mandatory baseline for agents working in this repository.
It applies unless a deeper directory-level instruction overrides it.

For complex tasks, multi-file changes, review work, or recovery work, also follow:

```text
docs/agent-operating-guide.md
```

<!-- 中文注释：AGENTS.md 只放短而硬的基线；复杂方法论放到外部文档，避免重复和过长。 -->

## Governance Layer

### Project Intent

VectaHub is a workflow editor and execution engine implemented as a TypeScript CLI project.

Agents must preserve existing workflow, safety, and execution behavior unless the task explicitly requires changing them.

Prefer minimal, local, evidence-based changes over broad rewrites.

<!-- 中文注释：治理层先定义项目意图和总原则，避免代理一上来重构。 -->

### Repository Boundaries

Primary areas:

```text
src/cli.ts                    # CLI entry
src/index.ts                  # Package entry
src/types/index.ts            # Shared types
src/nl/                       # Intent matching and parameter extraction
src/workflow/                 # Engine core
src/sandbox/                  # Isolation and danger detection
src/cli-tools/                # External tool integration
src/skills/                   # Skills and pipelines
src/setup/                    # Setup and first-run flow
src/command-rules/            # Command safety rules
src/infrastructure/           # Audit, config, errors, logger
src/utils/                    # Supporting utilities
```

Tech stack: TypeScript + Node.js + Commander.js + Vitest.

Keep changes within the stated task scope.
Record adjacent issues as follow-up work unless they block correctness.

<!-- 中文注释：明确仓库边界，强调“只改范围内问题”。 -->

### Source of Truth

Prefer a single source of truth for behavior and contract logic.

Do not duplicate contract rules across CLI, workflow, storage, recovery, docs, or tests when an authoritative source already exists.

If behavior is defined by a type, validator, state contract, or runtime guard, update that source first.

<!-- 中文注释：这是当前文档里很好的原则，保留并前置。 -->

## Execution Layer

### SDD Operating Model

Use Specification-Driven Development by default:

1. Clarify the expected behavior or contract.
2. Identify the authoritative source for that behavior.
3. Implement the smallest change that satisfies the specification.
4. Verify with focused tests or checks against the external contract.

Specification first, code second, tests prove compliance.

<!-- 中文注释：把 SDD 作为执行主轴，而不是只放在 planning 角落里。 -->

### Agent Baseline

Agents should:

- Plan before substantial edits.
- Wait for approval when the task has multiple viable approaches, spans multiple files, or changes interfaces, persisted data, state semantics, or architecture.
- Edit directly when the task is clearly small, local, and low-risk, or when the user explicitly asks for direct edits.
- Base claims on code, tests, logs, docs, or command output.
- State uncertainty explicitly instead of guessing.
- Preserve user changes and avoid reverting unrelated work.
- Reuse existing project patterns before introducing new ones.

<!-- 中文注释：这里吸收当前 AGENTS 里最有价值的默认行为规则。 -->

### Planning Contract

When planning is required, include:

- User goal
- Assumptions
- In-scope files or modules
- Out-of-scope files or modules
- Implementation approach
- Edge cases
- Verification plan
- Open questions requiring confirmation

If more than one viable solution exists, present:

1. Minimal change
2. Recommended engineering approach
3. Tradeoff

<!-- 中文注释：计划要能执行，不要写成空泛大纲。 -->

### Stop Conditions

Stop and ask before continuing when:

- The task changes public APIs, persisted data, state-machine semantics, or architecture.
- The fix requires touching unrelated modules.
- Evidence contradicts the user's assumption.
- Tests reveal a larger unrelated failure.
- Required permissions, files, or environment are unavailable.
- The safe fix is substantially different from the requested fix.
- The change would require a new dependency.
- The task would require deleting significant code or files.

<!-- 中文注释：停止条件必须写硬，这是防止代理跑偏的关键。 -->

### Implementation Constraints

Always:

- Follow existing project patterns.
- Keep changes minimal and scoped.
- Prefer real production paths over mock-heavy fixes when feasible.
- Use project path utilities such as `getVectaHubPath()` where applicable.
- Avoid speculative refactors unless required for correctness.

Do not:

- Bypass sandbox, safety, or command-control logic.
- Modify protected or generated content unless the task explicitly requires it.
- Expand the task without explicit justification.
- Claim behavior that is not actually implemented.

<!-- 中文注释：执行约束聚焦在“怎么改代码”和“哪些不能碰”。 -->

## Quality Layer

### Verification Gate

Before marking work complete:

- Relevant tests must pass.
- Type-check must pass when applicable.
- Lint or other required static checks must pass when applicable.
- No secrets may be introduced into source, logs, traces, tests, or docs.
- Documentation must be updated when behavior or contracts change.

If verification is not run, state that explicitly and explain why.

<!-- 中文注释：完成定义必须包含验证，不允许“代码改了就算完”。 -->

### Test Standard

A regression test should:

- Fail on the old behavior.
- Exercise the real production path when practical.
- Assert the external contract rather than incidental implementation details.
- Cover failure paths when failure classification matters.

Coverage targets:

| Module | Coverage |
|--------|----------|
| Workflow Engine | >=80% |
| Executor | >=75% |
| Others | >=70% |

Test files should live next to source files when that is the local project pattern.

Example:

```text
src/foo.ts -> src/foo.test.ts
```

<!-- 中文注释：测试标准强调“证明修复”而不是“补一个形式上的测试”。 -->

### Failure Protocol

When a command, test, or fix fails:

- Identify the immediate failure.
- Classify the likely failure category.
- Retry only with a new hypothesis.
- Do not repeat the same failing step without a material change.
- Do not hide failing checks.
- Do not claim completion when core verification failed.

<!-- 中文注释：保留你当前文档里很强的 failure protocol。 -->

### Documentation Truth

Documentation must describe current behavior unless clearly marked as planned work.

Do not document aspirational behavior as implemented.

Known gaps should be labeled as limitations, follow-up work, or hardening backlog.

<!-- 中文注释：这条非常好，必须保留。 -->

## Collaboration Layer

### Output Contract

User-facing replies should be in Chinese unless the user asks otherwise.

When presenting implementation details:

- Show focused diffs or targeted code excerpts when practical.
- Avoid repeating obvious repository context.
- Separate confirmed facts from assumptions.
- Keep summaries concise and evidence-based.

For reviews:

- Present findings first.
- Order findings by severity.
- Include file and line references.
- State residual risks or unverified areas when no findings are found.

<!-- 中文注释：协作层处理“怎么汇报”，不在这里重复 Git 规则。 -->

### Task-Specific Guidance

For implementation tasks, follow `docs/design/04_agent_tasks.md` if it exists and applies.

For complex tasks, reviews, recovery work, or multi-file changes, use `docs/agent-operating-guide.md` as the detailed operating reference.

<!-- 中文注释：把长规则外置，AGENTS 只保留入口和最低基线。 -->

## Exclusions

Git workflow and commit conventions are defined elsewhere and are intentionally not repeated in this file.

<!-- 中文注释：明确说明 Git 规则不在这里，避免重复维护。 -->
