# 路线图：LLM 自举系统演进规划

```yaml
document: roadmap
version: 1.0.0
date: 2026-05-10
status: draft
related:
  - llm-self-bootstrap-feasibility.md
  - llm-self-bootstrap-design.md
  - llm-self-bootstrap-implementation.md
  - llm-self-bootstrap-issues.md
```

---

## 1. 全局视图

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6
  ✅          ✅          ✅          ✅          ✅          🔶
 打开通路    简化Pipeline  删除模拟    增强基础设施  验证校准     架构升级（部分完成）
```

| Phase | 目标 | 状态 | 产出 |
|-------|------|------|------|
| Phase 1 | 打开 LLM 通路 | ✅ 完成 | pipeline.ts LLM-only |
| Phase 2 | 简化 NL Pipeline | ✅ 完成 | 删除 fallback 路径 |
| Phase 3 | 删除语言模拟代码 | ✅ 完成 | 净减少 ~1,629 行 |
| Phase 4 | 增强 LLM 基础设施 | ✅ 完成 | Prompt/Session/Tool 增强 |
| Phase 5 | 验证与校准 | ✅ 完成 | 阈值校准 + 性能基准 |
| Phase 6 | 架构升级 | 🔶 部分完成 | LLMOrchestrator + Observability |

---

## 2. Phase 1-3 回顾（已完成）

### 完成日期
2026-05-10

### 成果
- NL 系统从 2,836 行精简至 ~1,207 行（净减少 ~1,629 行）
- 删除 5 个源文件：keyword-fallback.ts、coordinator.ts、precedence-rules.ts、verb-list.ts、check.ts
- 新增 2 个文件：tool-calling.ts（72 行）、llm-adapter.ts（7 行）
- 类型系统：IntentName 扩展 18 个新意图名
- 测试：115 files, 1397 tests passed, 0 failed

### 验证证据
```
npx tsc --noEmit → 0 errors
npx vitest run → 115 files passed, 1397 tests passed, 12 skipped, 0 failed
```

---

## 3. Phase 4：增强 LLM 基础设施 ✅ 已完成

> 完成日期：2026-05-10。验证证据：115 files passed, 1415 tests passed, 12 skipped, 0 failed。

### 3.1 任务清单

| # | 任务 | 优先级 | 涉及文件 | 预估复杂度 | 状态 |
|---|------|--------|----------|-----------|------|
| 4.1 | 删除 input-normalizer.ts SYNONYM_MAP | P0 | `src/nl/core/input-normalizer.ts` + 测试 | 低 | ✅ |
| 4.2 | PromptManager 动态选择 | P1 | `src/nl/prompt-manager.ts` | 中 | ✅ |
| 4.3 | PromptManager effectiveness 追踪 | P1 | `src/nl/prompt-manager.ts` | 中 | ✅ |
| 4.4 | ContextManager 摘要生成 | P1 | `src/nl/session-manager.ts` | 高 | ✅ |
| 4.5 | ContextManager Token 估算 | P2 | `src/nl/session-manager.ts` | 低 | ✅ |
| 4.6 | DynamicToolRegistry 基础实现 | P1 | `src/nl/tool-calling.ts` + 新文件 | 高 | ✅ |
| 4.7 | SkillRegistry LLM 语义匹配 | P2 | `src/skills/registry.ts` | 中 | ✅ |

### 3.2 详细说明

#### 4.1 删除 SYNONYM_MAP（建议第一个执行）

**目标**：input-normalizer.ts 中仍保留中文→英文同义词映射，与"LLM 原生理解语言"原则冲突。

**范围**：
- 删除 `SYNONYM_MAP` 常量（第 3-19 行）
- 删除 `normalizeInput()` 中的同义词替换逻辑（第 46-63 行）
- 保留 regex 提取函数：`extractRunIds`、`extractUrls`、`extractCommitShas`、`extractFilePaths`
- 更新相关测试的期望值

**风险**：低。LLM 已经能理解中文同义词，SYNONYM_MAP 只是冗余。

#### 4.2 PromptManager 动态选择

**目标**：当用户未指定 promptId 时，自动选择最合适的 prompt。

**选择算法**：
```
score = effectiveness * 0.7 + (uses / maxUses) * 0.3
```

**实现要点**：
- 新增 `selectBest(input: string, category?: string): string` 方法
- 基于 input 的关键词匹配 + effectiveness 加权
- 当 effectiveness 差异 < 0.1 时，优先选择 uses 更多的（更成熟的 prompt）

#### 4.3 PromptManager effectiveness 追踪

**目标**：记录每次 LLM 调用的成功/失败，更新 prompt 的 effectiveness。

**实现要点**：
- 新增 `recordOutcome(promptId: string, success: boolean): void`
- 滑动窗口计算最近 100 次调用的成功率
- `effectiveness = recentSuccessRate * 0.8 + historicalSuccessRate * 0.2`
- 避免冷启动问题：新 prompt 使用默认 effectiveness 0.7

#### 4.4 ContextManager 摘要生成

**目标**：当对话过长时，自动生成摘要替代原始消息，减少 Token 消耗。

**触发条件**：
- 对话轮数 > 10 轮
- 累计 Token > 3000

**实现要点**：
- 使用 LLM 自身生成摘要（调用专用 summary prompt）
- 摘要替换原始消息，但保留最近 5 轮原始对话
- 摘要包含：用户目标、已完成的操作、当前状态

#### 4.5 ContextManager Token 估算

**目标**：粗略估算 Token 数量，用于控制上下文长度。

**实现要点**：
- 英文：1 token ≈ 4 字符
- 中文：1 token ≈ 1.5 字符
- 代码：1 token ≈ 3 字符
- 不需要精确的 tokenizer，误差容忍 20%

#### 4.6 DynamicToolRegistry 基础实现

**目标**：将 known-tools.ts 中的工具自动转化为 LLM 可用的 function tools。

**实现要点**：
- 新建 `src/nl/dynamic-tool-registry.ts`
- 从 `known-tools.ts` 读取工具定义
- 自动生成 OpenAI function calling 格式的 tool schema
- 支持注册用户自定义工具（`.vectahub/tools/`）

#### 4.7 SkillRegistry LLM 语义匹配

**目标**：使用 LLM 评估技能与用户输入的相关性，替代 `canHandle()` 硬匹配。

**实现要点**：
- 在 `findApplicableSkills()` 中增加 LLM 评分
- 候选技能列表 → LLM 排序 → 返回 top-N
- 保留 `canHandle()` 作为快速预过滤

### 3.3 执行顺序

```
4.1 SYNONYM_MAP 删除（0.5 天）
  ↓
