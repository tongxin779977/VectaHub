# Engineering Quality Audit

## Summary

This audit checks whether VectaHub source code consistently uses the new infrastructure layer and whether the current codebase follows maintainability expectations aligned with Google-style engineering practices: explicit dependencies, small cohesive units, observable failures, clear ownership boundaries, and testable production paths.

The audit is search-based and AST-assisted. It is not a formal static analysis proof, but it identifies the main remaining migration and maintainability risks with concrete file references.

## Scope

Included:

- `src/**`
- `packages/vectahub-vscode-extension/src/**`
- Non-generated package source that appeared in infrastructure scans

Excluded:

- `packages/**/out/**`
- Test files for most infrastructure and console scans unless noted
- Generated artifacts and dirty build output
- Root documentation and release metadata

## Verification Commands

The following checks were run from the repository root:

```bash
npm run typecheck
npm run lint
rg -n "from ['\"][^'\"]*(utils/(logger|audit|config|errors|event-manager|paths)|infrastructure/index|infrastructure/logger/index)\.js['\"]|import \{[^}]*\b(audit|getCurrentSessionId|loadConfig|updateConfig|getLogger|setLogLevel|setMuted|createEventManager|globalEventManager)\b[^}]*\} from ['\"][^'\"]*infrastructure/(audit|config|logger|event)/index\.js['\"]" src packages --glob '!**/out/**' --glob '!src/infrastructure/**' --glob '!src/utils/**'
rg -n "\bconsole\.(log|error|warn|info|debug)\b" src packages --glob '!**/out/**' --glob '!**/*.test.ts'
rg -n "getDefaultContext\(" src packages --glob '!**/out/**' --glob '!**/*.test.ts'
```

Results:

- `npm run typecheck`: passed.
- `npm run lint`: passed with `1128` warnings and `0` errors.
- Compatibility import scan: no business-code matches after excluding compatibility bridge directories.
- Console scan: direct `console.*` remains in many non-test source files.
- `getDefaultContext()` scan: the default global infrastructure context remains widely used outside the infrastructure layer.
- Type-safety scan: `any`, double assertions, non-null assertions, and unused symbols remain in source.
- Hardening scan: fallback-style returns, "continue running" warnings, placeholder code, and not-implemented branches remain in production source.
- Determinism and lifecycle scan: direct process exits, time/random ID generation, global mutable state, and local-machine paths remain in source.

## Remediation Progress

This section records remediation batches completed after the original audit snapshot. It is intentionally separate from the findings above because the findings preserve the original scan context and may include examples that have since been migrated.

Completed:

