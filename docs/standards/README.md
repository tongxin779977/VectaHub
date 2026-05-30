# VectaHub Standards

> Document Status: Current Implementation / Migration Contract
> Authority: Reusable engineering standards for assessment, intelligent behavior, documentation governance, and verification gates.
> Last Verified: 2026-05-29

This directory contains standards that apply across modules. It is not a place for one-off evaluation reports, historical audits, or feature-specific field contracts.

## Standards Index

| Standard | Purpose |
|----------|---------|
| [Quality scoring](./quality-scoring.md) | Reusable, evidence-based scoring model for modules and cross-module capabilities. |
| [Intelligent systems](./intelligent-systems.md) | Shared model for deterministic rules, LLM reasoning, feedback learning, and auditable verification. |
| [Semantic acceptance](./semantic-acceptance.md) | Semantic acceptance standard for NL, CLI replies, workflow drafts, agent delegation, and document tasks. |
| [Documentation governance](./documentation-governance.md) | Document status, authority, migration, deletion, and link hygiene rules. |
| [Verification gates](./verification-gates.md) | Required build, type, lint, test, semantic, and extension validation gates. |
| [Development checklists](./development-checklists.md) | Actionable checklists for quality gate fixes, import-time side effects, logger usage, NL pipeline, and final merge verification. |

## Relationship To Other Docs

| Area | Responsibility |
|------|----------------|
| `docs/contracts/` | Authoritative field-level contracts, state machines, protocols, storage, trace, recovery, and security loops. |
| `docs/design/` | Target designs, migration designs, and architecture rationale. |
| `docs/ui/` | VS Code and UI interaction workflows. |
| Root `docs/*.md` | Reader entry points, usage, architecture overview, capability map, development, testing, release, and troubleshooting. |

## Report Policy

Reusable standards belong here. Evaluation reports do not.

If a review produces findings, keep them in the relevant issue, PR, task report, or backlog. Migrate only reusable scoring rules, validation gates, or governance rules into this directory.
