# Verification Gates Standard

> Document Status: Current Implementation / Migration Contract
> Authority: Shared validation gates for source, contract, documentation, semantic, and extension-facing changes.
> Last Verified: 2026-05-29

This standard defines which checks should run before work is considered complete. It does not guarantee that every check currently passes on every branch; each task must report what was run and what failed.

## Gate Levels

| Gate | Required When | Commands Or Checks |
|------|---------------|--------------------|
| Documentation gate | Markdown files, docs links, or document structure changed. | Stale-link scan, markdown fence scan, targeted manual navigation check. |
| Type gate | TypeScript source, exported contracts, generated types, or doc paths referenced by code/tests changed. | `npm run typecheck` |
| Lint gate | Source code, lint rules, or quality claims changed. | `npm run lint` |
| Context boundary gate | Dependency injection, default context, CLI bootstrap, infrastructure, or composition boundaries changed. | `npm run check:default-context-usage` |
| Runtime test gate | Runtime behavior, command behavior, workflow, NL, security, recovery, trace, storage, or contracts changed. | `npm run test:run` plus focused tests |
| Semantic E2E gate | NL interpretation, CLI semantic output, command natural-language mapping, or user-facing automation changed. | Semantic shell E2E script or equivalent source-mode semantic tests |
| Extension gate | VS Code extension, UI workflow contracts, CLI JSON consumed by extension, or task state display changed. | Extension build/smoke checks in the relevant extension workspace |
| Build/distribution gate | `dist`, published CLI entry points, packaging, or scripts that run built output changed. | Project build command and smoke check against built CLI |

## Documentation-Only Changes

For documentation-only reorganizations:

- Run stale-reference scans for moved/deleted paths.
- Check markdown fences in modified markdown files.
- Manually inspect the main navigation documents.
- Run `npm run typecheck` only if code, generated docs, tests, or scripts reference moved paths.
- Run `npm run test:run` only if tests or code import or assert moved doc paths.

## Standard Stale-Reference Scan

For this migration, the stale-reference scan must find no remaining matches for retired directory names, retired report/template names, or old spec-path patterns.

## Required Reporting

Completion notes must state:

- Which gates were run.
- Which gates were skipped.
- Why skipped gates were not required.
- Any failing or unverified gate.

Never claim completion when a required gate failed unless the failure is explicitly reported as a remaining blocker.

## Gate Selection Matrix

| Change Type | Minimum Gates |
|-------------|---------------|
| Markdown link or structure only | Documentation gate |
| Contract text only | Documentation gate; type/test gates only if code/tests reference the contract path |
| Contract schema or exported type | Documentation, type, lint, runtime test gates |
| CLI command behavior | Type, lint, context boundary if applicable, runtime, CLI JSON, semantic E2E if user-facing |
| NL or tool-calling behavior | Type, lint, runtime, semantic E2E, intelligent-system eval set |
| Security or permission behavior | Type, lint, runtime, security tests, audit/redaction checks |
| Recovery or trace behavior | Type, lint, runtime, trace/recovery focused tests |
| Extension UI behavior | Documentation if docs changed, extension build/smoke checks, CLI JSON contract checks |