- Batch A closed `P1: Production Source Contains Not-Implemented Branches and Placeholder/Mock Artifacts` for the targeted command and dashboard paths. The `module` command no longer generates not-implemented scaffold artifacts, the trace audit dashboard no longer ships runtime mock data, and the CLI command surface documentation was updated.
- The error-handling batch closed the targeted `P1: Error Handling Still Contains Silent or Degraded Paths` paths in LLM, document parsing, and trace-audit closeout code. Failures now surface explicitly on the repaired paths instead of silently degrading.
- Batch B migrated the primary `run`, `run-task`, run-task cleanup, and CLI tool cache manager paths away from default-context fallback behavior. `cli-main.ts` now acts as the composition root for these command factories, while the target business modules require explicit context on their migrated paths.
- Batch C migrated the `parse-doc` command path to explicit context injection. The command is now registered through `createParseDocCmd(context)`, the old static `parseDocCmd` compatibility export was removed, and parse-doc tests target the factory path.
- Batch D migrated the `list`, `history`, `rollback`, and development `status` command paths to explicit context factories while preserving the existing command options and behavior. The review verified restored history search options, rollback versioning behavior, status JSON output, and the absence of business-level `getDefaultContext()` usage in the migrated command modules.
- Batch E migrated the `generate` command and `self-healing` repair loop to explicit context dependencies. The `generate` command is now registered through `createGenerateCmd(context)`, and `runSelfHealingLoop` receives infrastructure context from its caller instead of resolving the default context at module load time.
- Batch F migrated the `run-command` and `trace` command paths to explicit context factories while preserving command options, JSON output, and error behavior. The trace command tests now target `createTraceCmd(context)`.
- The `run-command` metadata path was also updated to use `context.environment.getCwd()` instead of direct `process.cwd()`, closing the leftover runtime-boundary risk identified during Batch F review.
- Batch G migrated the `verify`, `doctor`, and `build` command paths to explicit context factories. The `verify` and `doctor` internal helpers (`runVerification`, `runChecks`) now accept explicit environment parameters instead of resolving the default context at module load time. The `doctor.test.ts` was updated to use a mock `IEnvironmentService` instead of mocking `child_process`.
- Batch H migrated the `security` command path to `createSecurityCmd(context)`. The `getAuditHelper()` and `getCurrentSessionId()` helper functions were removed; audit helper and session ID are now resolved from the injected context. The `security.test.ts` was updated to target `createSecurityCmd(getDefaultContext())`.
- Batch I migrated the `resume` and `rerun` command paths to explicit context factories (`createResumeCmd(context)`, `createRerunCmd(context)`). Module-level `getDefaultContext()` bindings were removed. The review verified that both command modules no longer use business-level default context access, and tests were updated to use mock context instead of relying on static command exports.
- Batch J migrated the `mode`, `schedule`, `test`, and `validate` command paths to explicit context factories (`createModeCmd(context)`, `createScheduleCmd(context)`, `createTestCmd(context)`, `createValidateCmd(context)`). Module-level `getDefaultContext()` bindings were removed. The `validate` command's internal helpers (`extractMethods`, `validateModule`) now accept explicit environment parameters.
- Batch K migrated the `detail`, `archive`, `monitor`, and `audit` command paths to explicit context factories (`createDetailCmd(context)`, `createArchiveCmd(context)`, `createMonitorCmd(context)`, `createAuditCmd(context)`). Module-level `getDefaultContext()` bindings were removed. The review verified the target command modules no longer use business-level default context access, and the `detail` and `archive` command tests now target factory-created commands.
- Batch L migrated the `vscode-diagnostic`, `agent-task-contract`, and `agent-runtime-bootstrap` command/helper paths to explicit context injection. `vscode-diagnostic.ts` now exports `createVscodeDiagnosticCmd(context)` instead of a static `vscodeDiagnosticCmd`. `agent-task-contract.ts`'s `deriveDocExcerpt` now accepts `InfrastructureContext` as its first parameter. `agent-runtime-bootstrap.ts`'s `bootstrapAgentRuntime` and internal helpers (`resolveUserDefaultHome`, `copyBootstrapFile`) now accept `InfrastructureContext` as their first parameter. Callers in `cli-main.ts`, `run-task.ts`, and `cli-scanner.ts` were updated to pass explicit context. The review verified that the target command/helper modules no longer use business-level default context access. The `cli-scanner.ts` functions (`scanSingleTool`, `scanCLITools`) still use a default parameter `context = getDefaultContext()` only for backward compatibility with `tools.ts` and `priority-installer.ts` which are deferred to a later batch.
- Batch M migrated the `export` and `import` command paths to explicit context factories (`createExportCmd(context)`, `createImportCmd(context)`). The module-level `getDefaultContext()` binding and derived environment/logger singletons were removed from `src/commands/export.ts`, and `cli-main.ts` now registers both commands from the composition-root context. The review verified that `src/commands/export.ts` no longer uses business-level default context access, and `export.test.ts` targets the factory-created command path.
- Batch N migrated the `tools` command, CLI scanner, and priority installer scan bridge to explicit context injection. `tools.ts` now exports `createToolsCmd(context)`, `scanSingleTool` and `scanCLITools` now require `InfrastructureContext`, and `createDefaultInstaller(context)` passes that context into CLI scanning. The review verified no old-signature calls remain for `scanCLITools()`, `scanSingleTool(name)`, or `createDefaultInstaller()`.
- Batch O migrated the `doc-task-runs` command path to explicit context injection. `doc-task-runs.ts` now exports `createDocTaskRunsCmd(context)`, and the exported helpers (`listRecentRuns`, `readLatestRuns`, `findRunById`) now receive `InfrastructureContext` from their callers instead of resolving the default context internally. The review verified that `src/commands/doc-task-runs.ts` no longer uses business-level default context access.
- Batch P migrated the `templates` command path to explicit context injection. `templates.ts` now exports `createTemplatesCmd(context)`, resolves the built-in templates directory from that context, and creates the `use` and `save` subcommands inside the factory instead of exporting default-context-bound static commands. The review verified that `src/commands/templates.ts` no longer uses business-level default context access.
- Batch Q migrated the `serve` and `client` command paths to explicit context injection. `serve.ts` now exports `createServeCommands(context)`, resolves socket and queue paths from the injected environment, and resolves audit helper/session access from the injected audit services. The review verified that `src/commands/serve.ts` no longer uses business-level default context access.

