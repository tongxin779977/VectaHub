# run-task Kernel Hardening Tasks

## Task RTK-001

taskId: RTK-001

taskLabel: Add characterization tests for current Agent process completion behavior.

allowedFiles:
- src/commands/run-task.test.ts
- src/commands/run-task.trace-closeout.test.ts

forbiddenFiles:
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Add tests that capture current successful Agent process behavior.
- Add tests for non-zero Agent exit preserving stdout and stderr.
- Add tests for timeout preserving captured stdout and stderr.
- Add tests for completionSignal behavior where currently observable.
- Do not refactor implementation in this task.
- Do not modify production source code in this task.

validationCommands:
- npm run typecheck
- npm run lint
- npx vitest run src/commands/run-task.test.ts src/commands/run-task.trace-closeout.test.ts

riskNotes:
- This task must lock existing behavior before refactor.
- Avoid timing-sensitive tests unless unavoidable.
- If the contract preview includes forbidden files in allowedFiles, stop and do not execute.

## Task RTK-001A

taskId: RTK-001A

taskLabel: Add one minimal characterization test for successful Codex close completion.

allowedFiles:
- src/commands/run-task.test.ts

forbiddenFiles:
- src/commands/run-task.trace-closeout.test.ts
- src/commands/run-task.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Add exactly one focused test for successful Codex Agent process completion on close.
- Assert stdout and stderr are preserved in the runTask result.
- Assert completionSignal is close when the mocked Codex process emits close.
- Do not add timeout, idle, no-close, or failure-path tests in this task.
- Do not refactor implementation in this task.
- Do not modify production source code in this task.

validationCommands:
- npx vitest run src/commands/run-task.test.ts
- npm run typecheck

riskNotes:
- This is a deliberately tiny task to verify Agent CLI execution reliability.
- If a similar test already exists, add only a small missing assertion to that existing test.
- Stop if any file outside allowedFiles would need changes.

## Task RTK-002

taskId: RTK-002

taskLabel: Define Agent process runner contracts before implementation extraction.

allowedFiles:
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts

forbiddenFiles:
- src/commands/run-task.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Create AgentProcessRunRequest.
- Create AgentProcessRunResult.
- Create AgentProcessFailure.
- Create AgentProcessRunnerDeps.
- Do not wire the runner into runTask() yet.

validationCommands:
- npm run typecheck
- npm run lint
- npx vitest run src/commands/run-task-agent-runner.test.ts

riskNotes:
- This task should introduce contracts only.
- No behavior change is allowed.
