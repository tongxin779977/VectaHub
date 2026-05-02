# VectaHub

Workflow editor + execution engine. TypeScript CLI project.

## Structure

```
src/cli.ts                    # CLI entry (Commander.js)
src/index.ts                  # Package entry
src/types/index.ts            # All type definitions
src/nl/                       # Intent matching + param extraction + LLM
src/workflow/                 # Engine core (scheduler/executor/context/storage)
src/sandbox/                  # Sandbox isolation + danger detection
src/cli-tools/                # External tool integration (git/npm/docker/curl)
src/skills/                   # Skills (iterative-refinement, llm-dialog-control)
src/setup/                    # First-run wizard + CLI scanner
src/security-protocol/        # Security rules engine
src/command-rules/            # Command blacklist/whitelist
src/infrastructure/           # Audit/config/errors/logger
src/utils/                    # CLI commands (run/generate/serve/tools/etc)
.trae/rules/                  # Trae IDE rules (global/project/security/test/git)
.trae/skills/                 # Trae IDE skills (SKILL.md registrations)
.trae/commands/               # Trae IDE commands (usage docs)
```

Tech stack: TypeScript + Node.js + Commander.js + Vitest

## Rule Priority

1. `.trae/rules/global_rules.md` — highest priority, conflict resolution
2. `.trae/rules/project-rules.md` — project-specific conventions
3. `.trae/rules/security-rules.md` — danger classification
4. `.trae/rules/test-rules.md` — test conventions
5. This file (AGENTS.md) — quick reference summary

## Rules

- TDD always: write failing test → minimum code to pass → refactor
- Single file change or user says "直接改" → do it directly
- 2+ options, 3+ files, delete/change interface/architecture → ask first
- When uncertain: say "需要确认 X", don't guess

## Output

- Show diffs or full code blocks, follow the task document's specification
- Only show changed parts
- Don't repeat what AI already knows
- For implementation tasks, follow `docs/design/04_agent_tasks.md` exactly

## Code Style

- 2-space indent, semicolons required, single quotes, 100-char line width
- Import order: built-in → third-party → internal → types (local imports with `.js`)
- New components use `createXxx()` factory functions, not classes

## Testing

| Module | Coverage |
|--------|----------|
| Workflow Engine | ≥80% |
| Executor | ≥75% |
| Others | ≥70% |

Test files live next to source files: `src/foo.ts` → `src/foo.test.ts`
Run tests: `npm test` or `npm test -- src/path/to/file.test.ts`
Run typecheck: `npm run typecheck`

## Skills

Available project skills (in `.trae/skills/`):

| Skill | Trigger | Purpose |
|-------|---------|---------|
| command-auditor | Reviewing command safety | Audit commands for danger patterns |
| intent-matcher-designer | Designing NL intent | Create/optimize keyword matching rules |
| test-generator | Writing new tests | Generate Vitest tests following TDD |
| workflow-builder | Creating YAML workflows | Build workflow configurations |

Code-implemented skills (in `src/skills/`):

| Skill | Purpose |
|-------|---------|
| iterative-refinement | 5-whys analysis + retry logic |
| llm-dialog-control | LLM dialog validation |

## Error Handling

- Type errors: run `npm run typecheck` first, then fix
- Test failures: run `npm test -- --run` to see full output, then fix
- Failed fix: say "tried X, failed, need confirmation", don't retry infinitely
- Unknown API: check `src/types/index.ts` and source code, don't guess

## Safety

- No hardcoded secrets
- No direct execution of user input
- No bypassing sandbox
- No logging sensitive data

## Git

Format: `[module] short description`
Branches: `feature/workflow` / `feature/opencli` / `fix/xxx`
