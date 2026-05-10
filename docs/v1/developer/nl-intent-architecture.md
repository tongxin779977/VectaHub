# VectaHub NL 意图识别架构文档

> 版本: 2.0.0 (Phase 6)
> 最后更新: 2026-05-10

本文档描述了 VectaHub 自然语言处理（NL）引擎的内部逻辑及架构设计。

## 1. 整体架构

VectaHub Phase 6 采用基于 LLM Tool Calling 和强类型防腐层的新架构：

```text
用户输入
  -> LLM Intent Extraction (大模型意图提取)
  -> Semantic Guardrails (语义护栏)
  -> Deterministic Workflow Mapping (确定性工作流映射)
  -> Execution Engine (执行引擎)
  -> User Report (用户报告)
```

## 2. 核心模块说明

### 2.1 LLM 意图提取 (LLM Intent Extraction)
通过 LLM 进行意图识别和参数提取：
- 调用 LLM 分析用户输入，识别意图类型
- 提取参数并生成结构化输出（tool call 格式）
- 支持多意图识别和拆分

### 2.2 语义护栏 (Semantic Guardrails)
验证意图合法性，保障系统安全：
- **输入侧**：检测 Prompt Injection 攻击（如"忽略之前的规则"）
- **输出侧**：命令安全语义扫描，检测危险命令变体
- 与安全层协同工作，`detector.ts` 硬规则作为最终兜底

### 2.3 确定性工作流映射 (Deterministic Workflow Mapping)
将 LLM 输出的 intent + arguments 转换为可执行的 workflow step：
- **Schema 驱动**：基于配置化的映射规则
- **类型安全**：严格的参数校验
- **防映射漂移**：定期验证 tool schema 与 mapper 的一致性
- **失败策略**：未知 intent 或缺少 required 参数时直接失败，不回退到任意 CLI

### 2.4 执行计划与用户报告 (ExecutionPlan & UserReport)
映射成功后，生成标准化的 `ExecutionPlan`：
- **计划适配**：通过适配层转化为底层引擎可执行的 `Step[]` 列表
- **内部步骤隔离**：标记为 `internal` 的步骤只用于辅助执行
- **预览与输出**：Dry-run 模式和执行后通过 `UserReport` 生成精简报告

## 3. 分层记忆系统

| 层级 | 名称 | 存储时长 | 用途 |
|------|------|----------|------|
| **L1** | 会话记忆 | 当前会话（最近 5 轮） | 对话上下文保持 |
| **L2** | 工作流记忆 | 执行期间（LLM 自动摘要） | 步骤间状态传递 |
| **L3** | 长期记忆 | 持久化 | 历史执行记录、知识沉淀 |

## 4. LLMObservability

系统内置完整的 LLM 可观测性能力：
- **意图追踪**：记录每次 LLM 调用的输入输出、Prompt、工具列表
- **性能监控**：追踪响应时间和调用频率
- **成本估算**：基于 token 消耗计算 API 成本
- **质量评估**：意图匹配准确率统计

## 5. 实现边界与限制
- **LLM 的作用**：LLM 负责意图识别和参数提取，但不直接生成最终 shell 命令。最终的执行计划由确定性的映射层负责构建。
- **无降级策略**：LLM 不可用时直接报错，不做 keyword fallback。
- **行为安全**：系统不会自动执行高风险操作。危险命令必须经过安全层检测和用户确认。
