# AGENTS.md — src/nl/

> 只记本层非显然事实。父级全局规则见 `../../AGENTS.md`。

## OVERVIEW

Natural language routing: deterministic keyword/pattern matching + ACP fallback. LLM dispatch has been removed (见 `docs/08-llm-removal.md`).

## STRUCTURE

32 files, 7 subdirectories. 14 source + 11 test files at root; core/ has 10 source + 9 test.

## WHERE TO LOOK

| Concern | File(s) |
|---|---|
| Intent categories (QUERY/EXECUTE/DIALOG/GENERATE) | `types/category.ts` → `IntentCategory` enum |
| Category router (main dispatcher) | `core/category-router.ts` → `route()`, `CATEGORY_MAP`, `CATEGORY_METADATA` |
| Intent matching pipeline | `core/matching-pipeline.ts` |
| Input normalization + validation | `core/input-normalizer.ts`, `core/nl-request-validator.ts` |
| Multi-intent splitting | `core/intent-splitter.ts` |
| Goal parsing | `core/goal-parser.ts`, `core/goal-types.ts` |
| Intent → command/task synthesis | `command-synthesizer.ts` → `createTaskFromIntent()` |
| Intent templates (MATCH_MAP) | `templates/index.ts` → `INTENT_TEMPLATES` |
| NL types (NLResult, NLContext, etc.) | `types.ts` → re-exported by `core/types.ts` |
| CLI surface discovery | `discovery/command-discovery.ts` |
| Command execution | `executor/command-executor.ts` |
| Failure handling | `handler/failure-handler.ts` |
| Knowledge base + goal vocabulary | `knowledge/knowledge-base.ts`, `knowledge/goal-vocabulary.ts` |
| Capability detection (git/CI/package) | `capabilities/router.ts`, `capabilities/git-workflow.ts`, `capabilities/github-actions-repair.ts`, `capabilities/package-script.ts` |
| Session management | `session-manager.ts` |
| Parameter extraction | `param-extractor.ts` |
| Task contract integration | `task-contract-adapter.ts`, `task-contract-runtime.ts`, `task-contract-strategy.ts`, `task-contract-presentation.ts` |
| Workflow detection | `workflow-detector.ts`, `workflow-matcher.ts` |
| Intent ↔ step mapping | `intent-step-mapping.ts` |

## CONVENTIONS

- **Deterministic-first routing**: `matching-pipeline.ts` resolves intents via keyword weights, composite phrases, and negative keywords before any fallback. Match paths: `phrase` > `keyword` > `context`.
- **4 categories, 2 LLM-free**: QUERY, EXECUTE, and DIALOG are non-LLM. Only GENERATE has `requiresLLM: true` in `CATEGORY_METADATA`.
- **Category routing**: `category-router.ts` `route()` dispatches each intent to `createQueryResult`/`createExecuteResult`/`createDialogResult`/`createGenerateResult` based on `CATEGORY_MAP`. Default (unknown) → EXECUTE.
- **Templates drive synthesis**: `INTENT_TEMPLATES` in `templates/index.ts` maps intents to template categories. `command-synthesizer.ts` `createTaskFromIntent()` produces `Task[]` from template data + extracted entities.
- **Factory pattern**: `createCategoryRouter()`, `createX()` factories receive deps explicitly. No `getDefaultContext()` in this layer.
- **Capability detection is pluggable**: `capabilities/router.ts` delegates to individual capability modules. New capabilities register via the barrel `capabilities/index.ts`.
- **Tests are co-located**: every source file has a paired `*.test.ts` in the same directory.
- **LLM removed**: no LLM prompts, no token counting, no LLM config in this layer. The `core/llm-fallback.ts` file handles ACP transport fallback, not LLM dispatch.

## ANTI-PATTERNS

- **Don't skip category routing**: always go through `createCategoryRouter().route()`. Never inline category dispatch logic in callers.
- **Don't hardcode intent names**: use `IntentName` from `src/types/` and reference through `INTENT_TEMPLATES`.
- **Don't add LLM dispatch back**: LLM is deliberately removed from this layer. New LLM integration belongs in `src/skills/` or `src/chat/`, not here.
- **Don't mix deterministic and fallback paths**: `matching-pipeline.ts` should always return a best-effort match. The fallback path (ACP) is in `core/llm-fallback.ts` and invoked only when confidence is below threshold.
- **Don't bypass command-synthesizer.ts**: use `createTaskFromIntent()` to convert intents to tasks. Raw `Task` construction outside the synthesizer breaks entity extraction and template binding.
- **Don't add persistent state in NL layer**: session state belongs in `session-manager.ts` (in-memory). Persistent storage goes through `src/orchestration-plan/` or `src/execution/`.