Latest verification:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npx vitest run src/commands/trace.test.ts`: passed.
- `npx vitest run src/commands/doctor.test.ts`: passed.
- `npx vitest run src/commands/security.test.ts`: passed.
- `npx vitest run src/commands/resume.test.ts`: passed.
- `npx vitest run src/commands/rerun.test.ts`: passed.
- `npx vitest run src/commands/detail.test.ts src/commands/archive.test.ts`: passed.
- `npx vitest run src/commands/vscode-diagnostic.test.ts src/commands/agent-task-contract.test.ts src/commands/agent-runtime-bootstrap.test.ts`: passed (20/20).
- `npx vitest run src/setup/cli-scanner.test.ts`: passed.
- `npx vitest run src/commands/vscode-diagnostic.test.ts src/commands/agent-task-contract.test.ts src/commands/agent-runtime-bootstrap.test.ts src/setup/cli-scanner.test.ts`: passed (39/39).
- `npx vitest run src/commands/export.test.ts`: passed (4/4).
- `npx vitest run src/commands/tools.test.ts src/setup/cli-scanner.test.ts src/setup/priority-installer.test.ts`: passed (47/47).
- `npx vitest run src/commands/doc-task-runs.test.ts`: passed (5/5).
- `npx vitest run src/commands/templates.test.ts`: passed (2/2).
- `npx vitest run src/commands/serve.test.ts`: passed (3/3).

Remaining focus for `P1: Default Global Infrastructure Context Is Still Used as a Compatibility Path`:

- Several command modules still call `getDefaultContext()` directly, including `recover-task`.
- NL and CLI-tool support modules still contain default-context fallbacks, including `src/nl/llm.ts`, `src/nl/intent-matcher.ts`, `src/nl/core/pipeline.ts`, `src/nl/llm-orchestrator.ts`, `src/cli-tools/command-rules/audit.ts`, and `src/cli-tools/registration/config.ts`.
- The next remediation batches should continue to be narrow migrations that preserve existing behavior while replacing implicit default-context access with explicit dependencies.

## Findings

### P1: Default Global Infrastructure Context Is Still Used as a Compatibility Path

`src/infrastructure/context.ts` documents `getDefaultContext()` as the default global context for backward compatibility and recommends explicit `InfrastructureContext` creation instead. Business code still calls this global context directly in many places.

Representative locations:

| File | Evidence |
| --- | --- |
| `src/cli-main.ts:17` | Creates a module-level `ctx` from `getDefaultContext()`. |
| `src/commands/run.ts:20` | Uses a module-level default context for command execution. |
| `src/commands/run-task.ts:25` | Wraps `getDefaultContext()` behind a local helper. |
| `src/workflow/engine.ts:346` | Falls back to `getDefaultContext().audit.getHelper()` when dependencies are not passed. |
| `src/workflow/executor.ts:87` | Falls back to default audit infrastructure. |
| `src/sandbox/sandbox.ts:20` and `src/sandbox/sandbox.ts:133` | Uses default context for audit session and helper fallback. |
| `src/api/server.ts:19` and `src/api/server.ts:23` | Resolves audit dependencies through the global context. |
| `src/cli-tools/discovery/cache-manager.ts:16`, `:43`, `:114` | Resolves logger, config, and audit through the global context. |

Why this matters:

- Global infrastructure access makes dependencies implicit and harder to test.
- Modules cannot reliably run with isolated context instances.
- This conflicts with the "no compatibility mode" target if `getDefaultContext()` is treated as a compatibility entrypoint.

Recommended remediation:

- Define dependency interfaces at command/service boundaries first.
- Pass `InfrastructureContext` or narrower service dependencies explicitly into command registration, workflow engine, sandbox, daemon, API server, and CLI-tool modules.
- Keep `getDefaultContext()` only at the top-level composition root until the CLI bootstrap can create and pass a context.
- Remove fallback access inside core modules after call sites have been migrated.

### P1: Direct Node Runtime and Filesystem Access Bypasses Infrastructure Boundaries

Many non-infrastructure modules still import `fs`, `path`, `os`, `child_process`, or read `process.env` / `process.cwd()` directly. Some of these are acceptable at boundaries, but core workflow, sandbox, NL, execution, security, and package integration modules should prefer the infrastructure environment service or a dedicated execution/filesystem abstraction.

Representative locations:

| Area | Examples |
| --- | --- |
| CLI commands | `src/commands/build.ts:2`, `src/commands/run-command.ts:36`, `src/commands/run-task.ts:1502`, `src/commands/export.ts:2` |
| Workflow core | `src/workflow/executor.ts:1`, `src/workflow/storage.ts:1`, `src/workflow/scheduler.ts:1`, `src/workflow/template-market.ts:1`, `src/workflow/context-manager.ts:73` |
| Sandbox and security | `src/sandbox/sandbox.ts:1`, `src/sandbox/worktree-manager.ts:1`, `src/security-protocol/manager.ts:1`, `src/security-protocol/rbac.ts:1` |
| NL and skills | `src/nl/llm.ts:49`, `src/nl/session-manager.ts:323`, `src/skills/command-skill.ts:2`, `src/skills/ai-modules/agent-delegate/agent-loop.ts:1` |
| Extension source | `packages/vectahub-vscode-extension/src/cli/adapter.ts:1`, `packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts:1`, `packages/vectahub-vscode-extension/src/trace/writer.ts:1` |

Why this matters:

- Runtime, filesystem, command execution, and path resolution policies become duplicated.
- Tests need heavier mocking because dependencies are hardcoded.
- Security and audit controls can be bypassed by direct process execution paths.

Recommended remediation:

- Treat direct filesystem/process access outside infrastructure as an exception that must be justified.
- Expand or reuse `InfrastructureContext.environment` for file, path, env, process, and command execution needs where the abstraction already exists.
- For command execution, route through a command executor service that can enforce audit, timeout, environment redaction, and sandbox policy.
- For extension-specific VS Code APIs, keep VS Code boundary code local, but isolate filesystem/process operations behind extension-local adapters.

### P1: Direct Console Output Remains Broadly Used

Direct `console.log`, `console.warn`, and `console.error` remain in non-test source files. Some command output is user-facing and should not be sent to a structured logger, but it still needs a dedicated CLI output abstraction so JSON mode, dry-run mode, testing, and error formatting remain consistent.

High-volume examples:

| File | Approximate count from scan |
| --- | ---: |
| `src/cli-main.ts` | 43 |
| `src/commands/tools.ts` | 33 |
| `src/commands/serve.ts` | 29 |
| `src/commands/debug.ts` | 27 |
| `src/commands/security.ts` | 25 |
| `src/skills/iterative-refinement/example.ts` | 25 |
| `src/commands/audit-cmd.ts` | 23 |
| `src/commands/run-command.ts` | 19 |
| `src/commands/templates.ts` | 18 |
| `src/commands/queue.ts` | 16 |
| `src/setup/first-run-wizard.ts` | 15 |
| `src/setup/priority-installer.ts` | 13 |

Internal/debug examples that should not use console directly:

- `src/nl/orchestrator.ts:312`
- `src/skills/executor.ts:66`
- `src/security-protocol/manager.ts:85`
- `src/security-protocol/manager.ts:102`
- `src/security-protocol/manager.ts:131`
- `src/security-protocol/manager.ts:149`
- `src/workflow/template-market.ts:100`
- `src/workflow/template-market.ts:202`
- `src/infrastructure/audit/service.ts:28`
- `src/infrastructure/audit/index.ts:112`
- `src/infrastructure/trace-audit/alert-system.ts:298`

Why this matters:

- Console output is hard to test and hard to mute.
- Internal logs can break JSON output contracts if they write to stdout.
- Warnings and audit failures are not consistently structured, redacted, or routed.

Recommended remediation:

- Introduce or reuse a CLI output writer with explicit `stdout`, `stderr`, `json`, and `silent` behavior.
- Use `InfrastructureContext.logger` for internal diagnostics.
- Keep human-readable CLI output separate from internal logs.
- Make JSON-output commands write only machine-readable payloads to stdout.

### P1: Oversized Functions Should Be Split Into Cohesive Units

AST-assisted function scanning found many functions above `80` lines. The highest-risk cases combine command registration, argument parsing, orchestration, formatting, persistence, and error handling in one function.

Top oversized functions:

| Lines | Location | Symbol |
| ---: | --- | --- |
| 1095 | `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts:305` | `registerDocTaskCommands` |
| 942 | `src/commands/run-task.ts:1354` | `runTask` |
| 884 | `src/commands/run-task.ts:1385` | nested command action |
| 630 | `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts:768` | nested command action |
| 488 | `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts:890` | nested command action |
| 347 | `packages/vectahub-vscode-extension/src/commands/recoverDocTask.ts:58` | `registerRecoverDocTaskCommand` |
| 320 | `src/workflow/engine.ts:339` | `createWorkflowEngine` |
| 313 | `src/commands/run.ts:89` | command action |
| 309 | `src/workflow/storage.ts:63` | `createStorage` |
| 303 | `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts:914` | `runSingleTask` |
| 254 | `src/cli-main.ts:143` | `lazyLoadCommand` |
| 251 | `src/chat/repl.ts:132` | `createREPL` |
| 237 | `src/workflow/engine.ts:101` | `runExecutionLoop` |
| 221 | `src/commands/recover-task.ts:60` | `recoverTask` |
| 206 | `src/workflow/executor.ts:78` | `createExecutor` |

Why this matters:

- Functions above this size obscure invariants and make review unreliable.
- Mixed responsibilities make regression tests brittle.
- Error handling and audit behavior become inconsistent across branches.

Recommended remediation:

- Extract pure formatters, option parsers, contract validators, and persistence helpers first.
- Keep command action functions as thin orchestration layers.
- Move workflow execution phases into named services with explicit inputs and outputs.
- Add regression tests around extracted contract behavior before changing orchestration.

### P2: Large Files Concentrate Too Many Responsibilities

Files above `500` lines are not automatically wrong, but they are hotspots for ownership, review, and testing risk.

Large files found:

| Lines | File |
| ---: | --- |
| 2391 | `src/commands/run-task.ts` |
| 1400 | `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts` |
| 977 | `src/sandbox/sandbox.ts` |
| 793 | `src/cli-main.ts` |
| 760 | `src/nl/llm.ts` |
| 659 | `src/workflow/engine.ts` |
| 629 | `src/nl/session-manager.ts` |
| 593 | `src/nl/prompt-manager.ts` |
| 558 | `src/cli-tools/tools/git.ts` |
| 549 | `src/commands/tools.ts` |
| 544 | `packages/vectahub-vscode-extension/src/project/docTaskRecovery.ts` |
| 533 | `src/commands/security.ts` |
| 514 | `packages/vectahub-vscode-extension/src/views/tasksView.ts` |
| 501 | `packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts` |

Recommended remediation:

- Split by contract, not by arbitrary line count.
- Prefer modules such as `options`, `formatter`, `store`, `executor`, `policy`, and `recovery` only when those names match existing domain concepts.
- Avoid moving code without tests around the moved behavior.

### P2: Remaining Compatibility and Deprecated Markers Need Classification

Compatibility bridge files still exist, which is expected if they are intentionally retained for external compatibility. However, the no-compatibility-mode requirement needs a clear allowlist so future reviews can distinguish allowed bridges from accidental business usage.

Expected compatibility bridge examples:

- `src/infrastructure/config/index.ts`
- `src/infrastructure/logger/index.ts`
- `src/infrastructure/audit/index.ts`
- `src/infrastructure/event/event-manager.ts`
- `src/utils/config.ts`
- `src/utils/audit.ts`
- `src/utils/event-manager.ts`
- `src/utils/index.ts`

Non-bridge markers that need review:

- `packages/vectahub-vscode-extension/src/execution/planBuilder.ts:11`
- `packages/vectahub-vscode-extension/src/execution/planBuilder.ts:62`
- `packages/vectahub-vscode-extension/src/commands/previewIntent.ts:27`
- `src/sandbox/sandbox.ts:91`
- `src/security-protocol/factory.ts:33`
- `src/workflow/storage.ts:17`
- `src/workflow/storage.ts:32`
- `src/nl/intent-matcher.ts:6`
- `src/nl/llm-adapter.ts:3`

Recommended remediation:

- Create a small documented allowlist for compatibility bridge files.
- Migrate business modules away from compatibility semantics before removing bridge exports.
- Convert non-bridge compatibility comments into explicit versioned migration tasks or remove them when obsolete.

### P1: Type Safety Debt Is Still Broad

The lint output includes `@typescript-eslint/no-explicit-any` warnings, and direct scans found explicit `any`, `as any`, double assertions through `unknown`, and broad untyped records in production source. Some are legitimate framework boundaries, but several are in core execution, workflow, infrastructure, and command paths.

Representative locations:

| Area | Examples |
| --- | --- |
| Infrastructure interfaces | `src/infrastructure/interfaces/environment-service.ts:131`, `src/infrastructure/interfaces/environment-service.ts:210` |
| Infrastructure implementations | `src/infrastructure/environment/index.ts:257`, `src/infrastructure/environment/index.ts:355`, `src/infrastructure/audit/service.ts:36`, `src/infrastructure/trace-audit/index.ts:199` |
| Workflow and execution | `src/workflow/storage.ts:60`, `src/workflow/storage.ts:90`, `src/workflow/context-transformer.ts:86`, `src/execution/record-manager.ts:60` |
| Commands | `src/commands/run-command.ts:127`, `src/commands/run-command.ts:147`, `src/commands/run-task.ts:95`, `src/commands/history.ts:33` |
| NL and skills | `src/chat/command-bridge.ts:19`, `src/nl/executor/command-executor.ts:59`, `src/skills/ai-modules/agent-delegate/agent-loop.ts:29`, `src/skills/llm-dialog-control/dialog-controller.ts:244` |

Why this matters:

- Type escapes weaken the repository's executable specification.
- Runtime validation and compile-time contracts drift apart.
- Core execution records, workflow state, and audit payloads become easier to corrupt accidentally.

Recommended remediation:

- Define DTOs and schema validators before implementation changes.
- Replace `any` in public infrastructure interfaces with explicit Node stream/process types or narrow project-owned interfaces.
- Replace `as unknown as` conversions with parser functions that validate and return typed objects.
- Keep any unavoidable type escape local, named, and documented with the external library boundary it represents.

### P1: Non-Null Assertions Hide Invalid-State Risks

The production scan found non-null assertions (`!`) in infrastructure, daemon, workflow, command, and extension code. Some follow a local guard, but several encode assumptions that should be made explicit through control flow or typed state.

Representative locations:

| Area | Examples |
| --- | --- |
| Event bus | `src/infrastructure/event/bus.ts:39`, `src/infrastructure/event/bus.ts:51`, `src/infrastructure/event/bus.ts:62` |
| Daemon/socket lifecycle | `src/daemon/index.ts:140`, `src/daemon/socket-server.ts:230`, `src/daemon/socket-server.ts:237` |
| Workflow execution | `src/workflow/dag.ts:106`, `src/workflow/parallel-executor.ts:48`, `src/workflow/parallel-executor.ts:95` |
| Query/indexing | `src/infrastructure/trace-audit/query-engine.ts:91`, `src/infrastructure/trace-audit/query-engine.ts:112` |
| Commands | `src/cli-main.ts:44`, `src/cli-main.ts:597`, `src/commands/run.ts:303`, `src/commands/history.ts:82` |

Why this matters:

- Non-null assertions can turn recoverable invalid state into runtime crashes without useful domain context.
- They often indicate missing state modeling, especially around lifecycle and queues.

Recommended remediation:

- Replace non-null assertions with explicit guards and domain-specific errors.
- Use discriminated unions for lifecycle states where objects are only valid after initialization.
- Prefer local helper functions such as `requireServer()` or `requireWorkflow()` when a value must exist.

### P1: Error Handling Still Contains Silent or Degraded Paths

The repository rule requires loud failures and no silent fallbacks. The scan did not find simple empty `catch {}` blocks, but it did find many fallback-style returns, "continue running" warnings, and catch branches that downgrade failures to defaults or empty collections. Some are valid user-facing optional paths, but security, audit, storage, workflow, and configuration paths need stricter classification.

Representative locations:

| Pattern | Examples |
| --- | --- |
| Continue after infrastructure failure | Historical `src/cli-main.ts` lazy-load, security-policy warning, and CLI audit-event paths were hardened in batch 3; re-scan before using this row as a current representative example. |
| Load defaults after failure | `src/security-protocol/manager.ts:85`, `src/security-protocol/manager.ts:131` |
| Return empty data after failure or missing storage | `src/command-rules/loader.ts:16`, `src/command-rules/loader.ts:24`, `src/execution/queue-manager.ts:60`, `src/workflow/storage.ts:221` |
| Return null/undefined in core parsing or execution paths | `src/nl/llm.ts:58`, `src/nl/llm.ts:110`, `src/workflow/trace-audit-adapter.ts:259`, `src/commands/run-task.ts:307` |
| Fallback behavior in user-critical flows | `src/commands/parse-doc.ts:327`, `src/commands/parse-doc.ts:370`, `src/commands/run-task.ts:1466` |

Batch 3 scope clarification:

- `src/workflow/storage.ts:221` missing execution directories returning empty arrays and `src/workflow/storage.ts:361` missing workflow files returning `null` are classified as expected absence, not silent failure.
- Batch 3 should preserve these two storage behaviors unless the persistence contract is explicitly changed to treat missing resources as hard failures.
- `src/cli-main.ts` now fails fast for CLI tool registration, agent runtime initialization, security policy warning display, and CLI subcommand audit event recording failures, with CLI regression coverage in `src/cli-main.error-handling.test.ts`.

Why this matters:

- Degraded mode can hide broken audit, security, or execution behavior.
- Empty-array and null returns erase failure context.
- Operators cannot distinguish "no data" from "failed to read data" unless errors are preserved.

Recommended remediation:

- Classify every fallback path as either expected absence, optional feature degradation, or hard failure.
- Use typed result objects only when callers must branch on failure; otherwise throw `VectaHubError` with `cause`.
- Do not continue after audit/security initialization failures unless the command explicitly supports an unsafe/degraded mode and reports it in the contract.

### P1: Production Source Contains Not-Implemented Branches and Placeholder/Mock Artifacts

Production code still includes not-implemented branches and placeholder/mock artifacts. These are acceptable in prototypes, but not in a high-quality CLI execution engine unless guarded as explicit experimental commands.

Representative locations:

| File | Evidence |
| --- | --- |
| `src/commands/module.ts:38` | `throw new Error('Not implemented')` |
| `src/commands/module.ts:62` | `throw new Error('Not implemented')` |
| `src/commands/module.ts:82` | `throw new Error('Not implemented')` |
| `src/commands/module.ts:102` | `throw new Error('Not implemented')` |
| `src/commands/module.ts:120` | `throw new Error('Not implemented')` |
| `src/commands/module.ts:130` | `throw new Error('Not implemented')` |
| `src/commands/module.ts:150` | `throw new Error('Not implemented')` |
| `src/commands/module.ts:163` | `throw new Error('Not implemented')` |
| `src/cli-main.ts:750` | Creates a `placeholderCmd` for lazy command loading. |
| `src/infrastructure/trace-audit/dashboard.html:480` | Uses `mockData` in a production dashboard asset. |

Why this matters:

- Users can reach code paths that fail with implementation placeholders rather than product-level errors.
- Placeholder command behavior complicates CLI help, lazy loading, and test expectations.
- Mock data in production assets can be mistaken for real observability state.

Recommended remediation:

- Hide incomplete commands behind explicit experimental gates or remove their registration.
- Replace `Not implemented` with implemented behavior or a clear unsupported-feature contract.
- Move mock dashboard data behind a development-only fixture or replace it with an empty-state model.

### P2: Lint Warnings Indicate Style and Hygiene Drift

`npm run lint` reports `1128` warnings. The main classes observed are:

- `no-console`
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unused-vars`

