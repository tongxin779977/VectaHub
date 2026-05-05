# VectaHub Global Rules

TypeScript CLI workflow engine. NL/YAML → workflow → execution.

**Do directly**: Single file, "直接改", run tests/build
**Ask first**: 2+ options, 3+ files, change interface
**Say "需要确认 X"**: When uncertain

**Anti-Hallucination**: Research first. Fact-based. No fabrication. Paste actual output. No fake settings.

**Verification**: After code change → `vectahub verify` → paste output → fix failures.

**File Limit**: `.trae/` files ≤ 800 chars. Split when over.

```yaml
version: 12.0.0
lastUpdated: 2026-05-04
```
