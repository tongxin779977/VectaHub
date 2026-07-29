# src/workflow/ — Workflow Execution Engine

## OVERVIEW

Structured step executor that resolves YAML/JSON workflows via a step-type dispatch loop, running each step through DAG-ordered handlers with interpolation, retry, and sandbox integration.

## STRUCTURE

```
engine.ts          # WorkflowEngine: createWorkflow, addStep, removeStep, execute/executeAsync
handlers/          # One handler per step type: exec/if/for_each/parallel/opencli/delegate
executor.ts        # Executor: single-step dispatch → handler lookup + retry wrapping
storage.ts         # Storage: persistence layer, imports createOutputStore from execution/
state-manager.ts   # ExecutionStateManager: in-memory step state across long-running workflows
parallel-executor.ts # Parallel step runner (sub-worker fan-out, result-merge)
interpolation.ts   # Variable interpolation with context (${prev}, ${env}, ${var})
expression-engine.ts # Expression evaluation (if-step conditions, conditional logic)
dag.ts             # topologicalSort + validateDependencies for step ordering
context-manager.ts # ContextManager: runtime variable store + ExecutorContext
context-transformer.ts # Context shape conversion for external consumers
template.ts        # Workflow template instantiation
versioning.ts      # Workflow version migration
scheduler.ts       # Deferred/scheduled execution
policy-manager.ts  # Policy enforcement per workflow execution
system-workflows.ts # Built-in system workflow definitions
interfaces.ts      # IWorkflowEngine interface, ExecuteOptions, RetryOptions
```

## WHERE TO LOOK

| Task | File(s) |
|---|---|
| Add a new step type | `handlers/types.ts` (StepHandler), new handler in `handlers/`, register in `executor.ts` dispatch map |
| Change step execution order | `dag.ts` (topologicalSort), `engine.ts` execute loop |
| Debug step failure | `engine.ts` execute loop → `state-manager.ts` step state → handler in `handlers/` |
| Add interpolation syntax | `interpolation.ts` |
| Tune parallel execution | `parallel-executor.ts` |
| Persist workflow data | `storage.ts` |
| Expression/condition logic | `expression-engine.ts` |

## CONVENTIONS

- **Handlers are pure functions**: `(step, options, context, executeStep, startTime) → ExecutionResult`. No side effects besides calling `executeStep` or `exec/execInSandbox` from `HandlerDependencies`.
- **engine.ts is the composition root**: all external deps (retry manager, security guard, agent registry, audit) are injected here. Handlers receive only `HandlerDependencies`.
- **engine.ts owns step-level retry** via `createRetryManager` from `skills/`. Handlers don't implement retry themselves.
- **executeStep callback**: handlers receive it to delegate nested execution (e.g., for_each calls it per iteration). This is the only way handlers run substeps.
- **New step types**: register in `handlers/` with a `StepHandler` function, add to `executor.ts` dispatch map, document the step schema in types.
- **executor.ts** wraps handler dispatch with the retry manager, so all handlers automatically benefit from step-level retry.
- **Storage boundary**: `storage.ts` imports from `execution/` for output store. Workflow data is stored via `Storage` interface, not direct filesystem access.

## ANTI-PATTERNS

- **Don't add cross-module imports in handlers.** Handlers depend only on `HandlerDependencies` and `ExecutionContext`. If you need a new dependency, add it to `HandlerDependencies` and inject it in `engine.ts`.
- **Don't implement retry logic in handlers.** Retry is owned by `executor.ts` via `skills/iterative-refinement/retry-manager.ts`. Handlers run once per attempt.
- **Don't bypass the handler dispatch.** All step execution must go through `Executor` dispatch. Never add step-type logic directly in `engine.ts`.
- **Don't access `getDefaultContext()`.** Accept `InfrastructureContext` or narrower deps through `HandlerDependencies`.
- **Don't store step output directly.** Use `state-manager.ts` for in-memory state; output persists via `Storage` (which delegates to `execution/` output store).
