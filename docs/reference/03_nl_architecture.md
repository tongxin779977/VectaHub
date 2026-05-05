# VectaHub NL 意图识别架构文档

> 版本: 3.0.0 | 最后更新: 2026-05-05
> 定位: 多阶段、归一化评分、支持 LLM fallback 的意图识别引擎

---

## 1. 架构总览

```
用户输入 "查找文件并提交"
    │
    ▼
┌──────────────────────────────────────────┐
│  IntentSplitter（意图拆分器）              │
│  检测连接器: 然后/并且/并/后/and/then      │
│  上下文感知: 区分"参数列表" vs "多意图"     │
│  输出: ["查找文件", "并提交"]               │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│  Coordinator（多意图编排器）                │
│  对每个分句调用 MatchingPipeline           │
│  去重: deduplicateIntents()               │
│  消歧: PrecedenceResolver（当 confidence   │
│        差值 < 0.08 时触发）                │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│  MatchingPipeline（评分管线）               │
│  1. Hard Negative 过滤（一票否决）          │
│  2. Keyword 匹配（归一化到 [0,1]）          │
│  3. Phrase 匹配（设上限 PHRASE_SCORE_CAP）  │
│  4. CLI 工具名识别（boost +0.1）            │
│  5. 归一化评分融合                          │
│  6. Confidence 分级                        │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│  LLM Fallback（可选）                      │
│  当 confidence < LOW 阈值时触发             │
│  调用 LLM 对模糊意图进行识别                │
│  实现 LLMBasedIntentRecognizer 接口即可     │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│  否定句检测（可选）                         │
│  "不要创建文件" → 检测到否定 → 抑制操作意图  │
└──────────────────────────────────────────┘
    │
    ▼
MultiIntentResult {
  isMultiIntent: true,
  intents: [{ intent: 'FILE_FIND', ... },
            { intent: 'GIT_WORKFLOW', ... }]
}
```

---

## 2. 核心模块

### 2.1 IntentSplitter（意图拆分器）

**文件**: `src/nl/core/intent-splitter.ts`

**连接器分类**：

| 类型 | 连接器 | 拆分条件 |
|------|--------|---------|
| **无条件** | 然后帮我/再帮我/并帮我/然后/接着/之后/并且 | 始终拆分 |
| **上下文感知** | 和/并/再/后/and/then/also | 前后含动词才拆分 |

**上下文感知规则**：
```typescript
// 短名词列表不拆分
"react 和 react-dom" → 不拆分（前后都是短名词）
"file1 和 file2"    → 不拆分

// 含动词才拆分
"查找文件然后提交"    → 拆分为 ["查找文件", "提交"]
"安装依赖然后构建"    → 拆分为 ["安装依赖", "构建"]
```

**动词列表**: 提取为独立模块 `verb-list.ts`，包含 40+ 中文动作动词，可配置。

### 2.2 MatchingPipeline（评分管线）

**文件**: `src/nl/core/matching-pipeline.ts`

**评分公式**（归一化版本）：

```
confidence = kwWeight × keywordScore × templateWeight
           + phWeight × phraseScore
           + btWeight × paramBoost
           - softPenaltyCount × penaltyScale

其中:
  keywordScore = Σ(matched_tier_weights) / max_possible_score  → [0, 1]
  phraseScore  = min(Σ(bonus), PHRASE_SCORE_CAP) / PHRASE_SCORE_CAP  → [0, 1]
  paramBoost   = matched_cli_count / total_cli_count  → [0, 1]
  softPenaltyCount = count(matched_soft_negatives)
```

**默认权重**:

| 信号 | 权重 | 说明 |
|------|------|------|
| 关键词 | 0.55 | 核心信号 |
| 短语 | 0.35 | 补充信号 |
| CLI 工具识别 | 0.10 | 辅助信号 |
| Soft Penalty | 0.05/个 | 降低误匹配 |

**关键词层级权重**:

| 层级 | 权重 | 示例 |
|------|------|------|
| core | 1.0 | 提交、commit、查找 |
| important | 0.8 | 推送、搜索、对比 |
| generic | 0.5 | 文件、代码、目录 |

**Confidence 分级**:

| 级别 | 阈值 | 行为 |
|------|------|------|
| HIGH | ≥ 0.70 | 直接执行 |
| MEDIUM | ≥ 0.50 | 执行但确认 |
| LOW | ≥ 0.30 | 建议确认 |
| UNCERTAIN | < 0.30 | 反问用户 |

**NegativeKeywords**:

| 强度 | 效果 | 示例 |
|------|------|------|
| hard | 一票否决，该意图直接排除 | "创建文件" 排除 GIT_WORKFLOW |
| soft | 每个扣 0.05 分 | "查找" 降低 GIT_WORKFLOW 分数 |

