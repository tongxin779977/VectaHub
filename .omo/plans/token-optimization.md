# Token 节约优化(2/3/4) ✅ 已完成

## 2. explore thoroughness 默认 quick

**文件**: `AGENTS.md`
**位置**: `## Workflow Conventions` 段后新增

```markdown
## Token Discipline

- explore agent 默认用 `thoroughness: "quick"`,只在明确要求"very thorough"时才升级
- 多个独立搜索任务用 `run_in_background: true` 并行,不要串行
```

## 3. 精简低频 skill description

### vectahub-nl-behavior
**文件**: `.opencode/skills/vectahub-nl-behavior/SKILL.md`
**当前**(27 字):
```
description: Use for VectaHub natural-language intent, fallback, tool-calling, prompt, semantic acceptance, command synthesis, and NL-to-CLI behavior changes. Keeps deterministic contracts ahead of LLM output.
```
**改为**(8 字):
```
description: VectaHub NL intent, fallback, or NL-to-CLI behavior changes.
```
**省**: ~19 字 ≈ 30 token

### vectahub-safety-boundary
**文件**: `.opencode/skills/vectahub-safety-boundary/SKILL.md`
**当前**(25 字):
```
description: Use for VectaHub sandbox, command-rules, permission prompts, confirmation flow, audit, redaction, command execution, or security boundary changes. Prevents bypassing native safety semantics.
```
**改为**(9 字):
```
description: VectaHub sandbox, permission, redaction, or security boundary changes.
```
**省**: ~16 字 ≈ 25 token

**总计省**: ~55 token/会话(每个会话常驻)

## 4. 并行子代理规则

**文件**: `AGENTS.md`
**位置**: 同 Token Discipline 段

```markdown
## Token Discipline

- explore agent 默认用 `thoroughness: "quick"`,只在明确要求"very thorough"时才升级
- 多个独立搜索任务用 `run_in_background: true` 并行,不要串行
- 派发 3+ 个独立 task 时,一次性全部 `run_in_background: true`,等全部完成再收集结果
```
