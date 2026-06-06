# Intelligent Systems Standard

> Document Status: Target Design / Migration Contract
> Authority: Shared intelligent-behavior standard for NL, workflow, security, recovery, tooling, skill, audit, and extension-facing automation.
> Last Verified: 2026-05-29

VectaHub should not solve every semantic problem with hardcoded rules, and it should not let LLM output bypass deterministic contracts. The standard model is a hybrid system: fast deterministic paths, LLM reasoning where it adds value, feedback learning, and auditable verification.

## Target Model

```text
contract input
  -> rule fast path
  -> LLM planner / selector / diagnoser / summarizer
  -> schema + policy + sandbox validation
  -> execution or user confirmation
  -> trace + audit + feedback record
  -> eval set / rule / prompt / cache update
```

## Non-Negotiable Boundaries

- Types, schemas, persisted records, state machines, safety policy, permission prompts, and audit writes are deterministic contracts.
- LLMs may generate candidates, explanations, diagnoses, rankings, and summaries.
- LLMs must not be the only authority for command safety, permission decisions, contract validity, or persisted state transitions.
- Learning must be explicit and inspectable. Runtime behavior must not silently change because a model guessed a new policy.
- Every intelligent path needs an eval set, a regression test path, and traceable failure records.

## Module Application

| Module | Rule Fast Path | LLM Role | Feedback Source | Verification |
|--------|----------------|----------|-----------------|--------------|
| NL | Known commands, direct workflow references, explicit CLI syntax | Intent parsing, tool selection, parameter extraction, ambiguity handling | User corrections, semantic E2E failures, tool-call outcomes | Schema validation, command contract, semantic E2E |
| Workflow | Known step types, schema validation, dependency graph checks | Step planning, repair suggestions, execution diagnosis | Failed steps, retries, user edits, recovery results | Workflow schema, executor tests, lifecycle contracts |
| Security | Static deny/allow rules, path and command risk checks, permission policy | Risk explanation, safer alternatives, suspicious-pattern clustering | User confirmations, blocked commands, audit findings | Security rules, redaction tests, fail-closed checks |
| Recovery | Known failure kinds, instruction hash, run records, trace links | Recovery plan ranking, root-cause summary, next-action suggestion | Verification failures, recovery outcomes, repeated failure clusters | Recovery contract, trace link, verification replay |
| Tooling | Registered tools, capability metadata, installed/invocable checks | Tool selection, argument synthesis, tool fallback suggestions | Tool execution results, unavailable tool records | Tool registry contract, command risk checks |
| Skill | Registered skill metadata, version and sandbox policy | Skill selection, missing-skill suggestion, task-to-skill routing | Skill run results, user acceptance, test failures | Skill contract, sandbox, focused tests |
| Audit | Deterministic event schema, redaction, retention policy | Event summarization, anomaly grouping, incident summary | Audit review findings, policy updates | Audit schema, sensitive-data scans |
| Extension UI | Stable CLI JSON, known task states, prompt contracts | Explanation text, recovery suggestion summaries | User actions, prompt confirmations, task outcomes | Extension smoke checks, CLI JSON contract |

## Custom Rule, Skill, And MCP Adoption

Custom rules, skills, and MCP-style integrations are useful only when they are registered, governed, and verified as first-class capabilities.

| Capability | Use When | Do Not Use When | Required Before Claiming Support |
|------------|----------|-----------------|----------------------------------|
| Custom rule | A deterministic safety, routing, or validation decision repeats across commands. | The decision depends on broad semantic judgment or requires model ranking. | Rule schema, owner, tests, audit output, import/export behavior. |
| Skill | A repeatable task needs instructions, tools, fixtures, or domain-specific workflow. | It is a one-off prompt or can be solved by a simple command wrapper. | Skill metadata, discovery path, execution boundary, sandbox rules, versioning, tests. |
| MCP integration | External tools or services need structured tool discovery and invocation. | A local CLI command or internal API already satisfies the workflow. | Registry contract, permission model, tool schema validation, failure handling, audit and trace integration. |

For this project, custom rules and skills should be introduced only after the registry, execution boundary, audit trail, and verification loop are explicit. MCP should remain a target capability until the project has a stable registry, permission loop, and tool-call verification contract.

## Feedback Learning Contract

Feedback records must contain:

| Field | Purpose |
|-------|---------|
| `feedbackId` | Stable identifier for replay and deduplication. |
| `source` | User correction, command result, test failure, audit review, or recovery result. |
| `capability` | NL, workflow, security, recovery, tooling, skill, audit, or UI. |
| `inputHash` | Redacted hash of the input that produced the decision. |
| `decision` | Rule, prompt, tool, or recovery action selected. |
| `outcome` | Success, rejected, failed validation, failed execution, or needs review. |
| `evidence` | Links to trace, audit event, test output, or run record. |
| `appliedTo` | Prompt, eval, rule, cache, or backlog item updated from the feedback. |

Feedback must not store secrets, full environment variables, unredacted stdout, or private user content unless a contract explicitly allows it.

## Evaluation Requirements

Each intelligent capability needs:

- Positive examples for common user workflows.
- Negative examples for unsafe, ambiguous, unsupported, or malformed inputs.
- Regression examples for previous failures.
- Offline fallback tests.
- Trace/audit assertions for model-assisted decisions.
- A documented owner for prompt, rule, eval, and feedback updates.