Why this matters:

- A warning-only lint setup lets quality debt accumulate without a clear regression gate.
- Unused imports/variables indicate incomplete refactors or dead code.
- Style drift makes reviews noisy and hides meaningful changes.

Recommended remediation:

- Establish a warning budget and ratchet it down by module.
- Start by making `no-console` and `no-explicit-any` blocking in newly touched files.
- Remove unused imports and variables in low-risk mechanical cleanup batches.

### P1: Global Mutable State and Singletons Reduce Isolation

Several production modules keep process-wide mutable state or singleton instances. Some registries are expected, but broad singleton usage makes tests order-dependent and weakens dependency injection.

Representative locations:

| Pattern | Examples |
| --- | --- |
| Global infrastructure context | `src/infrastructure/context.ts:69` |
| Global registries/managers | `src/agent-runtime/registry.ts:37`, `src/cli-tools/registry.ts:95`, `src/cli-tools/discovery/cache-manager.ts:191`, `src/security-protocol/manager.ts:10` |
| Global caches/state | `src/nl/tool-calling.ts:164`, `packages/vectahub-vscode-extension/src/cli/readiness.ts:16`, `packages/vectahub-vscode-extension/src/cli/readiness.ts:17` |
| Static active writer set | `src/infrastructure/trace-audit/async-writer.ts:35` |

