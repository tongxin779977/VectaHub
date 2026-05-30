# Development Checklists

> Document Status: Current Implementation
> Authority: Reusable checklists for common development scenarios.
> Last Verified: 2026-05-30

This document provides actionable checklists derived from real incident patterns. Each checklist is designed to prevent specific failure modes observed in production.

See also: [Verification Gates](./verification-gates.md) for the full gate matrix.

---

## 1. Quality Gate Fix Checklist

When fixing lint warnings, type errors, or other quality gate failures.

### Do

- Run the full verification suite after each fix batch, not just the failing gate.
- Check that removed imports are not used at runtime (grep for usage before deleting).
- Verify `npm run typecheck` after removing imports — some imports look unused to lint but are needed by TypeScript.
- Preserve side-effect imports when the module has runtime initialization effects.

### Don't

- Delete an import that is used in a runtime path even if lint flags it as unused.
- Assume one green gate means all gates are green.
- Modify test files to suppress quality failures.
- Introduce `eslint-disable` comments without documenting why.

### Required Verification

```bash
npm run lint
npm run typecheck
npm run test:run
npm run check:default-context-usage
```

---

## 2. Import-Time Side Effect Checklist

When modifying imports in infrastructure, logger, sandbox, or bootstrap modules.

### Do

- Ask: "Does this module initialize state, create files, or start I/O on import?"
- Check for top-level `new Logger()`, `createWriteStream()`, `mkdirSync()`, or similar calls.
- Verify that removing an import does not break initialization order.
- Run tests after import changes to catch missing initialization.

### Don't

- Create default file loggers at module top level in shared infrastructure code.
- Assume import removal is safe just because lint says the symbol is unused.
- Ignore initialization order dependencies between modules.

### Warning Signs

- A module that creates files or directories on import.
- A module that reads environment variables at import time.
- A module that starts timers or listeners at import time.

### Required Verification

```bash
npm run test:run
# Focus on tests that import the modified module
```

---

## 3. Logger / Default Context Checklist

When replacing `console.log` with logger, or modifying default context creation.

### Do

- Use the project's logger infrastructure (`src/infrastructure/logger/`).
- Ensure logger creation does not trigger file I/O at import time in shared modules.
- Check that `getDefaultContext()` is only called in approved boundary files (see `check:default-context-usage`).
- Verify no blocking `console.log`/`console.error` remains in production paths.

### Don't

- Create a default file logger at module top level in infrastructure code.
- Replace `console` with a logger that has file transport in a leaf module.
- Call `getDefaultContext()` outside the approved boundary files.

### Required Verification

```bash
npm run lint
npm run check:default-context-usage
npm run test:run
# Check for blocking console usage in quality signals
scripts/collect_quality_signals.sh
```

---

## 4. NL / LLM Pipeline Fix Checklist

When fixing natural language processing, intent matching, or tool-calling behavior.

### Do

- Verify the fix against both LLM and deterministic (non-LLM) paths.
- Check that `SAFE_SHELL_COMMANDS` or equivalent allowlists match the actual implementation.
- Test with Chinese and English inputs if the pipeline handles both.
- Run semantic E2E after NL changes.
- Verify that shell command fallback does not bypass security checks.

### Don't

- Claim a command is handled by deterministic fallback without verifying the allowlist.
- Assume LLM output is correct without hallucination checks.
- Modify intent matching without updating the semantic E2E expectations.

### Key Invariants

- `SAFE_SHELL_COMMANDS` in `src/nl/core/pipeline.ts` defines the deterministic shell allowlist.
- Shell commands outside this list must go through the full NL pipeline.
- Security assessment must happen before command execution regardless of path.

### Required Verification

```bash
npm run test:run
# Run semantic E2E specifically
scripts/test-semantic-output.sh
```

---

## 5. Final Merge Verification Checklist

Before merging any branch to main.

### Do

- Run ALL verification gates, not just the ones that seem relevant.
- Verify that documentation claims match actual implementation.
- Check that the semantic E2E report reflects real test results.
- Confirm no production `any` usage was introduced.
- Confirm no blocking `console` usage was introduced.

### Don't

- Claim "no code changes" if test reports or generated files were updated.
- Merge with failing gates even if the failure seems unrelated.
- Skip semantic E2E for changes that touch NL, CLI output, or command handling.

### Required Verification

```bash
npm run lint
npm run typecheck
npm run check:default-context-usage
npm run test:run
git diff --check
scripts/collect_quality_signals.sh
scripts/test-semantic-output.sh
```

### Completion Report Template

```
## Changes
- [List files changed and why]

## Verification
- [Command]: [Result]

## Risk Review
- [No behavior changes intended / Describe behavior changes]
```

---

## 6. Self-Review Output Format Checklist

When writing the final summary of a change set.

### Do

- List actual files changed with specific reasons.
- State verification commands run and their results.
- Distinguish between source code changes and report/config changes.
- Match claims to actual implementation (e.g., don't claim `cat` is handled if only `pwd/ls/echo` are in the allowlist).
- Use `No behavior changes intended` when no runtime behavior was modified.

### Don't

- Write "all tests pass" without showing the command output.
- Claim "no code changes" if test reports were regenerated.
- Use vague descriptions like "various fixes" — be specific.
- Copy descriptions from earlier versions without verifying they still match.

### Accuracy Checks

Before finalizing the report:

1. Verify any claim about specific commands, functions, or features against the actual source code.
2. Check that file lists match `git diff --stat`.
3. Confirm that the semantic E2E report's "Known Defects" section matches current implementation.

---

## 7. Prompt Template for Trae Solo / Subagent

Copy this template when giving a development task to Trae or a subagent.

```markdown
## Task
[Describe the specific task]

## Scope
- In scope: [list files/modules]
- Out of scope: [list what to NOT touch]

## Constraints
- Do not change business logic
- Do not modify test assertions to suppress failures
- Do not introduce production `any` or blocking `console`
- Do not expand scope beyond what is listed

## Verification Required
After completing the task, run ALL of:
- `npm run lint`
- `npm run typecheck`
- `npm run check:default-context-usage`
- `npm run test:run`
- `git diff --check`
- `scripts/collect_quality_signals.sh`

If NL/CLI changes were made, also run:
- `scripts/test-semantic-output.sh`

## Output Format
1. Changes: list files and reasons
2. Verification: command + result for each
3. Risk Review: behavior changes or "No behavior changes intended"
```

---

## Quick Reference

| Scenario | Key Risk | Primary Checklist |
|----------|----------|-------------------|
| Fix lint warnings | Removing runtime-needed imports | §1 Quality Gate Fix |
| Modify logger imports | Import-time file I/O | §2 Import-Time Side Effect |
| Replace console with logger | Default context violations | §3 Logger / Default Context |
| Fix NL intent matching | Incomplete allowlist coverage | §4 NL / LLM Pipeline |
| Pre-merge verification | Incomplete gate coverage | §5 Final Merge Verification |
| Write change summary | Inaccurate claims | §6 Self-Review Output Format |
| Delegate to agent | Scope creep, missing verification | §7 Prompt Template |
