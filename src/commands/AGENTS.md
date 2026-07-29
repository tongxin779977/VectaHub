# AGENTS.md — src/commands/

> 95 files, flat directory. 34 CLI commands registered as lazy proxies via `src/cli-command-registry.ts`.
> 4 built-in commands (`version`/`setup`/`config`/`completion`) live in `src/cli-main.ts`, not here.

## Overview

Every file here exports a Commander.js `Command` factory (`(ctx: InfrastructureContext) => Command`) or a direct `Command` instance. Commands consume `src/orchestration-plan/` (planners, draft-executor), `src/execution/` (record-manager), and `src/infrastructure/` (context, logger, CLI output). LLM commands were removed (per `docs/08-llm-removal.md`).

## Where to Look

| Task | File(s) |
|------|---------|
| NL intent → execute | `run.ts` (+ `run-dispatch.ts`, `run-dry-run-envelope.ts`, `run-task-contract-resolver.ts`) |
| Document task execution | `run-task.ts` (+ `run-task-spawner.ts`, `run-task-contract-builder.ts`, `run-task-security.ts`, `run-task-output-formatter.ts`, `run-task-review.ts`, `run-task-shared.ts`) |
| Parse document to tasks | `parse-doc.ts` |
| Health check | `doctor.ts` |
| Workflow draft management | `draft.ts` |
| Interactive NL REPL | `chat.ts` |
| Execution queue | `queue.ts` |
| Agent task contracts | `agent-task-contract.ts` |
| Agent CLI discovery | `agent-cli-adapter.ts` |
| Execution trace | `trace.ts` |
| Workflow execution | `archive.ts`, `rerun.ts`, `resume.ts`, `detail.ts`, `history.ts`, `list.ts` |
| Recovery | `recover-task.ts` |
| Test helpers | `test-helpers.ts` |
| Shared run-task constants | `run-task-shared.ts` (timeouts, limits, factories) |

## Registration

All commands register via `src/cli-command-registry.ts` as lazy proxy imports. Three binding types:

```
{ bindings: [{ name, exportName, isFactory: true }] }   // factory: (ctx) => Command  
{ bindings: [{ name, exportName, isFactory: false }] }  // direct: ChatCmd / DaemonCmd
{ multiFactory, bindings: [{ name, resultKey }] }       // multi-factory (serve.ts only)
```

The `needsAgentRuntime` flag (on `tools`, `chat`, `run-task`, `vscode`, `provider`) gates lazy-loading behind `loadAgentRuntime()`.

## Conventions

- **Factory naming**: `createXxxCmd(ctx): Command` (e.g. `createRunCmd`, `createDoctorCmd`).
- **Export**: use named exports. Barrel file `index.ts` re-exports factories for fast dev-mode import.
- **Context**: receive `InfrastructureContext` directly. Never call `getDefaultContext()` here.
- **CLI output**: use `createCliOutput({ json: isJson })` for JSON-aware printing. Detection: `options.json || context.environment.getArgv().includes('--json')`.
- **Logging**: `context.logger.getLogger('command-name')` or `context.logger`.
- **Test files**: co-located `*.test.ts` next to source. Use `test-helpers.ts` mocks.
- **--json consistency**: every list/detail command supports `--json` with a `{ ok, data/error }` envelope.

## Anti-Patterns

- **Don't use old static exports**: `runTaskCmd`, `runTaskCleanLogsCmd`, `runCmd` are deprecated proxies for backward compat. Always use `createRunTaskCmd(ctx)` / `createRunCmd(ctx)`.
- **Don't call `getDefaultContext()`**: commands must receive their context. This is enforced by CI (`check:default-context-usage`).
- **Don't hardcode --json detection**: use `options.json || context.environment.getArgv().includes('--json')`.
- **Don't register commands directly in the file**: commands are only wired via `cli-command-registry.ts`.
- **Don't add LLM-inference modules**: LLM commands were removed. NL goes through `nl/` orchestration layer.
- **Don't bypass safety**: command execution must go through `security-protocol/` path, not raw `exec()`.
