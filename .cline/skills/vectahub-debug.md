# VectaHub Debug & Diagnostics

> Debugging, diagnostics, doctor, audit queries, and troubleshooting. Read this when investigating issues.

## Architecture

```
src/debugger/                    # Workflow debugging
├── workflow-debugger.ts         # WorkflowDebugger — step-through debugging
├── debugger-api.ts              # Debugger API interface
└── *.test.ts

src/commands/doctor.ts           # `vectahub doctor` — full diagnostics
src/commands/debug.ts            # `vectahub debug` — debug mode
src/commands/verify.ts           # `vectahub verify` — verification runner
src/commands/status.ts           # `vectahub dev status` — runtime status

src/monitoring/                  # Runtime monitoring
├── monitor.ts                   # Monitor — execution monitoring
├── metrics.ts                   # Metrics collection
└── *.test.ts

src/infrastructure/audit/        # Audit logging backend
├── audit-logger.ts              # Audit log writer
├── audit-store.ts               # Audit log storage
└── index.ts

src/utils/audit.ts               # Audit utility functions

src/daemon/                      # Background daemon
├── socket-server.ts             # Socket-based IPC server
├── client.ts                    # Daemon client
├── types.ts                     # Daemon types
└── index.ts
```

## Diagnostic Commands

### Full Diagnostics
```bash
npm run dev -- doctor
```
Checks: Node.js version / config files / storage permissions / sandbox policies / tool registration / LLM connectivity

### Runtime Status
```bash
npm run dev -- dev status
```

### Verification Suite
```bash
npm run dev -- verify --type typecheck    # Type checking only
npm run dev -- verify --type test         # Tests only
npm run dev -- verify --type coverage     # Coverage report
npm run dev -- verify --type all          # Everything
```

## Audit Queries

```bash
# Recent logs
npm run dev -- audit list --limit 20

# By event type
npm run dev -- audit query --event cli_command
npm run dev -- audit query --event workflow_start
npm run dev -- audit query --event workflow_step
npm run dev -- audit query --event workflow_end
npm run dev -- audit query --event sandbox_detect
npm run dev -- audit query --event intent_match

# Statistics
npm run dev -- audit stats
```

## Workflow Debugging

Use `WorkflowDebugger` from `src/debugger/workflow-debugger.ts`:

```ts
import { createWorkflowDebugger } from '../debugger/workflow-debugger.js';

const debugger = createWorkflowDebugger(workflowDef);
// Step through execution, inspect context at each step
```

## Log Locations

| Data | Path |
|------|------|
| Audit logs | `~/.vectahub/audit/` |
| Execution records | `~/.vectahub/executions/` |
| Workflow definitions | `~/.vectahub/workflows/` |

Use `getVectaHubPath()` to resolve these programmatically.

## Common Issues & Fixes

### "Command not found" after adding new command
- Check `lazyLoadCommand()` switch-case in `src/cli.ts`
- Verify `.js` extension in import path

### Workflow stuck in RUNNING state
- Check `state-manager.ts` for transition errors
- Look for unhandled promise rejections in step handlers
- Check `depends_on` for deadlocks in DAG

### LLM fallback triggered unexpectedly
- Check `config/commands/intents.yaml` for pattern matches
- Verify `intent-matcher.ts` regex patterns
- Check session TTL in `session-manager.ts`

### Sandbox rejection on safe command
- Check `detector.ts` regex patterns — may be too broad
- Review security rule database via `npm run dev -- security list`
- Use `npm run dev -- security test -- <command>` to diagnose

### Audit logs not appearing
- Check `~/.vectahub/audit/` directory permissions
- Verify `infrastructure/audit/` logger initialization
- Check if audit is disabled in config

## Verification After Debugging

```bash
# Narrowest check first
npx vitest run src/<affected-module>/ --reporter=verbose

# Then broader
npm run typecheck
npm run test:run