Why this matters:

- Test isolation depends on manual reset functions.
- Multiple CLI invocations in one process can share stale state.
- Dependency ownership is unclear when modules read global state directly.

Recommended remediation:

- Move singleton construction to composition roots.
- Pass registries, caches, and managers through explicit dependencies.
- Require reset/cleanup contracts for unavoidable process-wide services.

### P1: Direct Process Exit Bypasses Cleanup and Testability

Direct `process.exit()` appears outside the infrastructure environment service. For CLI entrypoints this may be acceptable, but most command and daemon code should return structured exit decisions so cleanup, trace flushing, and tests can run predictably.

Representative locations:

- `src/cli-bootstrap.ts:40`
- `src/chat/repl.ts:424`
- `src/daemon/socket-server.ts:181`
- `src/utils/gh-to-queue.ts:53`
- `src/utils/gh-to-queue.ts:60`
- `src/utils/process-diagnostic-queue.ts:152`
- `src/utils/process-diagnostic-queue.ts:163`
- `packages/vectahub-vscode-extension/scripts/run-e2e.cjs:145`

Why this matters:

- Direct exits can skip logger flush, audit flush, trace closeout, and lifecycle cleanup.
- Tests need to monkeypatch process exits.
- Library-like modules become unsafe to call from other runtime hosts.

