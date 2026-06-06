# Documentation Governance Standard

> Document Status: Current Implementation / Migration Contract
> Authority: Documentation structure, status, authority, migration, and deletion policy.
> Last Verified: 2026-05-29

Documentation must describe the current system truthfully, keep contracts authoritative, and keep target designs separate from implemented behavior.

## Directory Responsibilities

| Location | Responsibility |
|----------|----------------|
| `docs/standards/` | Reusable standards for scoring, intelligent systems, documentation governance, and verification gates. |
| `docs/contracts/` | Field-level contracts, protocol specs, state machines, storage, trace, recovery, security, lifecycle, and performance budgets. |
| `docs/design/` | Architecture rationale, target designs, migration plans, and enhancement designs. |
| `docs/ui/` | VS Code and UI workflow documentation. |
| Root `docs/*.md` | Primary navigation, user guides, architecture overview, capability map, development, testing, release, and troubleshooting. |

## Status Header

Every contract, standard, and design document should start with:

```markdown
> Document Status: Current Implementation / Target Design / Migration Contract
> Authority: ...
> Last Verified: YYYY-MM-DD
```

Use multiple status labels when necessary, but keep them explicit.

| Status | Use For |
|--------|---------|
| Current Implementation | Verified behavior that exists in source and has a validation path. |
| Partial Implementation | Behavior exists but is incomplete, partially covered, or environment-dependent. |
| Target Design | Planned behavior or architecture direction that is not yet implemented. |
| Migration Contract | Required transition behavior during a move from old to new architecture. |
| Historical Reference | Rare retained context that must not be treated as current behavior. |

## Authority Rules

- Contracts own field names, states, protocols, storage paths, failure kinds, and command semantics.
- Standards own reusable scoring, governance, verification, and intelligent-system rules.
- Design docs own rationale and migration approach, not final field-level behavior.
- Root docs summarize and link. They should not duplicate detailed contracts.
- UI docs describe interaction behavior and must link back to contracts for persisted state, command output, and failure classification.

## Current Vs Target Language

Use direct status markers:

| Claim Type | Required Language |
|------------|-------------------|
| Implemented and verified | "Current implementation..." with source and verification references. |
| Partially implemented | "Partial implementation..." with the missing boundary stated. |
| Planned | "Target design..." or "Planned..." and no user-facing availability claim. |
| Migration requirement | "Migration contract..." with old behavior, new behavior, and cutover rule. |
| Unknown | State the uncertainty and do not describe it as available. |

## Migration And Deletion Rules

- Migrate reusable standards into `docs/standards/`.
- Migrate authoritative field-level specs into `docs/contracts/`.
- Keep design documents when they explain architecture, target shape, or migration rationale.
- Delete evaluation reports and templates after reusable scoring content is extracted.
- Do not keep archive directories unless the user explicitly asks for historical storage.
- Do not leave alias directories after a migration unless they are needed by code or published links.

## Link Hygiene

After moving documents:

- Rewrite all relative links.
- Scan for stale directory names and retired report or template paths.
- Confirm every referenced contract file exists.
- Check markdown fences in modified files.
- Avoid linking to missing target design placeholders from user-facing docs.

## Traceability Rule

Cross-module capabilities must appear in [Implementation Traceability](../contracts/implementation-traceability.md) before being described as current behavior in capability, architecture, usage, or UI docs.

If a capability has no source entry point or no verification path, document it as `Target Design` or `Migration Contract`.
