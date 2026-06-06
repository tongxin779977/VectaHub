# Run Task Type Router

## Problem

`run` is the natural-language entrypoint, but the current flow still treats most successful intent recognition as an executable workflow. This makes task routing too rigid: a document-edit request can be reduced to an unrelated legacy intent and then executed as a shell workflow.

The immediate failure mode is that an LLM or template can produce `vectahub ci diagnose` even though the CLI has no registered `ci` command. The entrypoint should catch that before workflow creation.

## Goals

- Treat `run` as a task dispatcher, not only a workflow executor.
- Classify user input into task types before direct execution.
- Block generated commands that do not match the current CLI command surface.
- Route document and Agent tasks toward task contracts instead of brittle shell steps.
- Keep the first implementation small and compatible with existing workflow execution.

## Non-Goals

- This phase does not implement the full document-edit Agent system.
- This phase does not replace `run-task`.
- This phase does not remove existing capability routing or LLM tool calling.
- This phase does not add new external dependencies.

## Proposal

Introduce a deterministic dispatch contract between `orchestrateIntent` and workflow creation.

```text
user input
  -> orchestrateIntent
  -> run dispatch contract
  -> direct workflow execution | document task handoff | Agent task handoff | dialog | blocked
```

Initial dispatch kinds:

```text
direct-command
workflow
agent-task
doc-task-edit
dialog
clarify
blocked
```

The dispatcher must return:

- `kind`: the selected task type.
- `executable`: whether `run` may create and execute a workflow immediately.
- `reason`: the objective routing reason.
- `suggestedAction`: optional user-facing next step.
- `blockedStep`: optional generated command that was rejected.

Document-task examples such as appending tasks to `docs/**/*.md` should be classified as `doc-task-edit` and should not be executed as a generic workflow. Until the document task system is implemented, `run` should print a clear dispatch summary and stop.

Generated VectaHub commands must be validated against the registered command surface before execution. If a generated step references an unavailable subcommand, the dispatcher must return `blocked`.

## Tradeoffs

This is a stopgap layer, not the final LLM-first router. It intentionally keeps the existing orchestrator and workflow engine intact while preventing the most harmful misroutes.

The next phase should move LLM output from direct workflow steps to structured `TaskCandidate` contracts. The system should then deterministically render Agent CLI calls, workflow execution, or manual review from those contracts.

## Test Plan

- A document task edit input must not create or execute a workflow.
- A generated `vectahub ci diagnose` step must be blocked because `ci` is not registered.
- Existing direct command dry-run behavior must continue to skip workflow execution.
- Existing natural-language execution for valid generated steps must still create an ephemeral workflow.
