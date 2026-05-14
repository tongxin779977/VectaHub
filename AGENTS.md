# VectaHub

Workflow editor + execution engine. TypeScript CLI project.

## Rule Priority

1. System/developer instructions
2. User request
3. This file (`AGENTS.md`)

Note: `.trae/` is Trae IDE-specific configuration and is not part of Codex instructions.

## Agent Baseline

- Use Chinese for user-facing replies unless the user asks otherwise.
- Plan before substantial edits; wait for approval unless the user says "directly edit" or the change is clearly single-file and low-risk.
- Base claims on evidence from code, tests, logs, or docs. State uncertainty instead of guessing.
- Keep changes minimal and within scope. Record adjacent issues as follow-ups instead of fixing them opportunistically.
- Prefer a single source of truth. Do not duplicate contract logic across layers when an authoritative source exists.
- Verify behavior with focused tests or checks. If verification is not run, say so explicitly.

<!-- 中文注释：这是 Agent 的最低行为基线，优先于详细方法论。 -->

## Stop Conditions

Stop and ask before continuing when:

- The task changes public APIs, persisted data, state-machine semantics, or architecture.
- The fix requires touching unrelated modules.
- Evidence contradicts the user's assumption.
- Tests reveal a larger unrelated failure.
- Required permissions, files, or environment are unavailable.
- The safe fix is substantially different from the requested fix.

<!-- 中文注释：明确必须暂停确认的情况，防止 Agent 盲目扩大范围。 -->

## Failure Protocol

When a command, test, or fix fails:

- Identify the immediate failure and likely category.
- Retry only with a new hypothesis.
- Do not repeatedly run the same command without changing anything.
- Do not hide failing checks or claim completion when core verification failed.

<!-- 中文注释：防止无限重试和失败后假装完成。 -->

## Test Standard

A regression test should:

- Fail on the old behavior.
- Exercise the real production path when practical.
- Assert the external contract, not incidental implementation details.
- Cover failure paths when failure classification matters.

<!-- 中文注释：防止添加没有证明力的测试。 -->

## Documentation Truth

- Documentation must describe current behavior unless clearly marked as planned work.
- Do not document aspirational behavior as implemented.
- Known gaps must be marked as limitations, hardening backlog, or follow-up work.

<!-- 中文注释：防止文档提前宣称已经闭环。 -->

## Detailed Guide

For complex tasks, reviews, recovery work, or multi-file changes, follow:

```text
docs/agent-operating-guide.md
```

<!-- 中文注释：详细方法论放在独立文档，避免 AGENTS.md 过长导致关键规则被稀释。 -->

## Project Structure

```text
src/cli.ts                    # CLI entry (Commander.js)
src/index.ts                  # Package entry
src/types/index.ts            # All type definitions
src/nl/                       # Intent matching + param extraction + LLM
src/workflow/                 # Engine core (scheduler/executor/context/storage)
src/sandbox/                  # Sandbox isolation + danger detection
src/cli-tools/                # External tool integration (git/npm/docker/curl)
src/skills/                   # Skills (intent-skill, pipeline-skill, workflow-skill, etc.)
src/setup/                    # First-run wizard + CLI scanner
src/command-rules/            # Command blacklist/whitelist
src/infrastructure/           # Audit/config/errors/logger
src/utils/                    # CLI commands (run/generate/serve/tools/etc)
```

Tech stack: TypeScript + Node.js + Commander.js + Vitest.

## Planning Rules

- SDD always: spec first, code second, tests verify spec compliance.
- Single file change or explicit direct-edit instruction -> do it directly.

<!-- 中文注释：explicit direct-edit instruction 包含用户明确说“直接改”。 -->

- 2+ options, 3+ files, delete/change interface/architecture -> ask first.
- When uncertain, state the exact point requiring confirmation; do not guess.

When planning, include:

- User goal.
- User preferred approach, if stated.
- Assumptions.
- In-scope files/modules.
- Out-of-scope files/modules.
- Implementation approach.
- Edge cases.
- Test plan.
- Questions requiring confirmation.

If multiple viable solutions exist, present:

1. Strict minimal change following the user's expected approach.
2. Recommended engineering approach.
3. Tradeoff between the two.

Unless the user explicitly gives a direct-edit instruction, wait for approval after a plan.

## Output Rules

- Show diffs or focused code blocks; only show full files when requested.
- Show only changed parts when practical.
- Do not repeat obvious context.
- For implementation tasks, follow `docs/design/04_agent_tasks.md` if it exists and applies.
- For reviews, findings come first, ordered by severity, with file and line references.

## Testing

| Module | Coverage |
|--------|----------|
| Workflow Engine | >=80% |
| Executor | >=75% |
| Others | >=70% |

Test files live next to source files:

```text
src/foo.ts -> src/foo.test.ts
```

Commands:

```text
npm test
npm test -- src/path/to/file.test.ts
npm run typecheck
```

Before marking a task complete:

- Relevant tests pass.
- Type-check passes when applicable.
- Lint/type-check is clean before commit.
- No secrets are exposed.
- Documentation is updated when behavior or contracts change.

## Skills

Code-implemented skills:

| Skill | Purpose | Module |
|-------|---------|--------|
| iterative-refinement | 5-whys analysis + retry logic | `src/skills/iterative-refinement/` |
| llm-dialog-control | LLM dialog validation | `src/skills/llm-dialog-control/` |
| intent-skill | Intent parsing + routing | `src/skills/intent-skill.ts` |
| pipeline-skill | Multi-step task pipeline | `src/skills/pipeline-skill.ts` |
| workflow-skill | Workflow execution | `src/skills/workflow-skill.ts` |
| command-skill | CLI command execution | `src/skills/command-skill.ts` |
| agent-delegate | Agent delegation | `src/skills/ai-modules/agent-delegate/` |
| cli-plugin | External CLI plugins | `src/skills/ai-modules/cli-plugin/` |
| intelligent-diagnosis | Auto diagnosis | `src/skills/ai-modules/intelligent-diagnosis/` |
| semantic-matching | Semantic intent matching | `src/skills/ai-modules/semantic-matching/` |

## Safety

Always:

- Use existing safety and permission mechanisms.
- Preserve user changes.
- Keep secrets out of source, logs, traces, tests, and docs.
- Prefer safe, non-destructive commands.
- Use project path utilities such as `getVectaHubPath()` where applicable; avoid raw `os.homedir()` or hardcoded home paths.

Ask first:

- Database schema changes.
- New dependencies.
- Breaking API contracts.
- Architecture-level rewrites.
- Deleting files or large code paths.

Never:

- Commit secrets or `.env` files.
- Force push to main.
- Modify protected blocks.
- Skip tests while claiming completion.
- Revert unrelated user changes.
- Directly execute untrusted user input.
- Bypass sandbox or command safety logic.

## Git

Commit format:

```text
[module] short description
```

Branch examples:

```text
feature/workflow
feature/opencli
fix/xxx
```

Rules:

- List only human authors in git commits.
- Do not add AI co-author trailers.
- Do not amend commits unless explicitly requested.
- Do not force push to main.
- Before committing, run relevant tests and type-check.
