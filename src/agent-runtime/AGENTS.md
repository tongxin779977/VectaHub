# AGENTS.md — agent-runtime

## OVERVIEW

Agent registry, descriptor catalogue, and ACP (Agent Communication Protocol) transport layer. Connects VectaHub's workflow engine to external agent CLIs via a single protocol.

## STRUCTURE

```
agent-runtime/
├── registry.ts           # Singleton AgentRegistryImpl (descriptors + adapters, event bus)
├── factory.ts            # Built-in AgentDescriptor catalogue (codex/gemini/aider/claude/agy)
├── utils.ts              # createSingleton, createSilentLogger, debounce, throttle
├── transport/            # ACP transport strategy (the only active strategy; HTTP is future)
│   ├── acp-transport.ts  # AgentTransport impl: spawn + protocol lifecycle
│   ├── descriptor-mapper.ts  # AgentDescriptor → ACP CLI args & options
│   ├── error-mapper.ts   # Process/signal errors → TransportError
│   ├── factory.ts        # createTransport(AcpConfig) DI entry
│   ├── trace-bridge.ts   # ACP events → TraceService spans
│   ├── audit-bridge.ts   # Tool calls & permissions → AuditService records
│   ├── security-bridge.ts # ACP permission requests → CommandRules + confirmation
│   └── types.ts          # AgentTransport, TransportRequest/Result/Error
├── acp/
│   ├── acp-client.ts     # ACP JSON-RPC client (spawn + stdin/stdout protocol)
│   ├── acp-types.ts      # AcpEvent/AcpToolCallEvent/AcpStopReason wire types
│   └── acp-result-mapper.ts  # Raw protocol output → TransportResult
└── providers/            # (empty) Reserved for per-agent transport config overrides
```

## WHERE TO LOOK

| Question | File |
|---|---|
| Register a new built-in agent tool | `factory.ts` (`BUILT_IN_AGENT_DESCRIPTORS`) |
| Add a new AgentDescriptor field | `src/types/agent.ts` first, then `factory.ts` + `descriptor-mapper.ts` |
| How does a tool call become an AuditRecord? | `transport/audit-bridge.ts` |
| How do ACP permissions reach the command rules engine? | `transport/security-bridge.ts` |
| Debug agent spawn failures | `transport/acp-transport.ts` spawn path + `transport/error-mapper.ts` |
| Runtime home bootstrap (env vars + config files) | `src/commands/agent-runtime-bootstrap.ts` |
| Types shared with transport | `transport/types.ts` |

## CONVENTIONS

- **Singleton registry**: `getAgentRegistry()` from `registry.ts` is the single source of truth for runtime agent state. Use `resetAgentRegistry()` in tests.
- **Bridge files are default-context whitelisted**: `trace-bridge`, `audit-bridge`, and `security-bridge` are registered in `check:default-context-usage`; other files in this tree must receive `InfrastructureContext` via factory or constructor.
- **ACP is the only transport**: No direct LLM calls, no black-box CLI spawn outside the ACP client. New transport strategies introduce a new `AgentTransport` impl, not a fork.
- **Built-in descriptors are frozen**: `factory.ts` `BUILT_IN_AGENT_DESCRIPTORS` is a plain constant record. Dynamic descriptor sources (user config, runtime probing) go through `registry.register()`, not through editing this map.
- **providers/ is intentionally empty**: Per-agent configuration overrides (rate limits, custom preflight specs) will live here once the config system supports them. Do not inline them into `factory.ts`.

## ANTI-PATTERNS

- ❌ Calling `getAgentRegistry()` outside of a composition root or a bridge file (triggers `check:default-context-usage`).
- ❌ Adding fields to `AgentDescriptor` without updating `descriptor-mapper.ts` and the `TransportRequest` builder call site.
- ❌ Handling spawn/timeout errors directly in `acp-client.ts` — use `error-mapper.ts` to produce a typed `TransportError`.
- ❌ Using `providers/` for temporary overrides or local dev hacks. The directory is gated for config-system integration.
- ❌ Importing `AgentDeprecatedAdapter` or any `*-adapter.ts` file — adapters have been fully removed in favour of ACP.