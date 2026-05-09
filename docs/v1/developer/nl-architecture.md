# VectaHub NL 意图识别架构文档

> 版本: 1.1.1
> 最后更新: 2026-05-09

本文档描述了 VectaHub 自然语言处理（NL）引擎的内部逻辑、当前实现与 1.0 后续改造方向。

## 1. 处理流程

当前系统对用户输入的自然语言按以下顺序进行处理：

1.  **拆分 (IntentSplitter)**: 识别连接词（如“然后”、“并”），将输入拆分为多个独立的语句。
2.  **匹配 (MatchingPipeline)**: 针对每个语句，结合关键词权重、短语正则及 CLI 模式进行评分。
3.  **编排 (Coordinator)**: 汇总匹配结果，执行去重逻辑，并根据预定义优先级处理意图冲突。
4.  **回退 (LLM Fallback)**: 当置信度较低时，可选调用配置的 LLM 进行进一步识别。

### 1.1 目标架构：Goal/Capability 路由

当前基于 intent template 的链路可以识别大量固定模式，但对“动作 + 领域 + 范围 + 成功标准”组合型目标支持不足。例如用户输入“修复 git 上所有 actions 错误”时，系统不应只命中某个关键词模板并输出 Action ID，而应理解为：

```json
{
  "action": "repair",
  "domains": ["github-actions", "ci"],
  "target": "failure",
  "scope": "all",
  "successCriteria": ["ci-green"]
}
```

因此 1.0 后续架构应升级为：

```text
用户输入
  -> Input Normalizer
  -> Goal Parser
  -> Capability Router
  -> ExecutionPlan Builder
  -> Workflow Engine / Direct Runner
  -> User Report
```

详细 agent 执行方案见 `docs/v1/developer/nl-goal-capability-execution-plan.md`。

## 2. 核心模块说明

### 2.1 意图拆分器 (IntentSplitter)
负责将复合指令拆分为原子操作。例如，“查找文件并提交”会被拆分为“查找文件”与“提交”。系统通过预定义的动词列表区分“参数列表”与“独立操作”。

### 2.2 评分管线 (MatchingPipeline)
根据以下信号计算意图的置信度：
-   **关键词**: 支持 core (1.0), important (0.8), generic (0.5) 三级权重。
-   **短语**: 匹配特定正则模式。
-   **CLI 识别**: 匹配常见的工具名称。
-   **负面约束**: 命中特定词汇（如“不要”）时降低评分或直接阻断。

### 2.3 置信度分级
-   **High (≥ 0.70)**: 对应意图明确，支持自动执行。
-   **Medium (≥ 0.50)**: 意图基本匹配，通常建议预览。
-   **Low (≥ 0.30)**: 匹配度较低，建议用户确认。

### 2.4 输入标准化 (Planned)

`Input Normalizer` 在进入 intent matching 前执行，负责：

- 清洗原始输入并保留 `rawText`。
- 提取 tokens 与 normalized terms。
- 识别 GitHub Actions run URL、run id、commit SHA、文件路径、package script 等证据。
- 将同义词归一化，例如“修复/处理/解决/fix”归一到 `repair`，“错误/失败/红了/failed”归一到 `failure`。

该层不得决定执行哪个命令或 workflow。

### 2.5 Goal Parser (Planned)

`Goal Parser` 将标准化输入转换为结构化目标：

```typescript
interface ParsedGoal {
  action: 'repair' | 'analyze' | 'run' | 'create' | 'delete' | 'search' | 'explain' | 'unknown';
  domains: string[];
  target?: string;
  scope: 'all' | 'selected' | 'current' | 'latest' | 'unknown';
  successCriteria: string[];
  constraints: string[];
  evidence: Record<string, unknown>;
  confidence: number;
  needsClarification: boolean;
}
```

示例规则：

- “修复 git 上所有 actions 错误”应解析为 `repair + github-actions + failure + all`。
- “提交代码”应解析为普通 `git` 操作。
- “修复登录 bug”不应进入 GitHub Actions 能力。

### 2.6 Capability Router (Planned)

`Capability Router` 根据 `ParsedGoal` 和项目上下文选择系统能力。能力声明自己能处理的目标，而不是依赖用户原句。

```typescript
interface Capability {
  id: string;
  canHandle(goal: ParsedGoal, context?: ProjectContext): CapabilityMatch;
  plan(goal: ParsedGoal, context?: ProjectContext): ExecutionPlan;
}
```

首批能力：

- `github-actions-repair`: 处理 CI/GitHub Actions 失败发现、诊断、修复、验证和报告。
- `git-workflow`: 处理 commit、push、pull、branch、merge 等普通 Git 操作。
- `package-script`: 处理 test、build、lint 等 package script。

当 `git` 与 `actions/ci/workflow failure` 同时出现时，`git` 只能作为平台提示，不能让普通 `git-workflow` 胜出。

## 3. 意图模板配置

意图模板定义了特定意图的识别特征。
文件位置: `src/nl/templates/index.ts`

```typescript
const INTENT_TEMPLATES = {
  FILE_FIND: {
    name: 'FILE_FIND',
    keywords: ['查找', 'find', 'search'],
    weightedKeywords: [
      { text: '查找', tier: 'core' },
      { text: '文件', tier: 'generic' }
    ],
    cli: ['find', 'fd']
  }
};
```

## 4. 实现限制
-   **语义理解**: 目前主要依赖模式匹配，对语义极其复杂的表述可能识别不准。
-   **多意图衔接**: 子任务间的上下文传递（如第一个任务的输出作为第二个任务的输入）目前支持有限。
-   **目标理解**: 当前 intent template 不能稳定表达 action、domain、target、scope、successCriteria 等槽位。
-   **输出分层**: 当前部分 workflow 会把内部 stdout 直接作为用户输出，后续应区分 internal output 与 user report。

---
**核验状态**: 已通过 220+ 单元测试验证。
