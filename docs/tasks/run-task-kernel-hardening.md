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

## Task RTK-002A

taskId: RTK-002A

taskLabel: Create Agent process runner contract type file only.

allowedFiles:
- src/commands/run-task-agent-runner.ts

forbiddenFiles:
- src/commands/run-task-agent-runner.test.ts
- src/commands/run-task.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Create src/commands/run-task-agent-runner.ts only.
- Export AgentProcessRunRequest.
- Export AgentProcessRunResult.
- Export AgentProcessFailure.
- Export AgentProcessRunnerDeps.
- Use minimal placeholder fields only when required by TypeScript.
- Do not implement runtime logic.
- Do not create tests in this task.
- Do not read unrelated files.

validationCommands:
- npm run typecheck

riskNotes:
- This task verifies file creation and contract scaffolding only.
- Stop if any file outside allowedFiles would need changes.

## Task RTK-002B

taskId: RTK-002B

taskLabel: Add minimal fields to Agent process runner contract types.

allowedFiles:
- src/commands/run-task-agent-runner.ts

forbiddenFiles:
- src/commands/run-task-agent-runner.test.ts
- src/commands/run-task.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Update AgentProcessRunRequest with command, args, cwd, env, timeoutMs, and optional stdinInput.
- Update AgentProcessRunResult with exitCode, signal, stdout, stderr, and completionSignal.
- Update AgentProcessFailure with code, message, stdout, stderr, and completionSignal.
- Update AgentProcessRunnerDeps with spawn and logger dependencies as minimal structural types.
- Keep all fields minimal and contract-focused.
- Do not implement process execution logic.
- Do not create tests in this task.
- Do not modify any file outside allowedFiles.

validationCommands:
- npm run typecheck

riskNotes:
- This task only strengthens type contracts.
- No runtime behavior change is allowed.
- Stop if a production integration change appears necessary.

## Task RTK-003A

taskId: RTK-003A

taskLabel: Define deterministic run-task review report contracts.

allowedFiles:
- src/commands/run-task-review.ts

forbiddenFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Create src/commands/run-task-review.ts only.
- Export RunTaskReviewStatus as PASS, NEEDS_REVIEW, and FAIL.
- Export RunTaskReviewFindingSeverity as info, warning, and error.
- Export RunTaskReviewFinding with severity, code, message, and optional evidence.
- Export RunTaskReviewInput with taskId, taskLabel, allowedFiles, forbiddenFiles, changedFiles, validationPassed, agentExecutionOutcome, and optional alreadySatisfied.
- Export RunTaskReviewReport with taskId, taskLabel, status, changedFiles, validationPassed, findings, and needsHumanReview.
- Do not implement review logic in this task.
- Do not wire the review contract into run-task in this task.
- Do not create tests in this task.

validationCommands:
- npm run typecheck

riskNotes:
- This task introduces review contracts only.
- No runtime behavior change is allowed.
- Keep field names stable and readable because later tasks will persist review reports.
- Stop if any production integration change appears necessary.

## Task RTK-003B

taskId: RTK-003B

taskLabel: Implement deterministic run-task review pure function.

allowedFiles:
- src/commands/run-task-review.ts
- src/commands/run-task-review.test.ts

forbiddenFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Implement createRunTaskReviewReport(input) as a pure deterministic function.
- Return FAIL when changedFiles includes any forbiddenFiles entry.
- Return FAIL when changedFiles includes a file outside allowedFiles.
- Return FAIL when validationPassed is false.
- Return FAIL when agentExecutionOutcome is planned-only.
- Return FAIL when changedFiles is empty and alreadySatisfied is not true.
- Return NEEDS_REVIEW when changedFiles is empty and alreadySatisfied is true.
- Return NEEDS_REVIEW when allowedFiles contains a directory-like or glob-like broad boundary.
- Return PASS only when boundaries are clean, validation passed, Agent outcome is implemented, and at least one allowed file changed.
- Add focused unit tests for PASS, forbidden file failure, out-of-scope file failure, validation failure, planned-only failure, no-diff failure, already-satisfied review, and broad-boundary review.
- Do not read git state in this task.
- Do not wire the review function into run-task in this task.