Recommended remediation:

- Keep process termination at CLI bootstrap boundaries.
- Use `InfrastructureContext.environment.exit()` only in approved entrypoints.
- Return typed command outcomes from command handlers and let the top-level runner map them to exit codes.

### P2: Time and Randomness Are Scattered Instead of Injected

Direct `Date.now()`, `new Date()`, and `Math.random()` are widely used for IDs, timestamps, durations, and temporary file names. This is common, but high-quality execution systems usually centralize clock and ID generation so tests are deterministic and identifiers follow one contract.

Representative locations:

| Area | Examples |
| --- | --- |
| Extension run IDs | `packages/vectahub-vscode-extension/src/commands/docTaskRunHelpers.ts:10`, `packages/vectahub-vscode-extension/src/project/docTaskRecovery.ts:473`, `packages/vectahub-vscode-extension/src/trace/context.ts:4` |
| Core audit/operation IDs | `src/infrastructure/audit/index.ts:191`, `src/infrastructure/data/operation-log.ts:95`, `src/infrastructure/data/operation-log.ts:129` |
| NL/session IDs | `src/nl/llm-orchestrator.ts:188`, `src/nl/command-synthesizer.ts:297`, `src/chat/repl.ts:388` |
| Workflow/command IDs | `src/commands/run-command.ts:37`, `src/commands/run-command.ts:124`, `src/commands/run.ts:270`, `src/workflow/scheduler.ts:207` |
| Security rule IDs | `src/security-protocol/manager.ts:205`, `src/security-protocol/manager.ts:385` |

