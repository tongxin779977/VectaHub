# VectaHub Debug Skill

> Use this when debugging failures, doctor output, audit issues, trace confusion, or status mismatches.

## Goal

Make Cline debug with evidence, not speculation.

## Read First

1. The failing command or module file
2. Its nearest test file
3. `src/infrastructure/trace/` or `src/infrastructure/audit/` if the issue involves observability
4. `src/commands/doctor.ts` / `src/commands/debug.ts` only if directly relevant

## Debug Loop

1. Reproduce with the smallest command or test
2. Locate the failing layer
3. Read only the files for that layer
4. Form one concrete hypothesis
5. Verify the hypothesis
6. Edit only after the failure path is clear

## Failure Layer Map

| Symptom | Check First |
|---|---|
| command not working | `src/commands/*`, `src/cli.ts` |
| trace missing / broken | `src/infrastructure/trace/`, extension `src/trace/` |
| audit missing | `src/infrastructure/audit/`, `src/utils/audit.ts` |
| verification mismatch | `src/commands/run-task.ts`, P3-related files |
| extension state mismatch | extension command + project model/store |

## Evidence Rules

- if you did not reproduce it, say so
- if you did not inspect the failing layer, do not conclude root cause
- if there are multiple plausible causes, list them before editing

## Minimal Verification

```bash
npm run typecheck
npm test -- <closest-test-file> --run
npm run dev -- doctor
```

## Common Mistakes

- jumping to workflow engine when bug is CLI wiring
- using full test suite before narrow reproduction
- fixing output text instead of state source
- treating logs as truth when structured state exists