4.5 Token 估算（0.5 天）
  ↓
4.2 PromptManager 动态选择（1 天）
  ↓
4.3 effectiveness 追踪（1 天）
  ↓
4.4 摘要生成（2 天）
  ↓
4.6 DynamicToolRegistry（2 天）
  ↓
4.7 SkillRegistry 语义匹配（1 天）
```

**总计约 8 个工作日**

---

## 4. Phase 5：验证与校准 ✅ 已完成

> 完成日期：2026-05-10。验证证据：1415 tests passed, NL core 28 tests → 14ms, full suite → 27s。

### 4.1 任务清单

| # | 任务 | 涉及文件 | 说明 | 状态 |
|---|------|----------|------|------|
| 5.1 | LLM confidence 校准 | `matching-pipeline.ts` + 测试 | 对齐 LLM 输出与 classifyConfidence 阈值 | ✅ |
| 5.2 | 领域冲突规则等价性测试 | `templates/index.ts` + 新测试 | 确保迁移到 prompt 的规则与原规则等价 | ✅ |
| 5.3 | 性能基准测试 | 新建 `benchmarks/` | LLM 路径 vs 原 keyword 路径延迟对比 | ✅ |
| 5.4 | 降级策略端到端测试 | `pipeline.test.ts` | LLM 不可用时的错误处理 | ✅ |
| 5.5 | 回归测试套件 | 新建 `regression/` | 20+ 真实用户输入的端到端测试 | ✅ |

### 4.2 详细说明

#### 5.1 LLM Confidence 校准

**问题**：LLM 输出的 confidence 值（0-1）与 `classifyConfidence` 的阈值（exact=0.95, high=0.85, medium=0.7, low=0.5）可能不对齐。

**方法**：
1. 收集 100+ 测试输入
2. 记录 LLM 输出的 confidence
3. 人工标注真实置信度
4. 调整阈值或 prompt 中的置信度引导

#### 5.2 领域冲突规则等价性测试

**问题**：Phase 3 删除了 `precedence-rules.ts` 中的领域冲突规则，这些规则现在隐含在 prompt 中。需要验证 LLM 能正确处理冲突场景。

**测试用例**：
- "git commit 并运行测试" → 应拆分为两个意图
- "修复 CI 并提交" → 应先修复再提交
- "分析代码质量" → 不应触发文件删除

#### 5.3 性能基准测试

**指标**：
| 场景 | 目标延迟 |
|------|---------|
| 简单意图（"git commit"） | < 1s |
| 复杂意图（"分析日志并修复"） | < 3s |
| Agent 委托（多轮） | < 8s |

**方法**：
1. 固定测试集（20 个场景）
2. 每个场景跑 10 次
3. 记录 p50 / p95 / p99 延迟
4. 与原 keyword 路径对比（如果可复现）

### 4.3 执行顺序

```
5.1 confidence 校准（2 天）
  ↓
