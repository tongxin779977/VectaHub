# Implementation Traceability

> Document Status: Migration Contract
> Authority: This document maps documentation claims to source files, tests, and known gaps. It does not redefine behavior contracts.
> Use With: `docs/README.md`, `docs/contracts.md`, and the referenced spec files.

## Purpose

This document prevents design drift by linking target capabilities to their authoritative documents, implementation entry points, verification evidence, and remaining gaps.

It is an index, not a replacement for specs. When a behavior is ambiguous, update the authoritative spec first, then update this traceability table.

## Document Status Labels

| Label | Meaning | Rule |
|------|---------|------|
| `Current Implementation` | Describes behavior implemented in current code and expected to be testable now. | Must cite code, tests, or commands. |
| `Target Design` | Describes intended architecture or product direction. | Must not imply the behavior already works. |
| `Migration Contract` | Describes current compatibility behavior and the target contract being migrated toward. | Must separate current fields from target fields. |
| `Historical Reference` | Preserved for context only. | Must not be used as an implementation source of truth. |

## Authority Rules

| Area | Primary Authority | Notes |
|------|-------------------|-------|
| `run-task` lifecycle | `docs/specs/run-task-execution-contract.md` | Owns dry-run, completion, failure classification, recovery entry semantics, Agent execution mode, and LLM protocol boundaries. |
| Agent runtime and onboarding | `docs/design/agent-execution-system.md`, `docs/specs/tools-security-management.md` | Design owns direction; tools spec owns machine-facing state and command surface. |
| Agent task prompt and boundary | `docs/specs/agent-worker-contract.md` | Owns `AgentTaskContract`, prompt input boundaries, document excerpt limits, and validation command derivation. |
| CLI command surface | `docs/specs/cli-command-surface.md` | Owns command names, options, JSON support, and migration-compatible fields. |
| Shared contract pure functions | `docs/design/contract-single-source.md`, `packages/doc-task-contract-core/` | Shared package is the implementation target for side-effect-free contract logic. |
| VS Code UI behavior | `docs/design/vscode-ui-logic.md`, `docs/ui/*.md` | UI docs must not override CLI JSON contracts or execution contracts. |
| Recovery and state | `docs/specs/recovery-loop.md`, `docs/specs/doc-task-state-machine.md` | Must defer to `run-task` for completion and unclosed-execution semantics. |

## Capability Traceability Matrix

| Capability | Status | Authoritative Docs | Implementation Entry Points | Verification Entry Points | Gap / Follow-up |
|------------|--------|--------------------|-----------------------------|---------------------------|-----------------|
| Agent Runtime Catalog | Target Design | `docs/design/agent-execution-system.md`, `docs/specs/tools-security-management.md` | `src/commands/agent-cli-adapter.ts`, future registry module | `src/commands/agent-cli-adapter.test.ts`, future catalog tests | Dynamic registry and LLM-safe derived catalog still need implementation. |
| VectaHub Capability Catalog | Target Design | `docs/design/agent-execution-system.md`, `docs/specs/tools-security-management.md`, `docs/specs/cli-command-surface.md` | future `src/nl/context/*` or equivalent | future NL context tests | No current central catalog for VectaHub commands. |
| LLM Context Pack | Target Design | `docs/specs/run-task-execution-contract.md`, `docs/specs/agent-worker-contract.md`, `docs/design/agent-cli-adapter-architecture.md` | future `src/nl/context/*`, `src/nl/llm.ts`, `src/nl/core/pipeline.ts`, `src/commands/run-task.ts` | future redaction/relevance tests | LLM calls do not yet consistently receive registered Agent and VectaHub capability summaries. |
| Registry-backed renderer | Migration Contract | `docs/design/agent-execution-system.md`, `docs/specs/run-task-execution-contract.md` | `src/commands/agent-cli-adapter.ts`, `src/commands/run-task.ts` | `src/commands/agent-cli-adapter.test.ts`, `src/commands/run-task.test.ts` | Current implementation still exposes adapter terminology; target is generic renderer driven by registry data. |
| Mediated interactive Agent execution | Target Design | `docs/design/agent-execution-system.md`, `docs/specs/tools-security-management.md` | future PTY runner and approval broker modules | future mediated execution tests | Not yet implemented as a general runtime mode. |
| `tools agents --json` runtime state | Migration Contract | `docs/specs/tools-security-management.md`, `docs/specs/cli-command-surface.md` | `src/commands/tools.ts`, `src/setup/cli-scanner.ts` | `src/commands/tools.test.ts` | Target fields such as `executionMode`, `capabilities`, `constraints`, and `llmSummary` need code support. |
| AgentTaskContract prompt boundary | Current Implementation / Migration Contract | `docs/specs/agent-worker-contract.md` | `src/commands/agent-task-contract.ts`, `src/commands/run-task.ts`, `packages/doc-task-contract-core/` | `src/commands/agent-task-contract.test.ts`, `src/commands/run-task.test.ts`, package tests | Prompt builder still needs full LLM Context Pack integration. |
| `run-task` completion and recovery semantics | Current Implementation / Migration Contract | `docs/specs/run-task-execution-contract.md` | `src/commands/run-task.ts`, `src/commands/recover-task.ts` | `src/commands/run-task.test.ts`, `src/commands/run-task.trace-closeout.test.ts` | Target Agent runtime mode naming still needs code-level migration. |
| CLI / plugin shared contract logic | Current Implementation / Migration Contract | `docs/design/contract-single-source.md`, `docs/specs/agent-worker-contract.md` | `packages/doc-task-contract-core/`, `packages/vectahub-vscode-extension/src/project/docTaskContract.ts` | package tests and VS Code extension tests | Continue reducing duplicate derivation between plugin and CLI. |

## Maintenance Rules

- Add a row before documenting a new cross-module capability as implemented.
- Mark target-only behavior as `Target Design` until code and tests exist.
- Keep migration fields visible, but label them as migration compatibility instead of primary contracts.
- Do not paste long design explanations into this file; link to the authoritative spec.
- If a row has no implementation entry point, it must not be described elsewhere as current behavior.
