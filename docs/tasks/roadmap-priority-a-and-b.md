# VectaHub Roadmap: Priority A &amp; B Tasks

## Task P5-1

taskId: P5-1

taskLabel: Add performance benchmarking infrastructure

allowedFiles:
- package.json
- scripts/performance-benchmark.mjs
- src/infrastructure/benchmark/*.ts

forbiddenFiles:
- docs/tasks/*.md
- src/commands/run-task.ts
- src/workflow/*.ts

implementationSteps:
- Create a benchmarking script in scripts/
- Add performance measurement utilities
- Add benchmark for CLI startup time
- Add benchmark for common operations
- Add npm scripts for running benchmarks

validationCommands:
- npm run typecheck
- npm run lint
- npm run benchmark

riskNotes:
- Keep benchmarks focused and fast to run
- Avoid disrupting existing functionality
- Keep benchmarks deterministic when possible

## Task P4-1

taskId: P4-1

taskLabel: Security hardening - add risk mitigation check

allowedFiles:
- src/security-protocol/*.ts
- src/commands/security.ts

forbiddenFiles:
- docs/tasks/*.md
- src/workflow/*.ts
- src/commands/run-task.ts

implementationSteps:
- Review existing security rules
- Add one additional risk mitigation check
- Add tests for the new check
- Ensure the check doesn't disrupt existing flows

validationCommands:
- npm run typecheck
- npm run lint
- npx vitest run src/security-protocol/

riskNotes:
- Don't change existing security behavior unless fixing a bug
- Ensure new checks are optional or gracefully degrade
- Maintain backward compatibility

## Task P5-5-1

taskId: P5-5-1

taskLabel: Design worktree isolation layer draft

allowedFiles:
- docs/design/worktree-isolation.md

forbiddenFiles:
- src/commands/*.ts
- src/workflow/*.ts

implementationSteps:
- Create design document for worktree isolation
- Document git diff attribution strategy
- Document cleanup strategy
- Define key interfaces (without implementation)
- Outline potential edge cases

validationCommands:
- npm run typecheck

riskNotes:
- This task is design only, don't modify production code
- Focus on architecture and contracts
- Keep it practical and implementable
