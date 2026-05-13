# VectaHub CLI Skill

> Use this when changing `src/commands/`, `src/cli.ts`, `src/cli-main.ts`, `src/cli-bootstrap.ts`, or command wiring.

## Goal

Help Cline safely add or modify CLI commands without breaking:

- lazy loading
- ESM imports
- Commander wiring
- JSON output contracts
- command-specific tests

## Read First

1. Target command file in `src/commands/`
2. `src/cli.ts`
3. `src/cli-main.ts`
4. `src/commands/index.ts` or `src/commands/module.ts` only if needed

## First 5 Checks

Before editing:

1. Is this an existing command or a new command?
2. Should it be eager or lazy loaded?
3. Does it need `--json` behavior?
4. Does it change a shared type or output schema?
5. What is the narrowest test file to run?

## Default Implementation Pattern

```ts
import { Command } from 'commander';

export const xxxCmd = new Command('xxx')
  .description('...')
  .option('...')
  .action(async (options) => {
    // validate
    // do work
    // format output
  });
```

Rules:

- named export only
- ESM import paths use `.js` where repo style requires it
- avoid default export
- keep command-specific logic inside the command file
- if output is machine-consumed, preserve existing JSON field meaning

## Lazy Loading Rule

Prefer lazy loading unless the command is part of critical startup behavior.

When adding a lazy command:

1. add placeholder in `src/cli.ts`
2. add `case` in lazy loader
3. verify help and actual execution

## JSON Contract Rule

If a command already supports `--json`:

- do not silently rename fields
- do not change boolean semantics like `ok`
- do not mix logs into stdout JSON
- put diagnostic logs elsewhere if needed

## Common Mistakes

- add command file but forget lazy-load case
- break ESM import path
- change JSON output shape without updating callers
- mix human logs with JSON stdout
- claim command works without running help/test path

## Minimal Verification

Choose the narrowest useful check:

```bash
npm run typecheck
npm test -- src/commands/<name>.test.ts --run
npm run dev -- <name> --help
```

## Escalate Before Editing If

- command output is consumed by VS Code extension
- command changes shared types in `src/types/`
- command changes startup behavior in `src/cli.ts` / `src/cli-bootstrap.ts`