5.2 等价性测试（2 天）
  ↓
5.3 性能基准（1 天）
  ↓
5.4 降级测试（0.5 天）
  ↓
5.5 回归测试套件（2 天）
```

**总计约 7.5 个工作日**

---

## 5. Phase 6：架构升级

> 状态：✅ 全部完成（6.0-6.5 所有任务已闭环，防漂移测试已补充，系统可观测性与分层记忆已就绪）

### 5.1 任务清单

| # | 任务 | 优先级 | 涉及文件 | 说明 | 状态 |
|---|------|--------|----------|------|------|
| 6.0 | Intent-to-Workflow Mapping | P0 | `src/nl/intent-step-mapping.ts` + 测试 | LLM tool call 到 workflow step 的确定性转换 | ✅ 完成 / 已验证 |
| 6.1 | LLMOrchestrator 抽取 | P1 | `src/nl/llm-orchestrator.ts` + 测试 | 统一 LLM 调用入口，返回 traceId/latencyMs | ✅ 完成 / 已验证 |
| 6.2 | LLMObservability 实现 | P1 | `src/nl/observability/` | 完整 trace 生命周期记录 | ✅ 完成 / 已验证 |
| 6.3 | Semantic Guardrails | P2 | 新建 `src/sandbox/semantic-detector.ts` | 语义安全检查 | ✅ 完成 / 已接入验证 |
| 6.4 | 分层记忆架构 | P2 | 重构 `session-manager.ts` | 短期/中期/长期记忆 | ✅ 完成 / 已验证 |
| 6.5 | Pipeline 重构 | P1 | `src/nl/core/pipeline.ts` | 删除 UNKNOWN 降级路径，依赖 LLM tool calling | ✅ 完成 / 已验证 |

### 5.1.1 当前验收状态

| 项目 | 状态 | 说明 |
|------|------|------|
| 主链路集成验收 | ✅ 已完成 | ABCD 产出的 `LLM tool call → mapper → workflow step → pipeline` 闭环已验收 |
| 代码审查 | ✅ 已完成 | 已审查 mapper、tool-calling、pipeline、orchestrator 的职责边界与失败策略 |
| 6.3 轻量 Semantic Guardrails | ✅ 已完成并接入验证 | 43 单测 + 7 输入侧集成测试 + 7 输出侧集成测试，pipeline + executor 主链路已接入 |
| Mapping 漂移测试 | ✅ 已完成并验证 | 校验 tool schema、intent-step mapping、executor step 格式一致，防腐层构建完毕 |

### 5.2 详细说明

参见 [llm-self-bootstrap-design.md](./llm-self-bootstrap-design.md) 第 2-6 章节。

Phase 6 必须先完成 `Intent-to-Workflow Mapping`。VectaHub 的定位是微型 Agent Orchestrator：
LLM 负责输出结构化 intent 和参数，真正可执行的 workflow step 由配置化映射和代码校验生成。
默认路径不允许 LLM 直接拼最终 shell 命令。

### 5.3 执行顺序

```
6.0 Intent-to-Workflow Mapping（2 天）
  ↓
6.1 LLMOrchestrator（3 天）
  ↓