validationCommands:
- npx vitest run src/commands/run-task-review.test.ts
- npm run typecheck
- npm run lint

riskNotes:
- This task must stay deterministic and local.
- Do not call any Agent CLI or LLM reviewer.
- Do not use the Agent output text as the source of truth except for the explicit alreadySatisfied input flag.
- Stop if run-task integration appears necessary.

## Task RTK-003C

taskId: RTK-003C

taskLabel: Integrate deterministic review summary into run-task closeout output.

allowedFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts

forbiddenFiles:
- src/commands/run-task-review.ts
- src/commands/run-task-review.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Import the deterministic review function from src/commands/run-task-review.ts.
- Build RunTaskReviewInput from the existing task contract, changedFiles, validation result, Agent execution outcome, and already-satisfied detection.
- Run deterministic review before final run-task closeout output.
- Include a concise Chinese review summary in normal CLI output.
- Preserve --json behavior for machine-readable output.
- Do not add reviewer Agent support in this task.
- Do not add a new CLI command in this task.
- Add tests proving PASS, NEEDS_REVIEW, and FAIL summaries are surfaced to users.

validationCommands:
- npx vitest run src/commands/run-task.test.ts src/commands/run-task-review.test.ts
- npm run typecheck
- npm run lint

riskNotes:
- This task changes user-facing output, so keep wording concise and stable.
- Do not change Agent process execution behavior.
- Do not make review status rely on Agent self-reported claims alone.
- Stop if integrating the review requires changing CLI command registration.

## Task RTK-003D

taskId: RTK-003D

taskLabel: Add manual run-task review command for current diff.

allowedFiles:
- src/commands/run-task-review-command.ts
- src/commands/run-task-review-command.test.ts
- src/cli.ts
- src/cli-main.ts

forbiddenFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts
- src/commands/run-task-review.ts
- src/commands/run-task-review.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts
- docs/tasks/run-task-kernel-hardening.md

implementationSteps:
- Add a run-task-review command that accepts --task-id and --doc.
- Reuse the deterministic review function from src/commands/run-task-review.ts.
- Read the task contract from the provided document using the existing contract extraction path.
- Read current git changed files using the existing run-task git change collection pattern.
- Print a concise Chinese review summary by default.
- Support --json for machine-readable review output.
- Do not call any Agent CLI or LLM reviewer in this task.
- Add tests for readable output and JSON output.

validationCommands:
- npx vitest run src/commands/run-task-review-command.test.ts src/commands/run-task-review.test.ts
- npm run typecheck
- npm run lint

riskNotes:
- This task adds a new CLI surface and may require careful command registration review.
- Keep the command read-only.
- Do not modify task documents or source files as part of review execution.
- Stop if current diff collection cannot be reused without broad refactor.

## Task RTK-004A

taskId: RTK-004A

taskLabel: Document evidence-driven Agent no-close timeout policy.

allowedFiles:
- docs/tasks/run-task-kernel-hardening.md

forbiddenFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts
- src/commands/run-task-review.ts
- src/commands/run-task-review.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts

implementationSteps:
- Add a documented policy for evidence-driven Agent no-close timeout handling.
- Define base no-close timeout, extension interval, maximum extension count, and maximum wall-clock timeout.
- Define deterministic progress evidence for the first implementation phase.
- Define failure classification for no-close timeout without new task diff.
- Do not modify runtime code in this task.

validationCommands:
- npm run typecheck

riskNotes:
- This task documents planned behavior only.
- Do not describe the dynamic policy as implemented until RTK-004B is complete.

## Task RTK-004B

taskId: RTK-004B

taskLabel: Implement evidence-driven no-close timeout extension for Agent CLI execution.

allowedFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts

