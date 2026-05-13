# VectaHub Workflow Engine

> DAG-based workflow execution engine. Read this when modifying `src/workflow/` or working with workflow YAML files.

## Architecture

```
src/workflow/
├── engine.ts              # WorkflowEngine — top-level orchestrator (createWorkflowEngine())
├── executor.ts            # Step-level executor (createExecutor())
├── dag.ts                 # DAG: dependency graph, topological sort, cycle detection
├── interpolation.ts       # String/step template interpolation
├── expression-engine.ts   # JsonLogic + infix expression evaluator
├── context-manager.ts     # Per-execution context & expression data
├── context-transformer.ts # Context transformation utilities
├── state-manager.ts       # Execution state machine (RUNNING/PAUSED/ABORTED/etc.)
├── storage.ts             # Persistence for workflows & execution records
├── scheduler.ts           # Workflow scheduling (createScheduler())
├── policy-manager.ts      # RBAC & pre-flight policy checks
├── parallel-executor.ts   # Parallel step execution
├── version-manager.ts     # Workflow versioning
├── system-workflows.ts    # Built-in system workflow definitions
├── types.ts               # Workflow-specific types
├── index.ts               # Barrel re-exports
└── handlers/              # Step type handlers
    ├── exec-handler.ts        # Shell command execution steps
    ├── foreach-handler.ts     # Iterator steps
    ├── if-handler.ts          # Conditional branching
    ├── opencli-handler.ts     # OpenCLI integration steps
    ├── parallel-handler.ts    # Parallel execution steps
    └── types.ts               # Handler types
```

## Key Interfaces

### WorkflowDefinition
```ts
interface WorkflowDefinition {
  name: string;
  version?: string;
  steps: WorkflowStep[];
  // metadata, triggers, etc.
}
```

### WorkflowStep
```ts
interface WorkflowStep {
  id: string;
  type: 'exec' | 'if' | 'foreach' | 'parallel' | 'opencli';
  // type-specific fields...
  depends_on?: string[];  // DAG dependencies
}
```

## Factory Functions

- `createWorkflowEngine()` → top-level orchestrator
- `createExecutor()` → step-level execution
- `createScheduler()` → workflow scheduling

## Expression Syntax

### Template Interpolation (`interpolation.ts`)
- `${ctx.variable}` — reference execution context variable
- `${step_id.output}` — reference output from a previous step
- String interpolation embedded in YAML values

### Expression Engine (`expression-engine.ts`)
- Supports **JsonLogic** expressions
- Supports **infix** expressions (arithmetic, comparison, logical)
- Used in `if-handler` for conditional branching

## DAG Execution (`dag.ts`)

- Builds dependency graph from `depends_on` fields
- Topological sort determines execution order
- Cycle detection prevents infinite loops
- Parallel execution of independent nodes via `parallel-executor.ts`

## State Machine (`state-manager.ts`)

States: `IDLE` → `RUNNING` → `PAUSED` / `COMPLETED` / `FAILED` / `ABORTED`

- State transitions are logged
- Supports pause/resume via `src/commands/resume.ts`

## Workflow YAML Templates

Located in `templates/`:
- `backup-directory.yaml`, `ci-check.yaml`, `docker-build.yaml`
- `git-commit.yaml`, `git-flow.yaml`
- `gh-auto-process.yaml`, `gh-auto-process-all.yaml`

## Verification

```bash
# Typecheck workflow module
npm run typecheck

# Run workflow-specific tests
npx vitest run src/workflow/ --reporter=verbose

# Full test suite
npm run test:run
```

## Common Pitfalls

- Step IDs must be unique within a workflow
- `depends_on` references must match existing step IDs
- Expression evaluation errors fail the step, not the engine
- Storage path uses `getVectaHubPath()` for persistence