6.5 Pipeline 重构（2 天）
  ↓
6.2 Observability（2 天）
  ↓
6.4 分层记忆（3 天）
  ↓
6.3 Semantic Guardrails（2 天）
```

**总计约 14 个工作日**

### 5.4 多 Agent 并行建议

Phase 6 可以并行推进，但必须保持清晰依赖边界：

```
Agent A: Intent-to-Workflow Mapping 接口稳定
  ↓
Agent B: Tool Calling + Pipeline 接入
  ↓
Agent D: 主链路回归验收
  ↑
Agent C: LLMOrchestrator 薄编排层可并行开发，最后接入 Pipeline
```

并行执行时，`pipeline.ts` 和 `tool-calling.ts` 由 Agent B 统一收口，避免多个 agent 同时修改主链路。
详细职责、完成信号和测试边界参见
[llm-self-bootstrap-implementation.md](./llm-self-bootstrap-implementation.md) 的“Phase 6 多 Agent 并行执行计划”。

---

## 6. 总体时间线

```
Week 1:  Phase 4.1-4.3（SYNONYM 删除 + PromptManager 增强）
Week 2:  Phase 4.4-4.6（ContextManager + DynamicToolRegistry）
Week 3:  Phase 4.7 + Phase 5.1-5.2（Skill 匹配 + 校准测试）
Week 4:  Phase 5.3-5.5（性能基准 + 回归测试）
Week 5-6: Phase 6（架构升级）
Week 7:  Buffer + Bug Fix
```

---

## 7. 里程碑

| 里程碑 | 验收标准 | 目标日期 |
|--------|---------|---------|
| M4.1 | SYNONYM_MAP 删除，测试通过 | Phase 4 第 1 天 |
| M4.2 | PromptManager 动态选择 + effectiveness 追踪 | Phase 4 第 3 天 |
| M4.3 | ContextManager 摘要 + Token 估算 | Phase 4 第 6 天 |
| M4.4 | DynamicToolRegistry 基础实现 | Phase 4 第 8 天 |
| M5.1 | LLM confidence 校准完成 | Phase 5 第 2 天 |
| M5.2 | 性能基准报告输出 | Phase 5 第 5 天 |
| M5.3 | 回归测试套件 20+ 用例 | Phase 5 第 7 天 |
| M6.0 | Intent-to-Workflow Mapping 可执行闭环 | Phase 6 第 2 天 |
| M6.1 | LLMOrchestrator + Pipeline 重构 | Phase 6 第 7 天 |
| M6.2 | Observability + 分层记忆 | Phase 6 第 12 天 |
| M6.3 | Semantic Guardrails + 全量测试通过 | Phase 6 第 14 天 |

---

## 8. 决策记录

| 编号 | 决策 | 理由 | 日期 |
|------|------|------|------|
| D1 | 不考虑 LLM 降级 | 架构更简洁，行为更可预测 | 2026-05-10 |
| D2 | 保留 regex 确定性提取 | LLM 可能截断 SHA/RunID，确定性提取不可替代 | 2026-05-10 |
| D3 | 突破 VS Code 扩展通信屏障 | Phase 8 决议：为支持 vscode_diagnostic 等高级意图，修改 VSCode 扩展建立与 Daemon 的双向通信 | 2026-05-10 |
| D4 | doctor.ts 不 LLM 化 | 健康检查需要确定性执行，不能靠推测 | 2026-05-10 |
| D5 | Phase 6 引入 LLMOrchestrator | 统一入口，便于埋点和扩展 | 2026-05-10 |
| D6 | LLM 不直接生成最终 workflow step | VectaHub 是微型 Agent Orchestrator，最终执行必须经过配置化映射、参数校验和安全层 | 2026-05-10 |
展不动 | 已是薄壳，改动无收益 | 2026-05-10 |
| D4 | doctor.ts 不 LLM 化 | 健康检查需要确定性执行，不能靠推测 | 2026-05-10 |
| D5 | Phase 6 引入 LLMOrchestrator | 统一入口，便于埋点和扩展 | 2026-05-10 |
| D6 | LLM 不直接生成最终 workflow step | VectaHub 是微型 Agent Orchestrator，最终执行必须经过配置化映射、参数校验和安全层 | 2026-05-10 |
