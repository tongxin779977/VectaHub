# VectaHub Security Skill

> Use this when touching sandbox, command rules, risk assessment, redaction, audit, or dangerous command handling.

## Goal

Keep security changes conservative, reviewable, and verifiable.

## Read First

1. Exact target file under:
   - `src/security-protocol/`
   - `src/command-rules/`
   - `src/sandbox/`
   - `src/cli-tools/command-rules/`
2. Nearest tests
3. `src/commands/run-task.ts` if execution path is involved

## Non-Negotiable Rules

- no bypass of risk checks
- no bypass of confirmation flow
- no raw secret logging
- no raw exec path introduced
- no path handling that escapes approved project/data boundaries

## Security Change Checklist

Before editing, identify:

1. what decision is made here
2. whether the decision is deterministic or user-confirmed
3. whether logs/trace/records need redaction
4. what test proves behavior did not regress

## Preferred Fix Order

1. tighten or correct rule logic
2. align output / state reporting
3. add regression tests
4. only then consider broader refactor

## Minimal Verification

```bash
npm run typecheck
npm test -- src/security-protocol/ --run
npm test -- src/command-rules/ --run
npm run dev -- security list
npm run dev -- security test -- "rm -rf /tmp/test"
```

## Common Mistakes

- fix CLI UX but forget underlying rule engine
- add confirmation in UI only, not in execution path
- redact summaries but not raw stream
- widen allowlist to “make tests pass”

