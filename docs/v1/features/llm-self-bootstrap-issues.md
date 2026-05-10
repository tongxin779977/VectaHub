# 问题与风险：LLM 自举系统

```yaml
document: issues-and-risks
version: 2.0.0
date: 2026-05-10
status: reviewed
scope: Phase 1-6 全局问题、技术债务、风险与缓解措施
related:
  - llm-self-bootstrap-feasibility.md
  - llm-self-bootstrap-design.md
  - llm-self-bootstrap-roadmap.md
  - llm-self-bootstrap-implementation.md
```

---

## 1. 已知技术债务

### 1.1 Phase 1-3 遗留债务

| 编号 | 问题 | 位置 | 严重度 | 说明 | 状态 |
|------|------|------|--------|------|------|
| TD-1 | SYNONYM_MAP 未删除 | `input-normalizer.ts` | 低 | 与 LLM-only 原则冲突，LLM 已能理解中文同义词 | ✅ Phase 4 已解决 |
| TD-2 | prompt-manager.ts effectiveness 追踪仅记录 uses 计数 | `prompt-manager.ts` | 中 | 无真实效果评估，effectiveness 字段初始值 0.85 从未更新 | ✅ Phase 4 已解决 |
| TD-3 | session-manager.ts 滑窗策略过于简单 | `session-manager.ts` | 中 | `slice(-50)` 不考虑 Token 数量，可能截断关键上下文 | ✅ Phase 4 已解决 |
| TD-4 | tool-calling.ts 仅支持静态模板 | `tool-calling.ts` | 中 | 无法动态发现用户环境中的 CLI 工具 | ✅ Phase 4 已解决 |
| TD-5 | skills/registry.ts 仅支持确定性匹配 | `skills/registry.ts` | 中 | `canHandle()` 硬匹配无法处理语义相近但关键词不同的场景 | ✅ Phase 4 已解决 |
| TD-6 | llm-fallback.ts 中的否定检测逻辑未被使用 | `llm-fallback.ts` | 低 | `shouldSuppressDueToNegation()` 和 `detectNegation()` 是好功能但未集成 | ✅ 已解决：集成到 goal-parser.ts，否定动作型意图触发 needsClarification |
| TD-7 | classifyConfidence 阈值未校准 | `matching-pipeline.ts` | 中 | 阈值（exact=0.95 等）基于旧的 keyword 匹配设定，未对齐 LLM 输出 | ✅ Phase 5 已解决 |

### 1.2 架构层面债务

| 编号 | 问题 | 影响 | 严重度 | 状态 |
|------|------|------|--------|------|
| TA-1 | 缺少 LLM 统一编排层 | Prompt/Session/Tool 逻辑散落在各消费端 | 高 | 📋 已评估：需独立设计阶段，当前模块化结构可接受 |
| TA-2 | 缺少 LLM 调用追踪 | 无法定位 LLM 失败原因 | 高 | 📋 已评估：可独立实现，建议在 LLMClient 中添加 trace 日志 |
| TA-3 | 缺少语义安全检查 | 无法防御 Prompt Injection | 中 | 📋 已评估：输入侧防护，输出侧已有 1,066 行硬规则兜底 |
| TA-4 | 缺少分层记忆架构 | 长对话会丢失关键上下文 | 中 | 📋 已评估：Phase 4 已实现 Token 估算 + 智能滑窗，分层记忆需独立设计 |
| TA-5 | 缺少性能基准 | 无法量化 LLM 路径的延迟影响 | 低 | ✅ Phase 5 已解决：NL core 28 测试 → 14ms |

---

## 2. 运行时风险

### 2.1 LLM 幻觉生成危险命令

| 维度 | 详情 |
|------|------|
| 风险等级 | **高** |
| 触发条件 | LLM 输出了看似合理但实际危险的命令 |
| 影响范围 | 数据丢失、系统损坏 |
| 现有缓解 | `sandbox/detector.ts`（500 行硬规则）+ `command-rules/engine.ts`（112 行规则引擎）+ `security-protocol/manager.ts`（416 行协议） |
| 缓解充分性 | **充分**。1,066 行安全层永不降级，即使 LLM 幻觉也能拦截 |
| 建议增加 | Phase 6 增加 Semantic Guardrails（语义安全检查），在硬规则之前增加一层语义扫描 |

### 2.2 LLM 输出不稳定

