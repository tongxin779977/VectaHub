# VectaHub Project Instructions

VectaHub is a TypeScript + Node.js CLI project for workflow editing, natural-language orchestration, command safety, trace/audit, and execution tooling.

This file contains only project-specific guidance. General agent behavior is defined by the global `AGENTS.md`.

## Source Of Truth

Prefer these authorities before changing behavior:

- Types and public contracts: `src/types/`, `src/types/index.ts`
- CLI command contracts: `src/commands/`, `src/cli.ts`, `src/cli-main.ts`, `src/cli-bootstrap.ts`
- Workflow execution contracts: `src/workflow/`
- NL behavior contracts: `src/nl/`
- Safety and command-control contracts: `src/sandbox/`, `src/command-rules/`, `src/cli-tools/`
- Trace, audit, config, errors, and logging: `src/infrastructure/`
- Project contracts and standards: `docs/contracts/`, `docs/standards/`, `docs/agent-operating-guide.md`

If code and docs disagree, identify the current source of truth before editing either.

## Project Hard Stops

Stop and ask before continuing when a change would:

- bypass sandbox, command risk checks, permission prompts, audit, trace, or confirmation flow
- fabricate final argv or execution state outside the native command registry
- weaken JSON output contracts consumed by machine interfaces or the VS Code extension
- change persisted records, state-machine semantics, trace identity, or recovery behavior
- present custom rule, custom skill, or MCP execution as supported current behavior
- add new dependencies or new external execution surfaces

Current project policy keeps custom rules, custom skills, and MCP-style external execution deferred unless the relevant contracts, safety boundaries, trace/audit links, and verification gates are explicitly implemented.

## Project Skill Routing

Use project skills for VectaHub-specific development workflows:

| Task | Skill |
|---|---|
| Contract, state, persistence, trace, audit, or API behavior changes | `vectahub-contract-change` |
| Sandbox, command-rules, permission, confirmation, audit, or redaction changes | `vectahub-safety-boundary` |
| NL intent, fallback, tool-calling, prompt, semantic acceptance, or command synthesis changes | `vectahub-nl-behavior` |
| Choosing focused verification for a change | `vectahub-verification-gate` |
| Updating docs/contracts/design/standards after code or policy changes | `vectahub-doc-truth` |
| Debugging failures using traces, audit records, run records, or state contracts | `vectahub-debug-loop` |

Do not load all project skills by default. Load the most specific skill for the task.

## Project Verification Anchors

Use focused checks first, then broader checks when the change justifies them:

- `npm run typecheck`
- `npm run lint`
- `npm run check:default-context-usage`
- `npm run test:run`
- `npm run build`
- focused Vitest target such as `npm test -- src/path/file.test.ts --run`
- `npm run dev -- doctor`
- `npm run dev -- security list`
- `npm run dev -- security test -- "rm -rf /tmp/test"`
- `git diff --check`

When NL or CLI output semantics change, prefer focused regression tests for the exact utterance, command, JSON shape, or machine-output path.

## Project Conventions

- Use named exports; avoid default exports in project source.
- Preserve ESM import style and `.js` import extensions where the surrounding code requires them.
- Keep tests colocated with source when adding or updating tests.
- Use VectaHub path utilities such as `getVectaHubPath()` for VectaHub-managed paths.
- Treat direct `getDefaultContext()` use outside allowed composition roots or bridge files as a project contract risk.
- Prefer deterministic rules for safety, validation, and state transitions; use LLM output only for candidates, explanations, ranking, diagnosis, or summaries.

## Documentation Truth

Docs must describe current behavior unless clearly marked as planned, deferred, or follow-up work.

Project documents that mention custom rules, custom skills, MCP, passthrough, trace, audit, recovery, or native execution must remain aligned with `docs/contracts/native-feature-passthrough-policy.md` and relevant contracts under `docs/contracts/`.
