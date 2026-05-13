# VectaHub Workflow Skill

> Use this when changing DAG execution, executor behavior, workflow storage, step handlers, resume, or scheduler logic.

## Goal

Keep workflow changes local to the correct layer and preserve execution/state semantics.

## Read First

1. exact target file in `src/workflow/`
2. nearest test file
3. `src/types/index.ts` or workflow-related shared types only if needed
4. specific handler file if bug is step-type-specific

## Layer Map

| Concern | Check First |
|---|---|
| DAG / dependencies | `dag.ts` |
| execution orchestration | `engine.ts` |
| per-step behavior | `executor.ts` or `handlers/*` |
| state transitions | `state-manager.ts` |
| interpolation / expressions | `interpolation.ts`, `expression-engine.ts` |
| persistence | `storage.ts` |
| parallel behavior | `parallel-executor.ts`, `handlers/parallel-handler.ts` |

## Workflow Change Checklist

Before editing:

1. what exact layer owns this behavior?
2. is the bug about execution order, state, handler logic, or persistence?
3. does the change affect resume/retry semantics?
4. is there already a focused workflow test covering nearby behavior?

## Rules

- do not edit engine + handler + state manager together unless required
- preserve state-machine semantics
- preserve resume/retry behavior unless task explicitly changes it
- if bug is handler-specific, fix the handler first

## Minimal Verification

```bash
npm run typecheck
npm test -- src/workflow/<target>.test.ts --run
npm test -- src/workflow/handlers/<target>.test.ts --run
```

## Common Mistakes

- fixing symptom in engine when bug is in handler
- changing persistence shape without checking resume/history flows
- breaking parallel/depends_on semantics while fixing a single step type

