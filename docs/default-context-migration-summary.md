# Default Context Migration Summary

## Objective

Enforce explicit dependency boundaries across business and support modules by removing direct `getDefaultContext()` usage outside approved composition roots and compatibility bridges.

## Commit Message

```text
refactor(context): enforce explicit dependency boundaries
```

## Why

Business modules were resolving default infrastructure context internally. That made dependencies implicit, harder to test, and easy to regress through hidden logger, environment, audit, config, or path access.

This migration makes dependency ownership explicit and adds a guard to prevent future drift.

## What Changed

- Added `npm run check:default-context-usage`.
- Added `scripts/check-default-context-usage.mjs`.
- Documented the `getDefaultContext()` allowlist in `docs/agent-operating-guide.md`.
- Updated `docs/development.md` to require explicit `InfrastructureContext` or narrow service dependencies instead of default context access.
- Moved legacy no-argument APIs into explicit `compat-bridge.ts` or `*-bridge.ts` files.
- Split facade logic from compatibility bridges for paths, config, logger, event, trace-audit, first-run wizard, and command-rules.
- Updated workflow, chat, NL, daemon, setup, queue, monitoring, debugger, skills, and command paths to receive explicit dependencies.
- Removed silent logger fallbacks, noop/null logger fallbacks, and cross-context command singletons from reviewed paths.

## Allowed `getDefaultContext()` Usage

Allowed only in:

- `src/infrastructure/context.ts`
- `src/cli-main.ts`
- `src/cli-bootstrap.ts`
- `src/**/compat-bridge.ts`
- `src/**/*-bridge.ts`

Everything else must use explicit dependency injection.

## Compatibility Bridge Rule

A compatibility bridge may call `getDefaultContext()` only to assemble dependencies and delegate to explicit-dependency implementation code.

Bridge files must:

- Be named `compat-bridge.ts` or `*-bridge.ts`.
- Keep business logic out of the bridge.
- Mark legacy exports as `@deprecated`.
- Point callers to the explicit dependency API.

## Explicit Dependency Boundary

Normal business modules must not replace `getDefaultContext()` with another hidden default such as module-level `process.env`, `homedir()`, `pino({ level: 'silent' })`, or mutable singleton state.

Allowed direct runtime boundary access is limited to:

- CLI composition roots that assemble dependencies and delegate to explicit-dependency modules.
- Standalone script entrypoints guarded by an executable `main()` path.
- Infrastructure services whose purpose is to wrap Node.js runtime APIs.
- Test helpers and explicit compatibility bridges.

When a module exposes reusable functions, those functions should accept explicit dependencies even if the same file also contains a CLI `main()` bridge.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:run
npm run check:default-context-usage
```

Results:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:run`: passed.
- `npm run check:default-context-usage`: passed with `0` violating files.

Latest full test result:

- Test files: `188 passed`.
- Tests: `2414 passed | 21 skipped`.

## Quality Signal Note

`scripts/collect_quality_signals.sh` now treats production type and output leaks as blocking gates:

- Production explicit `any` usages: `0`.
- Blocking current-process production `console.*` usages: `0`.
- Allowed child-process code string usages: `2`.
- Test explicit `any` usages are reported as advisory debt.

The allowed console strings are JavaScript snippets passed to child `node -e` processes and are not current-process CLI output.

## Recommended Next Batches

1. Reduce explicit `any` in tests with focused, low-risk batches.
2. Audit remaining direct `process.env`, `process.cwd()`, and `homedir()` usage outside composition roots or infrastructure wrappers.
3. Continue splitting oversized command and workflow modules only where tests protect the behavior.
