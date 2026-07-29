# AGENTS.md — src/chat/

> 只记本层非显然事实。父级全局规则见 `../../AGENTS.md`。

## OVERVIEW

Interactive REPL for `vectahub chat` — conversational input (NL / shell / slash-command) → workflow → execute loop.

## STRUCTURE

15 files, flat directory (no subdirs).

| Concern | File(s) |
|---|---|
| REPL lifecycle + input routing | `repl.ts` → `createREPL()`, `createRepl()` |
| Shared types + DI contract | `types.ts` → `ReplDeps`, `ChatInput`, `ChatOutput`, `SlashCommand`, `PendingWorkflow` |
| REPL config | `config.ts` → `ChatConfig`, `formatChatConfig()` |
| Input classification (nl / shell / slash) | `command-manager.ts` |
| NL pipeline (cache → preflight → contract → execute) | `nl-handler.ts` → `createNLHandler()` |
| Commander.js → string bridge | `command-bridge.ts` → `CommandBridge` (30s TTL cache) |
| Commander.js bridge tests | `command-bridge.test.ts` |
| LLM context assembly | `context-builder.ts`, `context-builder.test.ts` |
| Direct shell fallback | `shell-executor.ts` (child_process.spawn, 30s timeout) |
| Workflow YAML → Steps | `workflow-parser.ts` (60s cache) |
| Raw YAML parse wrapper | `yaml-parser.ts` (60s cache) |
| Output → pino rendering | `ui-renderer.ts`, `ui-renderer.test.ts` |
| Shared utilities | `utils.ts` → `SimpleCache<T>` (FIFO+TTL), `formatError()` |

## WHERE TO LOOK

| Concern | File(s) |
|---|---|
| Routes user input to handler (bare-execute → slash → shell → NL) | `repl.ts:processInput()` |
| Slash command registry | `repl.ts:defaultSlashCommands` — `/exit`, `/help`, `/status`, `/execute` |
| Bare execute intents ("执行"/"run"/"go") | `repl.ts:isBareExecuteIntent()` |
| Session persistence path | `repl.ts:persistSession()` → `~/.vectahub/chat-sessions/` |
| DI composition root | `src/commands/chat.ts` → `buildReplDeps()` wires `InfrastructureContext` → `ReplDeps` |
| Intent cache (120s, 200 entries) | `nl-handler.ts:INTENT_CACHE_TTL_MS` |
| Command bridge cache (30s, 50 entries) | `command-bridge.ts:DEFAULT_COMMAND_CACHE_TTL_MS` |
| Workflow YAML cache (60s) | `workflow-parser.ts` |

## CONVENTIONS

- **Factory + DI**: every module exposes a `createX(deps)` factory. `ReplDeps` is the single DI contract; no `getDefaultContext()` in this layer.
- **Input routing order**: `processInput` checks bare-execute-intent first, then slash-commands, then shell, then NL as fallback. Don't reorder.
- **output through UIRenderer**: all REPL output goes through `ui.render(output)` — never `console.log` or `process.stdout.write` directly.
- **Caching strategy**: `SimpleCache<T>` everywhere, each with its own TTL. Intent (120s), command-bridge (30s), workflow-parser (60s), yaml-parser (60s). Call `.clear()` when config changes invalidate cache.
- **Session persistence**: `pendingWorkflows` in-memory Map + filesystem snapshot on every workflow generation. Restored at REPL start; failed restore does not block startup.
- **Pending workflow model**: NL generates workflow → stored as `PendingWorkflow` → user triggers execute (bare or `/execute`) → `executePendingWorkflow()` → cleared on completion.
- **Tests**: co-located `*.test.ts`; most files lack tests (only command-bridge, context-builder, ui-renderer have them). Adding NL-handler or repl test requires full mock of `ReplDeps`.
- **No agent-runtime dependency**: chat → workflow → delegate-handler → agent-runtime is indirect only. Don't import from `src/agent-runtime/` in this layer.

## ANTI-PATTERNS

- **Don't call `getDefaultContext()`**: receive deps through `ReplDeps` or narrower factory params.
- **Don't inline routing logic**: use `command-manager.ts` for classification and `processInput()` for dispatching. Never duplicate the routing chain.
- **Don't add business logic to slash commands**: handlers are UI-only glue. Execution, validation, and state mutation belong in `nl-handler.ts`, `workflow-engine`, or below.
- **Don't bypass UIRenderer**: raw `console.log`/`logger.info()` in handler code breaks logLevel filtering and testability.
- **Don't persist large objects in session data**: `pendingWorkflowYAMLs` are serialized as strings. Keep the snapshot lightweight.
- **Don't add persistent state outside session persistence**: no new filesystem writes, no global singletons, no env-var reads in this layer.