forbiddenFiles:
- docs/tasks/run-task-kernel-hardening.md
- src/commands/run-task-review.ts
- src/commands/run-task-review.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts

implementationSteps:
- Replace fixed no-close timeout handling with an evidence-driven no-close timeout checkpoint.
- Keep AGENT_NO_CLOSE_TIMEOUT_MS as the base checkpoint interval.
- Add AGENT_NO_CLOSE_EXTENSION_MS for each approved extension.
- Add AGENT_NO_CLOSE_MAX_EXTENSIONS to cap extension count.
- Add AGENT_MAX_WALL_CLOCK_MS to cap total Agent runtime.
- Treat increased captured stdout or stderr length since the previous no-close checkpoint as deterministic progress evidence in this phase.
- Extend no-close waiting only when progress evidence exists and extension limits are not exceeded.
- Kill the Agent and fail when no progress evidence exists at a no-close checkpoint.
- Kill the Agent and fail when the maximum wall-clock timeout is reached.
- Preserve idle timeout semantics.
- Add tests for no progress no-close failure, output progress extension, extension limit failure, and max wall-clock failure.

validationCommands:
- npx vitest run src/commands/run-task.test.ts
- npm run typecheck
- npm run lint

riskNotes:
- Do not use LLM judgment for progress detection.
- Do not let repeated time extension run indefinitely.
- Keep failure messages explicit enough to distinguish no progress, extension limit, and wall-clock timeout.

## Task RTK-005A

taskId: RTK-005A

taskLabel: Document evidence closeout policy for completed Agent work without process close.

allowedFiles:
- docs/tasks/run-task-kernel-hardening.md

forbiddenFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts
- src/commands/run-task-review.ts
- src/commands/run-task-review.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts

implementationSteps:
- Document the problem where an Agent completes file changes but the child process does not close.
- Define evidence-closeout as a process completion signal, not a task success signal.
- Define gitChanges relative to the pre-Agent baseline as the first deterministic closeout evidence.
- State that validationCommands and deterministic review must still run after evidence-closeout.
- Do not modify runtime code in this task.

validationCommands:
- npm run typecheck

riskNotes:
- Do not let Agent output alone decide task success.
- Do not mark evidence-closeout as implemented until RTK-005B is complete.

## Task RTK-005B

taskId: RTK-005B

taskLabel: Implement evidence closeout for completed Agent work without process close.

allowedFiles:
- src/commands/run-task.ts
- src/commands/run-task.test.ts

forbiddenFiles:
- docs/tasks/run-task-kernel-hardening.md
- src/commands/run-task-review.ts
- src/commands/run-task-review.test.ts
- src/commands/run-task-agent-runner.ts
- src/commands/run-task-agent-runner.test.ts
- src/cli.ts
- src/cli-main.ts
- src/workflow/engine.ts
- src/workflow/executor.ts
- src/agent-runtime/factory.ts
- src/agent-runtime/registry.ts

implementationSteps:
- Add evidence-closeout to the Agent completion signal union.
- During no-close checkpoint evaluation, call collectGitChanges against the pre-Agent git baseline.
- If task-scoped gitChanges exist, send SIGTERM to the Agent child process and resolve the spawn wait with evidence-closeout.
- After evidence-closeout, continue through the existing collectGitChanges, validationCommands, deterministic review, and final success logic.
- Preserve output-last-message, close, exit, idle timeout, and no-close timeout behavior.
- Add a test where the Agent never closes, gitChanges appear, validation passes, and runTask succeeds with completionSignal evidence-closeout.
- Add a test where the Agent never closes and no gitChanges appear, proving no evidence-closeout occurs.

validationCommands:
- npx vitest run src/commands/run-task.test.ts src/commands/run-task-review.test.ts
- npm run typecheck
- npm run lint

riskNotes:
- Evidence closeout must not bypass validation.
- Evidence closeout must not use Agent self-reported completion as the source of truth.
- Stop if this requires changing Agent adapter behavior.
