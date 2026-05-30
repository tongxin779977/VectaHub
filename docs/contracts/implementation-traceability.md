# Implementation Traceability Contract

> Document Status: Current Implementation / Migration Contract
> Authority: Cross-document traceability index. Field-level behavior remains owned by the linked contract documents and current source code.
> Last Verified: 2026-05-29

This document prevents target designs from being described as current behavior without implementation and verification evidence.

Use it before updating `docs/capabilities*.md`, `docs/architecture.md`, `docs/usage.md`, `docs/workflow-spec.md`, or any design document that crosses CLI, workflow, security, trace, recovery, tooling, skill, or Agent execution boundaries.

## Status Model

| Status | Meaning |
|--------|---------|
| Current Implementation | The behavior has a source entry point and a verification path. |
| Partial Implementation | A source entry point exists, but coverage, contract closure, or UI/runtime integration is incomplete. |
| Migration Contract | The target contract is defined, but implementation is still being migrated. |
| Target Design | The behavior is planned or designed and must not be documented as available. |
| Unsupported | The behavior is intentionally absent or blocked by missing prerequisites. |

## Traceability Matrix

| Capability | Authority | Current Implementation | Verification | Known Gaps | Status |
|------------|-----------|------------------------|--------------|------------|--------|
| CLI command surface | [CLI command surface](./cli-command-surface.md) | `src/cli.ts`, `src/commands/` | `npm run dev -- <command> --json`, focused command tests | Every command change must keep JSON, audit, trace, and side-effect notes synchronized. | Current Implementation |
| Run-task execution | [Run-task execution contract](./run-task-execution-contract.md) | `src/commands/run-task.ts`, Agent CLI invocation path | Contract preview, dry-run, real run-task command checks | Completion closure, failure classification, and recovery links need continued hardening. | Partial Implementation |
| Agent worker task contract | [Agent worker contract](./agent-worker-contract.md) | Shared task contract builders and run-task command inputs | Contract preview output and Agent task regression tests | Runtime adapters must continue converging on the shared contract rather than local copies. | Partial Implementation |
| LLM Context Pack | [Run-task execution contract](./run-task-execution-contract.md) | Context-pack target is described for Agent and LLM execution flows | Requires schema checks and focused regression tests before claiming availability | Not stable across all `run-task`, chat, NL fallback, and onboarding flows. | Migration Contract |
| Document task state machine | [Doc task state machine](./doc-task-state-machine.md) | Task run records and status handling in document-task execution paths | Task state transition tests and run record inspection | Extension display states may remain coarser than persisted state. | Partial Implementation |
| Trace execution | [Trace execution contract](./trace-execution.md) | Trace commands and trace propagation paths | `trace list`, `trace show`, run-task trace assertions | Trace writes must stay separate from JSON stdout and must avoid sensitive payloads. | Partial Implementation |
| Recovery loop | [Recovery loop](./recovery-loop.md) | `recover-task` command and task recovery decision paths | Recovery command checks with real or synthetic run records | Recovery quality depends on stable failure classification, trace links, and instruction hashing. | Partial Implementation |
| Verification loop | [Verification loop](./verification-loop.md) | Validation command collection and execution result recording | Run-task verification checks and focused regression tests | Agent success must never be treated as task success without verification closure. | Partial Implementation |
| Security and permission loop | [Security permission loop](./security-permission-loop.md) | Command risk assessment, confirmation prompts, audit/security rule paths | Security rule tests, command-risk checks, audit output checks | LLM-generated commands and recovery actions must remain fail-closed. | Current Implementation |
| Tools and security management | [Tools security management](./tools-security-management.md) | Tool registry, security rule commands, import/export support | `tools`, `security`, import/export command checks | Agent readiness is not the same as a guaranteed successful execution. | Current Implementation |
| Workflow lifecycle | [Workflow lifecycle](./workflow-lifecycle.md) | Workflow engine, executor, history, and lifecycle command paths | Workflow tests and lifecycle command checks | Extension-only or target step types must not be documented as default engine behavior. | Partial Implementation |
| Config and data storage | [Config data storage](./config-data-storage.md) | VectaHub home paths, config, records, outputs, trace storage | Storage path checks and command side-effect tests | Storage migrations must preserve existing local records. | Current Implementation |
| Templates and scheduling | No current mainline contract | Template and generation command paths where implemented | Template generation tests and command checks | Secondary product direction; must not be described as current NL Workflow Orchestrator mainline capability. | Unsupported |
| Service import/export | No current mainline contract | Local service, daemon, and import/export command paths where implemented | Service command smoke checks and data migration checks | Secondary product direction; daemon/service capabilities require explicit runtime verification before returning to mainline docs. | Unsupported |
| Performance budget | [Performance budget](./performance-budget.md) | Performance constraints for doc task, trace, recovery, and workflow paths | Focused benchmark or resource regression checks | Budgets must be updated when new persistent records or large payloads are introduced. | Migration Contract |
| VS Code and UI workflows | [UI documentation](../ui/) | Extension/UI documents describe expected workflows | Extension smoke checks when extension code or UI contracts change | UI docs must distinguish current extension behavior from target interaction design. | Partial Implementation |

## Update Rules

- Add a row before documenting a cross-module capability as current behavior.
- Link the row to the contract that owns the field-level behavior.
- Keep `Current Implementation` claims tied to both a source entry point and a verification path.
- Use `Target Design` or `Migration Contract` when either source evidence or verification evidence is missing.
- Do not use this document to duplicate full field definitions; update the owning contract instead.
