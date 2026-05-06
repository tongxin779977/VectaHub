---
alwaysApply: true
description: "Core VectaHub engineering principles and interaction constraints."
---
# VectaHub Global Operating Principles (V2)

## 1. Interaction & Decision Logic
- **Precision First**: Use technical, unambiguous terminology. No conversational filler.
- **Decision Matrix**:
    - **Unidirectional (Execute)**: Atomic changes, deterministic bug fixes, or explicit user directives.
    - **Bidirectional (Proposal)**: Architectural shifts, cross-module interface changes, or >3 file impact. State tradeoffs (Latency vs. Safety vs. Complexity).
    - **Checkpoint (Block)**: Ambiguous requirements or detected security risks. Say: "Awaiting clarification on [X] due to [Y]".

## 2. Empirical Verification (The VectaHub Loop)
- **Zero-Trust Self-Assessment**: Never claim a task is "finished" without external validation output.
- **The Evidence Loop**: Code Change → `vectahub verify` (or `npm test`) → Paste Raw Output → Log Verdict.
- **Fail Fast**: Stop execution immediately on the first verification failure. Analyze root cause before retrying.

## 3. 上下文与 Token 管理 (Context & Token Hygiene)
> 注释：遵循新的 context-rules.md 策略。
- **Signal-over-Noise**: Keep `.trae` rule files ≤ 800 chars. Use `@reference` for deep documentation.
- **Module Isolation**: Only load rules relevant to the current `glob`. Do not pollute context with unrelated domain rules. Refer to `context-rules.md`.

## 4. Anti-Hallucination Protocol
- **Fact-Based Search**: If unsure about a library or internal API, `grep_search` is mandatory before implementation.
- **Real-Time Logs**: Always use `run_shell_command` to check system state (e.g., `node -v`, `git status`) rather than assuming.

```yaml
version: 13.0.0
lastUpdated: 2026-05-07
priority: P0
```
