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
```

Tech stack: TypeScript + Node.js + Commander.js + Vitest

## Rule Priority

1. System/developer instructions
2. User request
3. This file (AGENTS.md)

Note: `.trae/` is Trae IDE-specific configuration and is not part of Codex instructions.

## Rules

- TDD always: write failing test → minimum code to pass → refactor
- Single file change or user says "直接改" → do it directly
- 2+ options, 3+ files, delete/change interface/architecture → ask first
- When uncertain: say "需要确认 X", don't guess

## Planning Alignment

- 默认使用中文回复用户，除非用户明确要求其他语言。
- 当用户要求规划任务时，不要静默替换用户预期方案。
- 规划前先复述：用户目标、用户倾向方案、禁止事项、可改动范围。
- 明确列出所有假设；不要把假设当成事实执行。
- 明确列出预计修改的文件/模块，以及不应修改的文件/模块。
- 必须包含：实现思路、边界情况、测试计划、需要用户确认的问题。
- 如果用户预期方案有风险或不是最佳方案，先说明原因并等待确认，不要直接切换方案。
- 如果存在 2+ 个可行方案，输出：
  1. 严格按用户预期的最小改动方案
  2. 推荐的工程化方案
  3. 两者取舍
- 除非用户明确说“直接改”，否则规划完成后等待用户批准再改文件。

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

Code-implemented skills:

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