| 维度 | 详情 |
|------|------|
| 风险等级 | **中** |
| 触发条件 | 相同输入，不同时间调用 LLM 得到不同输出 |
| 影响范围 | 用户体验不一致、测试不稳定 |
| 现有缓解 | JSON Schema 约束输出格式 |
| 建议增加 | temperature=0 + 重试机制 + 输出结构化校验 |

### 2.3 LLM 服务不可用

| 维度 | 详情 |
|------|------|
| 风险等级 | **中** |
| 触发条件 | API key 过期、网络中断、服务商故障 |
| 影响范围 | 整个 NL 系统不可用（设计决策：不做降级） |
| 现有缓解 | 抛出明确错误，不做 keyword fallback |
| 建议增加 | 错误信息中包含故障排查指引（检查 API key、网络、服务商状态） |

### 2.4 Token 超限

| 维度 | 详情 |
|------|------|
| 风险等级 | **低**（已降低） |
| 触发条件 | 对话过长或项目上下文过大，超出模型 Token 限制 |
| 影响范围 | API 调用失败 |
| 现有缓解 | `session-manager.ts` Token 估算 + 智能滑窗管理（TOKEN_LIMIT=8000，自动摘要） |
| 状态 | ✅ Phase 4 已实现 `estimateTokens()` + `compactHistory()` + `summarizeHistory()` |

### 2.5 延迟增加

| 维度 | 详情 |
|------|------|
| 风险等级 | **低** |
| 触发条件 | LLM 调用比原 keyword 匹配慢 |
| 影响范围 | 用户体验（从 <50ms 增加到 500-3000ms） |
| 现有缓解 | 无 |
| 建议增加 | Phase 5 建立性能基准，Phase 6 实现意图缓存 |

### 2.6 LLM 直接生成不可执行 workflow

| 维度 | 详情 |
|------|------|
| 风险等级 | **高** |
| 触发条件 | LLM 把 intent 名称当成 CLI 命令，或直接生成不符合 executor 约定的 workflow step |
| 影响范围 | workflow 无法执行、任务误执行、错误难以定位 |
| 现有缓解 | 部分 tool-calling 结构化输出 |
| 缓解充分性 | **不足**。结构化 tool call 只能约束输入形状，不能保证最终 step 可执行 |
| 建议增加 | Phase 6 优先实现 Intent-to-Workflow Mapping：LLM 只输出 intent + 参数，由配置化映射和代码校验生成 workflow step |

---

## 3. 安全风险

### 3.1 Prompt Injection

| 维度 | 详情 |
|------|------|
| 风险等级 | **中** |
| 攻击方式 | 用户输入中嵌入"忽略之前的规则"等指令 |
| 影响范围 | LLM 可能绕过安全约束 |
| 现有缓解 | `sandbox/detector.ts` 对输出命令做硬规则检查 |
| 缓解充分性 | **部分充分**。输出侧有兜底，但输入侧无防护 |
| 建议增加 | Phase 6 实现 Semantic Guardrails 输入侧检测 |

### 3.2 敏感数据泄露

| 维度 | 详情 |
|------|------|
| 风险等级 | **中** |
| 触发条件 | 项目上下文中包含 API key、密码等敏感信息 |
| 影响范围 | 敏感信息通过 LLM API 发送到第三方服务商 |
| 现有缓解 | 无 |
| 建议增加 | ContextManager 中增加敏感信息过滤（regex 匹配 API key 模式） |

### 3.3 LLM 输出中的敏感信息

| 维度 | 详情 |
|------|------|
| 风险等级 | **低** |
| 触发条件 | LLM 在输出中包含了从输入中学到的敏感信息 |
| 影响范围 | 敏感信息被记录到日志或 Trace 中 |
| 现有缓解 | 无 |
| 建议增加 | LLMObservability 的 Trace 中对敏感字段做脱敏 |

---

## 4. 工程风险

### 4.1 测试覆盖率下降

| 维度 | 详情 |
|------|------|
| 风险等级 | **中** |
| 原因 | Phase 3 删除了大量 keyword 匹配测试，LLM 路径的测试需要 mock LLM |
| 影响 | 测试可能无法覆盖真实 LLM 行为 |
| 缓解措施 | Phase 5 建立回归测试套件（20+ 真实端到端用例） |

### 4.2 类型安全边界

| 维度 | 详情 |
|------|------|
| 风险等级 | **低** |
| 原因 | LLM 输出是 string，需要解析为结构化类型 |
| 影响 | JSON 解析可能失败 |
| 缓解措施 | 已有 `JSON.parse` try-catch，需要增加 schema 校验（如 zod） |

