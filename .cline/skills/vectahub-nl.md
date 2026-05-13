# VectaHub NL Skill

> Use this when changing `src/nl/`, intent parsing, prompt management, tool calling, or NL routing.

## Goal

Keep NL changes bounded, testable, and compatible with fallback behavior.

## Read First

1. Exact target file in `src/nl/`
2. Its nearest test file
3. `src/nl/core/` if the issue is pipeline-level
4. `src/nl/prompt-manager.ts` only if prompt construction is relevant

## First 5 Questions

1. Is this rules-first logic or LLM fallback logic?
2. Does it change parsing, routing, or command synthesis?
3. Is the behavior already covered by a regression test?
4. Does it affect JSON/tool-calling contract?
5. Can the bug be fixed in one stage of the pipeline instead of several?

## Pipeline Reminder

Typical order:

```text
normalize -> split -> parse -> route -> match -> fallback -> extract -> synthesize
```

Do not edit multiple stages unless necessary.

## NL Safety Rules

- prefer deterministic fix before prompt change
- if changing prompt behavior, preserve fallback path
- do not silently widen intent matches without tests
- do not change output contracts used by downstream commands

## Minimal Verification

```bash
npm run typecheck
npm test -- src/nl/<target>.test.ts --run
npm test -- src/nl/core/<target>.test.ts --run
```

## Common Mistakes

- editing prompts when matcher bug is deterministic
- changing both parser and synthesizer in one shot
- no regression test for the exact utterance pattern

