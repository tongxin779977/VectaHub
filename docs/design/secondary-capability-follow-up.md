# Secondary Capability Follow-Up

> Document Status: Current Design / Product Decision
> Authority: Follow-up decision record for capabilities assessed in `secondary-capability-assessment.md`.
> Last Verified: 2026-06-08

## Purpose

This document closes the follow-up loop requested by the secondary capability assessment. It records the current decision for each secondary capability and defines the next required action.

It does not delete code or hide commands by itself. It establishes the decision baseline maintainers should follow.

## Decision Baseline

The main product path remains:

```text
NL input
-> plan
-> workflow draft
-> safety review
-> execution
-> verification
-> trace / recovery
```

Capabilities that do not directly strengthen this path stay secondary unless there is clear evidence of user-facing or integration-critical dependency.

## Capability Decisions

| Capability | Current decision | Product position | Required next step |
|------------|------------------|------------------|--------------------|
| `chat` | `keep` | Main product entry | Continue sharing plan / safety / workflow draft contracts with `run`. |
| `serve` / `client` | `keep-secondary` | Secondary | Document consumer dependency before any promotion. |
| `daemon` | `keep-secondary` | Secondary | Treat as paired with `serve` until dependency evidence changes. |
| `src/api/` | `keep-secondary` | Secondary | Document API contract if external integration becomes first-class. |
| `monitor` | `keep-secondary` | Secondary | Keep out of primary user path; fill monitoring contract before promotion. |
| `debug` | `keep-secondary` | Secondary | Keep out of primary user path; fill debugger contract before promotion. |
| `generate` | `keep-secondary` | Secondary | Revisit after NL plan path is hardened. |
| `schedule` | `keep-secondary` | Secondary | Revisit only with stronger persistence and background-runtime contracts. |
| `templates` | `keep-secondary` | Secondary | Revisit after NL workflow generation path is stable. |
| `provider` | `keep-secondary` | Secondary | Revisit after runtime catalog, permission, trace, and verification are more complete. |

## Promotion Criteria

A secondary capability may move back to the main product path only when:

- it directly serves the main NL orchestrator chain
- or it is required by a stable external integration
- and it has an explicit contract, verification path, and trace/safety story

If these conditions are not met, the capability remains secondary even if it is implemented.

## Removal Criteria

A secondary capability may be removed from product-facing surfaces only when:

- there is no known external consumer dependency
- docs and tests no longer rely on it as a current capability
- CLI help and onboarding paths can be updated without breaking current user workflows

This document does not authorize immediate removal. It defines the standard for future removal decisions.

## Product Documentation Guidance

For the current repository state:

- `chat` may continue to appear in core product descriptions
- `serve`, `daemon`, `api`, `monitor`, `debug`, `generate`, `schedule`, `templates`, and `provider` should be described as secondary or maintenance-direction capabilities
- none of the secondary capabilities should be described as central to the current NL Workflow Orchestrator product identity

## Follow-Up Actions

1. Keep `chat` aligned with the main orchestrator contracts.
2. Treat the remaining nine capabilities as retained but secondary.
3. Fill missing per-capability contracts before any promotion.
4. Revisit promotion only after main-path stability and integration evidence exist.

## Evidence Basis

These decisions are based on:

- [Secondary capability assessment](./secondary-capability-assessment.md)
- [Module scope cleanup](./module-scope-cleanup.md)
- [CLI command surface](../contracts/cli-command-surface.md)
- current repository implementation and test state as of 2026-06-08