**Word Boundary 感知匹配**:
- 中文/CJK: 使用 `includes()`（中文无分词边界）
- 英文/ASCII: 使用 `\bword\b` 正则（"git" 不匹配 "digit"）

### 2.3 Coordinator（多意图编排器）

**文件**: `src/nl/core/coordinator.ts`

**流程**：
1. Splitter 拆分输入为 clauses
2. 对每个 clause 调用 Pipeline 评分
3. deduplicateIntents() 去重（排除重复 UNKNOWN）
4. resolveWithPrecedence() 消歧（当 confidence 差值 < 0.08）

**去重规则**：
- 多个 UNKNOWN → 只保留第一个
- 相同意图 → 只保留第一个

**消歧规则**（PrecedenceResolver）：
```
FILE_PERMISSION > CREATE_FILE
FILE_ARCHIVE > CREATE_FILE
FILE_FIND > QUERY_INFO
SYSTEM_INFO > SYSTEM_MONITOR
RUN_SCRIPT > GIT_WORKFLOW
FILE_DIFF > GIT_WORKFLOW
```

### 2.4 LLM Fallback（可选）

**文件**: `src/nl/core/llm-fallback.ts`

**接口**:
```typescript
interface LLMBasedIntentRecognizer {
  recognize(input: string, availableIntents: string[]): Promise<IntentMatch | null>;
}
```

实现此接口即可接入任意 LLM 提供商（OpenAI、Claude、Ollama 等）。

### 2.5 否定句检测（可选）

**文件**: `src/nl/core/llm-fallback.ts`

**支持的否定模式**：
- 中文：不要、别、不、没有、无需、不用、不必
- 英文：don't、do not、never、no need、not、without、avoid、skip

**智能过滤**：
- "不一定"、"不得不" 等不是真实否定
- 双重否定（"不是不"）不被识别为否定
- 仅对操作类意图（CREATE_FILE、DELETE_FILE、GIT_WORKFLOW 等）生效

---

## 3. 配置化

### 3.1 评分权重可配置

```typescript
const pipeline = createMatchingPipeline({
  thresholds: {
    high: 0.8,      // 调高 HIGH 阈值
    medium: 0.6,
    low: 0.4,
    uncertain: 0.1,
  },
  keywordWeight: 0.6,   // 提高关键词权重
  phraseWeight: 0.3,    // 降低短语权重
  boostWeight: 0.1,
  softPenaltyScale: 0.03,  // 降低 soft penalty
  tieThreshold: 0.05,
});
```

### 3.2 意图模板配置

**文件**: `src/nl/templates/index.ts`

```typescript
const INTENT_TEMPLATES = {
  FILE_FIND: {
    name: 'FILE_FIND',
    weight: 0.85,
    priority: 5,
    keywords: ['查找', '找出', 'find', 'search', ...],
    weightedKeywords: [
      { text: '查找', tier: 'core' },
      { text: '文件', tier: 'generic' },
    ],
    phrases: [
      { pattern: '查找.*文件', isRegex: true, weight: 1.0, bonus: 1.5 },
    ],
    negativeKeywords: [
      { text: '创建', strength: 'soft' },
    ],
    cli: ['find', 'fd', 'locate'],
  },
};
```

Adapter 会自动合并 `keywords` 和 `weightedKeywords`：
- `weightedKeywords` 提供精确的层级分类
- `keywords` 中的词如果不在 weightedKeywords 中，会自动按长度分类加入

---

## 4. 目录结构

```
src/nl/
├── core/
│   ├── index.ts              # 公共导出
│   ├── matching-pipeline.ts  # 评分管线（归一化版本）
│   ├── coordinator.ts        # 多意图编排
│   ├── intent-splitter.ts    # 意图拆分器
│   ├── verb-list.ts          # 动词列表（可配置）
│   ├── precedence-rules.ts   # 消歧规则
│   ├── adapter.ts            # 模板适配器
│   ├── llm-fallback.ts       # LLM fallback + 否定句检测
│   ├── pipeline.ts           # NLProcessor（编排层）
│   └── types.ts              # 内部类型
├── templates/
│   └── index.ts              # 意图模板定义（15+ 意图）
├── types.ts                  # 公共类型定义
└── index.ts                  # NL 模块公共导出
```

---

## 5. 测试状态

| 指标 | 数值 |
|------|------|
| 总测试数 | 745 |
| NL 模块测试 | 224/224 (100%) |
| 架构验证测试 | 27/27 (100%) |
| 多意图测试 | 6/6 (100%) |

---

## 6. 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-03 | 初始关键词匹配版本 |
| 2.0 | 2026-04 | 引入 LLM 集成、多意图支持 |
| 3.0 | 2026-05 | 归一化评分、PrecedenceResolver 接入、配置化、LLM Fallback 接口、否定句检测、动词列表提取 |
