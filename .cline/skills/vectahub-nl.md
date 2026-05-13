# VectaHub NL/LLM Module

> Natural language processing, intent matching, LLM tool calling, and command synthesis. Read this when modifying `src/nl/`.

## Architecture

```
src/nl/
├── index.ts                  # Barrel re-exports
├── types.ts                  # NL-specific types
├── orchestrator.ts           # Top-level NL orchestration
├── intent-matcher.ts         # Intent matching engine
├── intent-step-mapping.ts    # Maps intents to workflow steps
├── command-synthesizer.ts    # Synthesizes CLI commands from NL
├── command-config.ts         # Command configuration for NL
├── llm.ts                    # LLM client wrapper
├── llm-adapter.ts            # LLM adapter interface
├── llm-orchestrator.ts       # LLM call orchestration
├── param-extractor.ts        # Parameter extraction from NL input
├── prompt-manager.ts         # Prompt template management
├── session-manager.ts        # Conversation session context
├── tool-calling.ts           # LLM tool calling schema & handlers
│
├── core/                     # Core NL pipeline
│   ├── pipeline.ts               # Main NL processing pipeline
│   ├── adapter.ts                # Core adapter
│   ├── category-router.ts        # Route to category handlers
│   ├── goal-parser.ts            # Parse user goals
│   ├── goal-types.ts             # Goal type definitions
│   ├── input-normalizer.ts       # Normalize user input
│   ├── intent-splitter.ts        # Split compound intents
│   ├── matching-pipeline.ts      # Intent matching pipeline
│   └── llm-fallback.ts           # LLM fallback when NL fails
│
├── capabilities/             # Capability modules
│   ├── index.ts                  # Barrel
│   ├── types.ts                  # Capability types
│   ├── router.ts                 # Capability router
│   ├── plan-adapter.ts           # Plan-based adaptation
│   ├── git-workflow.ts           # Git workflow capabilities
│   ├── github-actions-repair.ts  # GitHub Actions repair
│   ├── package-script.ts         # Package.json script handling
│   └── user-report.ts            # User-facing reports
│
├── discovery/                # Command discovery
│   └── command-discovery.ts      # Discover available commands
│
├── executor/                 # Command execution
│   └── command-executor.ts       # Execute synthesized commands
│
└── handler/                  # Intent handlers
    └── intent-handler.ts         # Handle specific intents
```

## Processing Pipeline

```
User Input
  → input-normalizer.ts     (normalize text)
  → intent-splitter.ts      (split compound requests)
  → goal-parser.ts          (parse into Goal objects)
  → category-router.ts      (route by category)
  → matching-pipeline.ts    (match to known intents)
  → llm-fallback.ts         (LLM if no match)
  → param-extractor.ts      (extract parameters)
  → command-synthesizer.ts  (synthesize CLI command)
  → command-executor.ts     (execute)
```

## Key Patterns

### Intent Matching
- `intent-matcher.ts` matches user input to predefined intents
- Uses `config/commands/intents.yaml` for intent definitions
- Fallback to LLM when no intent matches

### Tool Calling (`tool-calling.ts`)
- Defines tool schemas for LLM function calling
- LLM returns structured tool calls
- Tool calls are mapped to VectaHub commands

### Command Synthesis (`command-synthesizer.ts`)
- Converts parsed intent + parameters into CLI command strings
- Handles option mapping and argument formatting

### Session Management (`session-manager.ts`)
- Maintains conversation context across multiple interactions
- Stores previous intents, parameters, and results
- Used by `src/chat/` for interactive mode

### Prompt Management (`prompt-manager.ts`)
- Template-based prompt construction
- System prompts, context injection, few-shot examples

## Config Files

- `config/commands/intents.yaml` — Intent definitions
- `config/commands/templates.yaml` — Command templates

## Capabilities

| Module | Purpose |
|--------|---------|
| `git-workflow.ts` | Git operations via NL |
| `github-actions-repair.ts` | Fix GitHub Actions via NL |
| `package-script.ts` | npm/yarn script handling |
| `plan-adapter.ts` | Plan-based workflow adaptation |
| `user-report.ts` | Generate user-facing reports |

## Verification

```bash
# Typecheck NL module
npm run typecheck

# Run NL-specific tests
npx vitest run src/nl/ --reporter=verbose

# Integration tests
npx vitest run src/nl/core/ --reporter=verbose
```

## Common Pitfalls

- Intent definitions in YAML must match `intent-matcher.ts` patterns
- Tool calling schemas must be valid JSON Schema
- Session context has TTL — expired sessions lose history
- LLM fallback adds latency — prefer intent matching when possible