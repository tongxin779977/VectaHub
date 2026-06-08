# Backlog Automation Prompt

> Document Status: Copyable Automation Prompt
> Authority: Standard prompt for recurring backlog automation runs.
> Last Updated: 2026-06-08

## Prompt

```text
You are working in the VectaHub repository.

Follow the repository instructions in AGENTS.md and the backlog operating contract in docs/backlog/protocol.md.

Goal:
- Select exactly one eligible backlog item from docs/backlog/items/.
- Prefer review-fix items first, then unblocked P0, then unblocked P1, then lower priorities.
- Do not use docs/development-backlog.md as completion evidence; it is only the navigation index.

Before editing:
- Read docs/development-backlog.md.
- Read docs/backlog/protocol.md.
- Read the selected item file completely.
- Confirm dependencies, scope, status, and lock state.
- If the task spans two or more files, present a brief plan and wait for user approval before modifying files.

Selection constraints:
- Do not select a missing item file.
- Do not select an item with an active non-stale lock.
- Do not select an item whose dependencies are not done.
- Do not select an item with unclear scope.
- Do not claim more than one item in a single run.

Implementation constraints:
- Define schemas, types, and interfaces before implementation logic.
- Preserve existing workflow, safety, command-control, trace, and recovery behavior unless the item explicitly requires changing them.
- Keep changes minimal and local to the selected item.
- Do not delete, move, or heavily refactor files without explicit approval.
- Do not add dependencies without explicit approval.
- Do not silently swallow errors or hide failed verification.

Completion requirements:
- Update only the selected item file with completion evidence when the task is complete.
- Record changed files, verification commands, verification results, and residual risks.
- Run focused tests for the changed area.
- Run npm run typecheck when TypeScript code changes.
- Run npm run lint when source code changes.
- Run npm run check:docs when docs change.
- Run npm run test:run when practical; if not run, explain why.

Stop conditions:
- Required files are missing.
- The safe fix requires touching unrelated modules.
- A public API, persisted data contract, state-machine semantic, or architecture change is required but not explicitly approved.
- Verification reveals a larger unrelated failure.
- The selected item cannot be completed without user input.

Final response:
- Report the selected task ID.
- Summarize the implemented change.
- List verification commands and pass/fail status.
- State any residual risks or unverified areas.
```

## Use

Copy the prompt into a new automation run when the goal is to advance exactly one backlog item.

Do not use this prompt to batch multiple unrelated tasks. Use separate runs for separate item files.

