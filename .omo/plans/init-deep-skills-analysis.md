# /init-deep + Skills Analysis

**日期**: 2026-07-24
**范围**: AGENTS.md 更新 + 项目 skills 必要性评估

---

## 1. Legit:deep Discovery 结果

### 1.1 项目结构评分

| 目录 | 文件数 | 子目录 | 评分 | 决策 |
|---|---|---|---|---|
| `./` (root) | N/A | many | — | ✅ 更新现有 AGENTS.md |
| `src/commands/` | ~28 | 1 | ~14 | ❌ 跳过(root 覆盖) |
| `src/workflow/` | ~15 | 2 | ~10 | ❌ 跳过(root 覆盖) |
| `src/agent-runtime/` | ~10 | 2 | ~8 | ❌ 跳过(transport 在 docs/01) |
| `docs/` | 11 | 0 | ~8 | ❌ 跳过(已有 README 索引) |
| `.agents/` | 已存在 | 3 | N/A | ❌ 跳过(manifest + global + permissions) |

**结论**: 无子目录 AGENTS.md 需求。仅更新 root AGENTS.md。

### 1.2 AGENTS.md 过时项

| 条目 | 问题 | 修改 |
|---|---|---|
| `src/skills/` — "skills 与 AI module 系统" | AI modules 已删除 | → "skills 系统(AI modules 已移除)" |
| `src/agent-runtime/` — "Agent CLI registry / descriptor / adapter" | adapter 已删除,新增 transport | → "Agent registry / descriptor / transport(适配器已移除)" |
| `src/nl/` — "自然语言路由" | LLM 已移除,仅剩确定性路由 | → "自然语言路由(确定性 routing,LLM 已移除)" |
| `src/workflow/` — delegate | delegate 已走 ACP transport | → "delegate 已走 ACP transport" |
| `src/commands/` | LLM 命令已移除 | → "命令实现(LLM 命令已移除)" |
| "已知文档缺口"段 | 旧文档已删除,新文档 00-09 已完成 | → 更新为 "文档集 docs/00-09 已完成,入口 docs/README.md" |
| `src/agent-runtime/acp/` | 新增的 ACP 客户端模块未提及 | → 加入 Repository Layout |
| `src/agent-runtime/transport/` | 新增的传输层模块未提及 | → 加入 Repository Layout |

---

## 2. 项目 Skills 必要性分析

### 2.1 已有 Skills (`.opencode/skills/`)

| Skill | 描述 | 必要性 | 理由 |
|---|---|---|---|
| `vectahub-contract-change` | contract/state/persistence 变更指引 | 🟢 **必要** | ACP transport 新增了契约类型,TraceBridge/AuditBridge 都需要此 skill 保证一致性 |
| `vectahub-doc-truth` | 文档真实性规范 | 🟢 **必要** | 10 个文档 00-09,交叉引用矩阵,防止 aspirational-as-implemented |
| `vectahub-verification-gate` | 验证选择映射 | 🟢 **必要** | CI 有 7 个顺序步骤,定向测试避免全量重跑 |
| `vectahub-debug-loop` | trace/audit/状态调试 | 🟢 **必要** | ACP transport 产生大量 trace/audit event,调试需要结构化方法 |
| `vectahub-nl-behavior` | NL 行为变更指引 | 🟡 **降级** | LLM 已移除,确定性路由不会频繁变更。改为"需要时加载"而非"always trigger" |
| `vectahub-safety-boundary` | 安全边界防护 | 🟢 **必要** | Redactor ACP 事件层适配待做,ACP permission 映射已存在 |

### 2.2 缺失/建议的 Skills

| 需要 | 当前状态 | 建议 |
|---|---|---|
| ACP transport 改造后的端到端测试指引 | 无 | 不需要 — `docs/03` + verification-gate 已覆盖 |
| LLM 移除后的命令行行为变化 | 无 | 不需要 — 每个命令已标记移除或保留 |
| ACP agent 配置/替换指引 | 无 | 🟡 可选 — 等 05-nl-intent 方案确定后再考虑 |

### 2.3 skill 必要性结论

**全部 6 个已有 skills 均保留**,但 `vectahub-nl-behavior` 建议降低 trigger 优先级(LLM 已移除,触发频率极低)。

**不需要新增 skill**。当前 6 个已覆盖 contract/safety/verification/debug/doc-truth 五个维度,ACP transport 改造后的工作流已被 docs/ 和现有 skills 充分覆盖。

---

## 3. 推荐执行(需用户确认)

1. **更新 AGENTS.md** — 修正 5 处过时描述 + 新增 ACP transport 模块
2. **降级 vectahub-nl-behavior** — 从"always trigger"改为"LLM-dependent code, only when NL behavior changes"(可选)
3. **其余 skills 保持不变** — 6 个全部必要,无需新增或删除