Why this matters:

- Tests become timing-sensitive.
- IDs and trace correlation formats drift across modules.
- `Math.random()` is not appropriate for security-sensitive tokens or collision-sensitive identifiers.

Recommended remediation:

- Add clock and ID generator services to infrastructure.
- Use `crypto.randomUUID()` or existing crypto APIs for collision-sensitive identifiers.
- Define ID format contracts per domain: trace, span, run, recovery, schedule, audit session.

### P2: Generic Error Usage Is Not Fully Aligned With Domain Error Contracts

`VectaHubError` exists and is used in many command paths, but many core modules still throw plain `Error`. Plain errors are acceptable at low-level boundaries, but public command/workflow/security contracts should preserve type, code, and cause consistently.

Representative locations:

| Area | Examples |
| --- | --- |
| Workflow core | `src/workflow/engine.ts:574`, `src/workflow/engine.ts:579`, `src/workflow/parallel-executor.ts:116`, `src/workflow/dag.ts:42` |
| NL core | `src/nl/orchestrator.ts:317`, `src/nl/orchestrator.ts:357`, `src/nl/core/pipeline.ts:150`, `src/nl/tool-calling.ts:303` |
| LLM client | `src/nl/llm.ts:200`, `src/nl/llm.ts:520`, `src/nl/llm.ts:527` |
| Extension command paths | `packages/vectahub-vscode-extension/src/cli/longRunningTaskManager.ts:54`, `packages/vectahub-vscode-extension/src/execution/planRunner.ts:70` |

