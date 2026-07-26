# src/utils/ AGENTS.md

## OVERVIEW

Legacy compatibility layer: 41 files, flat, mid-migration to `infrastructure/`. New code should import from `@vectahub/infrastructure`.

## STRUCTURE

Three categories, all funneled through `index.ts`:

**1. Re-export proxies (pure passthrough, `@deprecated`)**
`logger.ts` `errors.ts` `audit.ts` `config.ts` `paths.ts`
One-liners: `export * from '../infrastructure/<module>/index.js'`. No runtime logic.

**2. Standalone implementations (not yet migrated)**
`shell.ts` `shell-tokenizer.ts` `safe-interpolate.ts` `safe-command-builder.ts`
`sensitive-data.ts` `redact.ts` `worker-pool.ts` `lazy-loader.ts`
`lifecycle-manager.ts` `behavior-analyzer.ts` `completion.ts`
`alert-system.ts` `global-options.ts` `lazy-commands.ts` `stream-handler.ts`
`version.ts` `process-diagnostic-queue.ts` `completion-scripts.ts` `path-security.ts`
Plus several also marked `@deprecated` but still have local logic:
`event-manager.ts` `data-cleanup.ts` `config-security.ts` `operation-log.ts`

**3. `index.ts` re-exports from `infrastructure/` subdirectories**
Not proxies, just central barrel: `paths/` `security/` `data/` `event/` `concurrency/` `loaders/`.

**Special**: `gh-to-queue.ts` is copied to `dist/utils/` by tsup `onSuccess` hook for GitHub Actions integration.

## WHERE TO LOOK

| Import from `src/utils/` | Actually lives in |
|---|---|
| `logger.ts` | `infrastructure/logger/` |
| `errors.ts` | `infrastructure/errors/` |
| `audit.ts` | `infrastructure/audit/` |
| `config.ts` | `infrastructure/config/` |
| `paths.ts` | `infrastructure/paths/` |
| `event-manager.ts` | local (deprecated, infra equivalent in `infrastructure/event/`) |
| `config-security.ts` | local (deprecated, infra equivalent in `infrastructure/security/`) |
| `data-cleanup.ts` | local (deprecated, infra equivalent in `infrastructure/data/`) |
| `operation-log.ts` | local (deprecated, infra equivalent in `infrastructure/data/`) |
| `worker-pool.ts` | local (infra equivalent in `infrastructure/concurrency/`) |
| `lazy-loader.ts` | local (infra equivalent in `infrastructure/loaders/`) |
| `sensitive-data.ts` | local (infra equivalent in `infrastructure/security/`) |
| `gh-to-queue.ts` | copied to `dist/utils/` at build time |

## CONVENTIONS

- `index.ts` is the only public entry point for external consumers still using `src/utils/`.
- Files with `@deprecated` in their JSDoc may still be referenced internally. Check `index.ts` for the redirect target.
- When migrating a standalone file to `infrastructure/`, replace the local file with a re-export proxy and add `@deprecated`. Keep the test file here until all consumers move.
- `gh-to-queue.ts` changes must be tested via the build smoke test (`node dist/cli.js version --json`).

## ANTI-PATTERNS

- **Don't add new implementations here.** All new utility logic goes in `infrastructure/`.
- **Don't remove files from this directory** without auditing all importers first. Some consumers still import from `src/utils/` directly.
- **Don't add re-exports to `index.ts`** for new infrastructure modules; only add when backfilling migration paths for existing consumers.
- **Don't treat `@deprecated` files as dead code.** They're part of the migration surface and must remain until all call sites are updated.