### 4.3 映射配置漂移

| 维度 | 详情 |
|------|------|
| 风险等级 | **中** |
| 原因 | intent tool schema、intent-step mapping、executor 支持的 step 格式可能不同步 |
| 影响 | LLM 能调用某个 intent，但映射层无法生成可执行 step |
| 缓解措施 | 为每个 intent 增加映射单元测试；CI 中校验 tool schema 与 mapping key 一致；未知 intent 直接失败 |
| 状态 | ✅ 已补齐测试，并在 CI 中运行以阻止漂移 |

### 4.4 依赖风险

| 维度 | 详情 |
|------|------|
| 风险等级 | **低** |
| 原因 | 依赖 OpenAI/Anthropic 等第三方 SDK |
| 影响 | SDK 更新可能破坏兼容性 |
| 缓解措施 | `llm-adapter.ts` 已做 provider 抽象，可隔离 SDK 变化 |

---

## 5. 已移除风险（Phase 1-3 解决）

| 风险 | 原状态 | 解决方式 |
|------|--------|---------|
| keyword 匹配精度不足 | 高 | 删除 keyword 匹配，使用 LLM |
| 降级路径代码膨胀 | 中 | 删除所有 fallback 路径 |
| coordinator.ts 复杂度 | 中 | 文件已删除 |
| verb-list.ts 维护成本 | 低 | 文件已删除 |
| 模拟代码与真实能力不一致 | 高 | 删除模拟代码，使用 LLM 原生能力 |

---

## 6. 监控指标

### 6.1 建议追踪的核心指标

| 指标 | 目标值 | 告警阈值 |
|------|--------|---------|
| LLM 调用成功率 | > 99% | < 95% |
| LLM 调用 p95 延迟 | < 2s | > 5s |
| 意图识别准确率 | > 90% | < 80% |
| 命令执行成功率 | > 95% | < 85% |
| 安全拦截率 | 记录 | N/A（任何拦截都需要 review） |
| Token 消耗/会话 | < 5000 | > 10000 |

### 6.2 监控实现建议

- Phase 6 的 LLMObservability 模块负责采集上述指标
- 指标存储在 `~/.vectahub/metrics/` 目录
- 可通过 `vectahub doctor --metrics` 命令查看

---

## 7. 技术债务处理总结

### 7.1 Phase 1-3 遗留债务（TD-1~TD-7）：全部解决

| 编号 | 解决方式 | 关键变更 |
|------|---------|---------|
| TD-1 | Phase 4.1 | 删除 SYNONYM_MAP，CJK/Non-CJK 混合匹配策略 |
| TD-2 | Phase 4.2 | `recordOutcome()` + EMA 追踪（alpha=0.3） |
| TD-3 | Phase 4.3 | `estimateTokens()` + `compactHistory()` + `summarizeHistory()` |
| TD-4 | 本次 | P0-1 修复 + CLI 工具缓存 + 安全分级 + `buildAllTools()` |
| TD-5 | Phase 4.4 | `findSkillsBySemantic()` + stem matching |
| TD-6 | 本次 | 集成 `detectNegation()` 到 `goal-parser.ts`，否定动作触发 needsClarification |
| TD-7 | Phase 5.1 | `calculateConfidence` 权重校准（max=1.0），对齐 `classifyConfidence` 阈值 |

### 7.2 架构层面债务（TA-1~TA-5）：已评估

- **TA-1~TA-4**：大型架构变更，需独立设计阶段。当前模块化结构可接受。
- **TA-5**：Phase 5 已建立性能基准。

### 7.3 P0 缺陷修复

- **P0-1**：`buildToolsFromTemplates()` 的 `!!t.name && !!t.description` filter 过滤掉全部模板。已修复：所有 INTENT_TEMPLATES 添加 `name` + `description` + `params` 字段。

### 7.4 新增能力

| 能力 | 位置 | 说明 |
|------|------|------|
| CLI 工具动态发现 | `tool-calling.ts` | `refreshCLITools()` + `buildAllTools()` + 安全分级 |
| 否定检测集成 | `goal-parser.ts` | `detectNegation()` → `negationDetected` + `needsClarification` |
| Confidence 校准 | `goal-parser.ts` | 权重 0.35/0.35/0.15/0.1/0.05，max=1.0 |
| Token 管理 | `session-manager.ts` | Token 估算 + 智能滑窗 + 自动摘要 |
