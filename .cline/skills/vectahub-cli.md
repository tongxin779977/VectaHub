# VectaHub CLI Command Development

> How to add, modify, and wire CLI commands. Read this when working on `src/commands/`, `src/cli.ts`, or `src/commands/module.ts`.

## Command Architecture

```
src/cli.ts                  # Entry point, Commander.js program, lazy loading
src/commands/module.ts      # Module template generator for multi-agent collaboration
src/commands/index.ts       # Barrel re-exports
src/commands/<name>.ts      # Individual command implementations
```

## Lazy Loading Pattern

Commands are split into two categories:

### Eagerly Loaded (at startup)
```ts
// src/cli.ts — imported at top level
import { runCmd } from './commands/run.js';
import { doctorCmd } from './commands/doctor.js';
import { setupCmd } from './setup/index.js';
import { configCmd } from './infrastructure/config/index.js';

program.addCommand(runCmd);
program.addCommand(doctorCmd);
```

### Lazily Loaded (on first use)
```ts
// Registered as placeholder Commands
program
  .command('serve')
  .allowUnknownOption()
  .arguments('[args...]')
  .action(async (...args) => {
    await lazyLoadCommand('serve', ...args);
  });
```

**`lazyLoadCommand(name)`** does:
1. Check `loadedCommands` Set (skip if already loaded)
2. `switch` on name → `await import('./commands/<name>.js')`
3. `removePlaceholderCommand(name)` — strips placeholder from Commander's internal array
4. `program.addCommand(realCmd)` — adds real command
5. Re-parse: `realCmd.parseAsync(remainingArgs, { from: 'user' })`

## Adding a New Command — Checklist

### Step 1: Create the command file

```ts
// src/commands/my-command.ts
import { Command } from 'commander';

export const myCommandCmd = new Command('my-command')
  .description('What this command does')
  .option('-f, --flag', 'Description of flag')
  .action(async (options) => {
    // implementation
  });
```

### Step 2: Register in `src/cli.ts`

**For lazy loading** (preferred for non-critical commands):
```ts
// Add to the lazy-load section
program
  .command('my-command')
  .allowUnknownOption()
  .arguments('[args...]')
  .action(async (...args) => {
    await lazyLoadCommand('my-command', ...args);
  });
```

Then add the `case` in `lazyLoadCommand()`:
```ts
case 'my-command': {
  const { myCommandCmd } = await import('./commands/my-command.js');
  return myCommandCmd;
}
```

**For eager loading** (only for critical startup commands):
```ts
import { myCommandCmd } from './commands/my-command.js';
program.addCommand(myCommandCmd);
```

### Step 3: Add test file

```ts
// src/commands/my-command.test.ts
import { describe, it, expect } from 'vitest';

describe('my-command', () => {
  it('should do expected behavior', async () => {
    // test implementation
  });
});
```

### Step 4: Verify

```bash
npm run typecheck
npx vitest run src/commands/my-command.test.ts --reporter=verbose
npm run dev -- my-command --help  # Test lazy loading works
```

## Command Object Structure

Each command file exports a `Command` instance:

```ts
export const xxxCmd = new Command('xxx')
  .description('...')
  .option('...')
  .argument('...')
  .action(async (arg1, options) => {
    // 1. Validate inputs
    // 2. Do work
    // 3. Output results (console.log or return)
    // 4. Audit logging (if applicable)
  });
```

## Module Generator (`module.ts`)

`module.ts` is a **template generator** for multi-agent collaboration. It defines `MODULE_CONFIGS` with 8 modules: `nl`, `workflow`, `executor`, `storage`, `sandbox`, `utils`, `cli`, `types`. Each config contains stub files with `createX()` factory functions.

This is NOT runtime wiring — it's a scaffolding tool.

## Audit Logging

Commands that perform significant actions should log to audit:

```ts
import { auditLog } from '../infrastructure/audit/index.js';
await auditLog({
  event: 'cli_command',
  command: 'my-command',
  args: options,
  timestamp: new Date().toISOString(),
});
```

## Common Pitfalls

- **Forgot to add `case` in `lazyLoadCommand()`**: command silently fails
- **Used default export**: Cline won't find it — use named exports
- **Missing `.js` extension in import**: ESM resolution fails
- **Shared modules**: `serve`+`client`, `export`+`import`, `dev` loads `status`/`module`/`validate`/`test`
- **`allowUnknownOption()`** on placeholders: required to pass args through to real command