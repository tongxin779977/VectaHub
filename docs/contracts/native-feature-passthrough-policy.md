# Native Feature Passthrough Policy

> Document Status: Current Implementation / Migration Contract
> Authority: Policy for exposing native VectaHub capabilities through custom rules, custom skills, MCP-style tools, and other third-party capability surfaces.
> Last Verified: 2026-06-08

## Purpose

This document defines when native VectaHub features may be exposed through non-native capability surfaces, and what safety, confirmation, trace, audit, and verification requirements apply.

This is a policy contract. It does not itself enable custom rules, custom skills, or MCP runtime support.

## Scope

This policy applies when a capability surface outside the built-in CLI command surface attempts to invoke or represent:

- VectaHub workflow execution
- command execution
- task delegation
- security evaluation
- trace and audit access
- verification and recovery flows

It applies to:

- custom rules
- custom skills
- MCP-style tools
- future plugin or extension surfaces that proxy native behavior

## Policy Goals

- Preserve the built-in command surface as the execution truth source.
- Prevent third-party capability surfaces from silently bypassing safety or confirmation.
- Keep trace, audit, verification, and recovery links intact across passthrough boundaries.
- Separate current supported passthrough from deferred ecosystem plans.

## Passthrough Categories

Each native feature must be classified into exactly one category before it can be exposed through an external capability surface.

| Category | Meaning | Allowed Today |
|----------|---------|---------------|
| `allowed` | May be exposed through a third-party surface with existing contracts and no new approval semantics. | Limited |
| `confirm-required` | May be exposed, but only if the third-party surface preserves native confirmation and blocking semantics. | Limited |
| `deferred` | Not available for passthrough until missing contracts or safeguards are implemented. | Yes |
| `forbidden` | Must not be exposed through passthrough because doing so would bypass execution truth, security, or governance boundaries. | Yes |

## Category Matrix

| Native capability | Category | Rationale |
|-------------------|----------|-----------|
| Read-only diagnostic surfaces such as `doctor`, `history`, `trace list`, `trace show` | `allowed` | These are read-oriented capabilities with existing CLI contracts, provided the surface preserves machine-output boundaries and redaction. |
| Read-only catalog discovery such as `tools agents --json` | `allowed` | This is already a machine-facing registry surface and does not itself execute user side effects. |
| Plan proposal and workflow draft generation without execution | `confirm-required` | These may be exposed only if the external surface makes it explicit that no execution occurs and preserves the proposal/confirmation boundary. |
| Workflow execution, `run-command`, task delegation, recovery actions, archive mutations, import/export with write side effects | `confirm-required` | These are side-effecting operations and must preserve safety review, approval, trace, audit, and verification requirements. |
| Custom rule execution with arbitrary script logic | `deferred` | Script sandboxing, rule schema, verification, and audit contracts are not complete. |
| Custom skill execution with dynamic dependency or tool resolution | `deferred` | Skill contract, discovery, verification, and trace integration are not complete. |
| MCP-style external tool execution | `deferred` | Permission mapping, tool schema validation, sandbox, and failure/recovery contracts are not complete. |
| Any passthrough that directly fabricates final argv for registered native execution paths | `forbidden` | Native execution truth must remain in the CLI registry, renderer, and command-surface contracts. |
| Any passthrough that suppresses native blocking, approval, or audit behavior | `forbidden` | Passthrough must not weaken built-in safety semantics. |

## Requirements By Category

### `allowed`

The capability surface must:

- call an existing native machine interface or CLI contract
- preserve stdout JSON isolation where required
- preserve redaction behavior
- avoid inventing new side effects
- link the action to trace or audit context when available

### `confirm-required`

The capability surface must:

- preserve native confirmation and blocking semantics
- surface the same risk classification as the built-in entrypoint
- preserve trace and audit linkage to the final execution
- preserve verification requirements when the action mutates user state
- fail closed when the native contract cannot be preserved

### `deferred`

The capability surface must not expose the feature as available until:

- the relevant schema contract exists
- the permission and confirmation model is explicit
- the verification contract exists
- trace and audit linkage is defined
- failure and recovery behavior is defined

### `forbidden`

A capability is forbidden for passthrough when it would:

- bypass the CLI command registry as the execution truth source
- bypass security or confirmation
- bypass trace or audit expectations
- require hidden mutation of user provider, auth, model, or runtime configuration

## Safety And Permission Requirements

Any passthrough category other than `deferred` or `forbidden` must map to existing VectaHub security semantics:

- reuse existing security and permission contracts
- preserve `blocked` and `confirm_required` outcomes
- never silently downgrade `critical` or `high` classifications
- never convert a blocked native action into an allowed passthrough action

When the external capability surface has its own permission model, that model is additive only. It cannot replace native VectaHub permission checks.

## Trace, Audit, And Verification Requirements

If a passthrough surface reaches a native feature that can mutate state or trigger execution, it must:

- keep trace identity linkable to the final native action
- preserve audit logging requirements
- preserve verification requirements for mutation-producing flows
- preserve recovery references when the final native action participates in recovery loops

Read-only passthrough surfaces may omit verification, but they must still respect redaction and trace visibility rules.

## Built-In Versus Third-Party Boundary

Built-in CLI commands remain the only execution truth source for native VectaHub features.

Third-party capability surfaces may:

- select native capabilities
- preview native capabilities
- forward user intent into native capabilities

Third-party capability surfaces must not:

- redefine native safety classes
- fabricate unsupported native commands
- introduce alternate execution truth for registered native paths
- silently change provider, auth, model, or runtime config behavior

## Current Project Decision

For the current NL Workflow Orchestrator phase:

- read-only catalog and diagnostic passthrough is acceptable when it uses existing machine interfaces
- side-effecting passthrough must preserve native confirmation and blocking semantics
- custom rules, custom skills, and MCP execution remain deferred

This keeps the current product focused on the built-in orchestrator path while allowing limited machine-consumable native surfaces.

## Related Contracts

- [CLI command surface](./cli-command-surface.md)
- [Security permission loop](./security-permission-loop.md)
- [Tools security management](./tools-security-management.md)
- [Trace execution](./trace-execution.md)
- [Verification loop](./verification-loop.md)
- [Recovery loop](./recovery-loop.md)