Why this matters:

- JSON error output cannot always classify failures precisely.
- Recovery logic can only string-match generic messages.
- Error handling contracts become harder to test.

Recommended remediation:

- Define domain-specific error classes or `VectaHubError` error codes for workflow, NL, LLM, security, and extension bridge failures.
- Preserve `cause` when wrapping lower-level exceptions.
- Avoid string matching on error messages in recovery or routing logic.

### P2: Local-Machine and Environment-Specific Paths Are Present

Most path examples are documentation or expected `~/.vectahub` references, but one script includes an absolute local workspace path.

Representative location:

- `packages/vectahub-vscode-extension/scripts/run-e2e.cjs:18`

Why this matters:

- Scripts become non-portable across contributors and CI.
- Local paths can accidentally leak developer environment details.

Recommended remediation:

- Resolve E2E workspaces from environment variables, temporary directories, or repository fixtures.
- Keep user-specific paths out of committed scripts.

## Recommended Remediation Order

1. Define the infrastructure usage policy.
   - Decide whether `getDefaultContext()` is allowed only at composition roots.
   - Document the allowlist for compatibility bridge files.

2. Introduce a CLI output abstraction.
   - Migrate command output gradually.
   - Keep stdout clean for JSON contracts.
   - Route internal diagnostics to `InfrastructureContext.logger`.

3. Replace implicit default context access.
   - Start with core modules: workflow engine, executor, sandbox, API server, daemon, and CLI-tool discovery.
   - Then migrate command modules.

4. Centralize direct Node runtime access.
   - Move filesystem, env, cwd, path, and child-process usage behind infrastructure or domain adapters.
   - Treat sandbox and command execution paths as priority because they affect safety controls.

5. Split oversized functions around stable contracts.
   - Begin with `src/commands/run-task.ts` and `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts`.
   - Extract validators and formatters before execution control flow.
   - Preserve behavior with focused regression tests.

6. Reduce type and error-handling debt.
   - Replace public `any` interfaces with project-owned contracts.
   - Remove unsafe non-null assertions from lifecycle and queue code.
   - Convert silent or degraded paths into explicit typed outcomes or loud failures.

7. Remove production placeholders.
   - Finish, gate, or unregister not-implemented command branches.
   - Move mock dashboard data out of production runtime assets.

8. Centralize lifecycle and determinism concerns.
   - Move process exit decisions to entrypoints.
   - Inject clock and ID generation.
   - Remove local-machine paths from scripts.
   - Convert remaining generic public errors into domain errors.

## Audit Limitations

- The scan does not prove every direct Node API usage is wrong. Some boundary modules may legitimately use platform APIs.
- The scan does not classify all lint warnings individually. It uses lint output as a signal and focuses on infrastructure, console, and decomposition issues.
- Generated output was excluded. Source changes should regenerate output through the normal build flow if required.
- Fallback-style returns were reported as audit candidates. Some may be valid optional absence paths after contract review.
- Time and singleton findings are architectural risk signals. Some uses are legitimate, but they should be reviewed against explicit ownership and determinism rules.
