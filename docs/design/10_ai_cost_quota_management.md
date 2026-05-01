# VectaHub AI 成本与配额管理设计

> 本文档定义 VectaHub 的 AI 成本追踪、配额控制、预算告警机制

---

## 0. 实现状态

| 模块 | 状态 | 说明 |
|------|------|------|
| **Token 追踪** | 🔲 待实现 | AI 执行时的 token 使用量记录 |
| **成本计算** | 🔲 待实现 | 基于 token 使用量的费用估算 |
| **配额控制** | 🔲 待实现 | 用户设定的使用上限 |
| **预算告警** | 🔲 待实现 | 达到阈值时通知用户 |

---

## 1. 设计目标

### 1.1 核心问题

AI 工具（Gemini CLI、Claude Code、Codex CLI 等）调用会产生 API 费用，用户需要：

1. **可见性**：清楚知道每个工作流消耗了多少 token 和费用
2. **可控性**：设定预算上限，避免费用失控
3. **可预测**：预估工作流执行成本
4. **可审计**：历史账单和用量明细

### 1.2 设计原则

- **本地优先**：所有数据和计算在本地完成，不依赖云端
- **透明化**：每次 AI 调用后显示预估费用
- **渐进式控制**：从软限制（告警）到硬限制（拒绝执行）
- **多币种支持**：支持 USD、CNY、EUR 等货币

---

## 2. 核心架构

### 2.1 组件图

```
┌─────────────────────────────────────────────────────────────┐
│                    AI 成本管理                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Token      │───▶│   Cost      │───▶│  Quota      │   │
│  │  Tracker    │    │  Calculator │    │  Manager    │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│         │                  │                  │           │
│         ▼                  ▼                  ▼           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Usage      │    │  Budget     │    │  Alert      │   │
│  │  Database   │    │  Policies   │    │  Engine     │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
AI 执行完成
    │
    ▼
┌─────────────────────────────────────────────────────┐
│            TokenTracker                              │
│  1. 提取 tokenUsage (input + output + cache)        │
│  2. 记录 provider、model、timestamp                 │
│  3. 存储到 Usage Database                           │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│            CostCalculator                            │
│  1. 查询当前定价表 (pricing table)                   │
│  2. 计算: input_tokens * input_price +              │
│           output_tokens * output_price              │
│  3. 返回估算成本                                     │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│            QuotaManager                              │
│  1. 检查当前周期累计用量                            │
│  2. 对比预算策略                                    │
│  3. 触发告警或拒绝执行                              │
└─────────────────────────────────────────────────────┘
```

---

## 3. 核心类型定义

### 3.1 Token 使用记录

```typescript
export interface TokenUsage {
  id: string;
  provider: string;           // gemini, claude, codex, aider
  model?: string;             // gemini-2.5-pro, claude-3-5-sonnet
  executionId: string;        // 关联的工作流执行 ID
  workflowId: string;         // 关联的工作流定义 ID
  
  // Token 计数
  inputTokens: number;        // 输入 token
  outputTokens: number;       // 输出 token
  cachedInputTokens?: number; // 缓存的输入 token (如 Gemini 缓存)
  totalTokens: number;        // 总计
  
  // 时间戳
  timestamp: Date;
  
  // 元数据
  metadata?: {
    turns?: number;           // 对话轮数
    tools?: string[];         // 使用的工具列表
    duration?: number;        // 执行耗时 (ms)
  };
}
```

### 3.2 成本记录

```typescript
export interface CostRecord {
  id: string;
  tokenUsageId: string;       // 关联的 token 使用记录
  
  provider: string;
  model: string;
  
  // 成本明细 (以微单位存储: 1 USD = 1000000 micro-USD)
  inputCost: number;          // 输入成本
  outputCost: number;         // 输出成本
  cachedInputCost?: number;   // 缓存输入成本
  totalCost: number;          // 总成本
  
  currency: string;           // USD, CNY, EUR
  
  // 定价版本
  pricingVersion: string;     // 定价表版本号
  
  timestamp: Date;
}
```

### 3.3 预算策略

```typescript
export type QuotaPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type QuotaAction = 'warn' | 'soft_limit' | 'hard_limit';

export interface BudgetPolicy {
  id: string;
  name: string;
  
  // 限额
  limit: number;              // 金额上限
  currency: string;           // 货币类型
  period: QuotaPeriod;        // 周期
  
  // 动作
  action: QuotaAction;        // 达到限额时的动作
  warnThresholds: number[];   // 告警阈值 [50%, 75%, 90%]
  
  // 范围
  scope: 'global' | 'provider' | 'workflow';
  providerFilter?: string[];  // 仅针对特定 AI 提供者
  workflowFilter?: string[];  // 仅针对特定工作流
  
  // 通知
  notifications: NotificationConfig[];
  
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface NotificationConfig {
  type: 'console' | 'email' | 'webhook' | 'slack';
  target: string;             // email 地址 / webhook URL / slack channel
  message?: string;           // 自定义消息模板
}
```

### 3.4 定价表

```typescript
export interface PricingTier {
  provider: string;
  model: string;
  
  // 价格 (per 1M tokens, 单位: USD)
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedInputPricePerMillion?: number;
  
  // 生效时间
  effectiveFrom: Date;
  effectiveTo?: Date;         // null 表示当前有效
  
  // 备注
  notes?: string;
}

// 内置定价数据 (2026-05)
export const DEFAULT_PRICING: PricingTier[] = [
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    inputPricePerMillion: 3.50,
    outputPricePerMillion: 10.50,
    cachedInputPricePerMillion: 0.88,
    effectiveFrom: new Date('2026-05-01'),
  },
  {
    provider: 'claude',
    model: 'claude-3-5-sonnet',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30,
    effectiveFrom: new Date('2026-05-01'),
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 1.25,
    effectiveFrom: new Date('2026-05-01'),
  },
  {
    provider: 'codex',
    model: 'gpt-4o-codex',
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 15.00,
    effectiveFrom: new Date('2026-05-01'),
  },
];
```

---

## 4. TokenTracker 实现

### 4.1 核心接口

```typescript
export class TokenTracker {
  private usageDb: UsageDatabase;
  private pricingTable: PricingTable;

  /**
   * 记录 AI 执行的 token 使用
   */
  async recordUsage(
    provider: string,
    model: string,
    executionId: string,
    workflowId: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<TokenUsage>;

  /**
   * 查询指定周期的 token 使用
   */
  async getUsageByPeriod(
    period: QuotaPeriod,
    provider?: string,
    workflowId?: string
  ): Promise<TokenUsageSummary>;

  /**
   * 获取历史使用记录
   */
  async getUsageHistory(
    options: {
      from?: Date;
      to?: Date;
      provider?: string;
      limit?: number;
    }
  ): Promise<TokenUsage[]>;
}

export interface TokenUsageSummary {
  period: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  executionCount: number;
  byProvider: Record<string, {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    executionCount: number;
  }>;
  byWorkflow: Record<string, {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    executionCount: number;
  }>;
}
```

### 4.2 使用数据库存储

```typescript
// 本地 SQLite 或 JSON 文件存储
export class UsageDatabase {
  private dbPath: string;

  constructor(dbPath: string = '~/.vectahub/usage.db') {
    this.dbPath = expandHome(dbPath);
  }

  async insertUsage(usage: TokenUsage): Promise<void> {
    // 追加到数据库
  }

  async queryUsage(filter: UsageFilter): Promise<TokenUsage[]> {
    // 根据条件查询
  }

  async aggregateUsage(
    period: QuotaPeriod,
    groupBy: 'provider' | 'workflow'
  ): Promise<TokenUsageSummary> {
    // 聚合统计
  }
}

export interface UsageFilter {
  from?: Date;
  to?: Date;
  provider?: string;
  workflowId?: string;
  executionId?: string;
}
```

---

## 5. CostCalculator 实现

### 5.1 核心接口

```typescript
export class CostCalculator {
  private pricingTable: PricingTable;
  private currencyConverter?: CurrencyConverter;

  /**
   * 计算单次 AI 调用的成本
   */
  calculateCost(
    provider: string,
    model: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
    },
    currency: string = 'USD'
  ): CostRecord;

  /**
   * 批量计算成本
   */
  calculateBatchCost(
    usages: TokenUsage[],
    currency: string = 'USD'
  ): CostRecord[];

  /**
   * 获取周期成本汇总
   */
  getPeriodCostSummary(
    period: QuotaPeriod,
    currency: string = 'USD'
  ): CostSummary;

  /**
   * 预估工作流执行成本
   */
  estimateWorkflowCost(
    workflowId: string,
    historicalData?: boolean
  ): CostEstimate;
}

export interface CostSummary {
  period: string;
  totalCost: number;
  currency: string;
  byProvider: Record<string, number>;
  byWorkflow: Record<string, number>;
  dailyBreakdown: {
    date: string;
    cost: number;
  }[];
}

export interface CostEstimate {
  workflowId: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  confidence: 'low' | 'medium' | 'high';
  basis: string;  // 'historical_average' | 'model_complexity' | 'user_input'
}
```

### 5.2 成本计算逻辑

```typescript
export class PricingTable {
  private tiers: PricingTier[];
  private customPricing?: Map<string, PricingTier>;

  getPricing(provider: string, model: string): PricingTier | null {
    // 优先使用自定义定价
    const key = `${provider}/${model}`;
    if (this.customPricing?.has(key)) {
      return this.customPricing.get(key)!;
    }

    // 查找当前有效的定价
    const now = new Date();
    return this.tiers.find(tier =>
      tier.provider === provider &&
      tier.model === model &&
      tier.effectiveFrom <= now &&
      (!tier.effectiveTo || tier.effectiveTo > now)
    ) || null;
  }

  calculate(
    tier: PricingTier,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens: number = 0
  ): { input: number; output: number; cached: number; total: number } {
    const inputCost = (inputTokens / 1_000_000) * tier.inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * tier.outputPricePerMillion;
    const cachedCost = cachedInputTokens
      ? (cachedInputTokens / 1_000_000) * (tier.cachedInputPricePerMillion || 0)
      : 0;

    return {
      input: inputCost,
      output: outputCost,
      cached: cachedCost,
      total: inputCost + outputCost + cachedCost,
    };
  }
}
```

---

## 6. QuotaManager 实现

### 6.1 核心接口

```typescript
export class QuotaManager {
  private policies: BudgetPolicy[];
  private tracker: TokenTracker;
  private calculator: CostCalculator;

  /**
   * 执行前检查配额
   */
  async checkQuotaBeforeExecution(
    provider: string,
    workflowId: string,
    estimatedCost?: number
  ): Promise<QuotaCheckResult>;

  /**
   * 执行后更新配额
   */
  async updateQuotaAfterExecution(
    costRecord: CostRecord
  ): Promise<QuotaCheckResult>;

  /**
   * 获取当前周期使用情况
   */
  getCurrentPeriodUsage(): Promise<PeriodUsage>;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
  remaining: number;
  percentage: number;
  triggeredPolicy?: BudgetPolicy;
  action?: QuotaAction;
}

export interface PeriodUsage {
  period: string;
  totalCost: number;
  totalTokens: number;
  executionCount: number;
  byProvider: Record<string, number>;
}
```

### 6.2 配额检查流程

```typescript
async checkQuotaBeforeExecution(
  provider: string,
  workflowId: string,
  estimatedCost?: number
): Promise<QuotaCheckResult> {
  // 1. 获取所有活跃的预算策略
  const activePolicies = this.policies.filter(p => p.isActive);

  // 2. 按范围过滤策略
  const applicablePolicies = activePolicies.filter(policy => {
    if (policy.scope === 'global') return true;
    if (policy.scope === 'provider' && policy.providerFilter?.includes(provider)) return true;
    if (policy.scope === 'workflow' && policy.workflowFilter?.includes(workflowId)) return true;
    return false;
  });

  // 3. 检查每个策略
  for (const policy of applicablePolicies) {
    const currentUsage = await this.getCurrentPeriodCost(policy);
    const remaining = policy.limit - currentUsage;

    // 如果已超限
    if (currentUsage >= policy.limit) {
      return {
        allowed: policy.action === 'hard_limit' ? false : true,
        reason: `Budget exceeded for ${policy.name}: ${currentUsage.toFixed(2)} / ${policy.limit.toFixed(2)} ${policy.currency}`,
        currentUsage,
        limit: policy.limit,
        remaining: Math.max(0, remaining),
        percentage: (currentUsage / policy.limit) * 100,
        triggeredPolicy: policy,
        action: policy.action,
      };
    }

    // 如果预估成本会超限
    if (estimatedCost && currentUsage + estimatedCost > policy.limit) {
      if (policy.action === 'hard_limit') {
        return {
          allowed: false,
          reason: `Estimated cost would exceed budget: ${estimatedCost.toFixed(2)} + ${currentUsage.toFixed(2)} > ${policy.limit.toFixed(2)}`,
          currentUsage,
          limit: policy.limit,
          remaining,
          percentage: ((currentUsage + estimatedCost) / policy.limit) * 100,
          triggeredPolicy: policy,
          action: 'hard_limit',
        };
      }
    }
  }

  return {
    allowed: true,
    currentUsage: 0,
    limit: Infinity,
    remaining: Infinity,
    percentage: 0,
  };
}
```

---

## 7. AlertEngine 实现

### 7.1 核心接口

```typescript
export class AlertEngine {
  private policies: BudgetPolicy[];
  private notifiers: Map<string, Notifier>;

  /**
   * 检查是否触发告警
   */
  async checkAlerts(usage: PeriodUsage): Promise<void>;

  /**
   * 发送通知
   */
  async sendNotification(
    config: NotificationConfig,
    context: AlertContext
  ): Promise<void>;
}

export interface AlertContext {
  policy: BudgetPolicy;
  currentUsage: number;
  limit: number;
  percentage: number;
  threshold: number;
  timestamp: Date;
}
```

### 7.2 通知器实现

```typescript
export interface Notifier {
  send(context: AlertContext, config: NotificationConfig): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async send(context: AlertContext): Promise<void> {
    console.warn(
      `⚠️ Budget Alert: ${context.percentage.toFixed(1)}% of ${context.limit} ${context.policy.currency} used`
    );
  }
}

export class WebhookNotifier implements Notifier {
  async send(context: AlertContext, config: NotificationConfig): Promise<void> {
    const payload = {
      policy: context.policy.name,
      currentUsage: context.currentUsage,
      limit: context.limit,
      percentage: context.percentage,
      threshold: context.threshold,
      timestamp: context.timestamp,
    };

    await fetch(config.target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
}

export class SlackNotifier implements Notifier {
  async send(context: AlertContext, config: NotificationConfig): Promise<void> {
    const message = `
🔔 *Budget Alert*
━━━━━━━━━━━━━━━━
Policy: ${context.policy.name}
Usage: $${context.currentUsage.toFixed(2)} / $${context.limit.toFixed(2)}
Progress: ${context.percentage.toFixed(1)}%
Threshold: ${context.threshold}%
    `.trim();

    await fetch(config.target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: config.target,
        text: message,
      }),
    });
  }
}
```

---

## 8. CLI 命令设计

### 8.1 命令列表

```bash
# 查看当前周期使用情况
vectahub cost status [--period daily|weekly|monthly] [--provider gemini|claude]

# 查看历史账单
vectahub cost history [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N]

# 查看按工作流/提供者的成本明细
vectahub cost breakdown [--by provider|workflow|date]

# 预估工作流成本
vectahub cost estimate <workflow-id>

# 设置预算策略
vectahub budget set <name> --limit <amount> --period <period> --action <action>

# 列出预算策略
vectahub budget list

# 启用/禁用预算策略
vectahub budget enable <id>
vectahub budget disable <id>

# 删除预算策略
vectahub budget delete <id>

# 设置告警通知
vectahub alert add --type webhook|email|slack --target <url> --threshold <percentage>

# 列出告警配置
vectahub alert list

# 删除告警配置
vectahub alert delete <id>

# 更新定价表
vectahub pricing update [--file pricing.json]
vectahub pricing list
```

### 8.2 命令输出示例

```bash
$ vectahub cost status

📊 AI Cost Status (Monthly: May 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Spent:        $12.45 / $50.00 (24.9%)
Total Tokens:       3,456,789
Executions:         127

By Provider:
  Gemini:           $8.20 (65.9%)
  Claude:           $4.25 (34.1%)

Budget Policies:
  ✅ Monthly Limit: $50.00 (24.9% used)
  ⚠️  Gemini Daily: $5.00  (82.0% used)
```

```bash
$ vectahub cost breakdown --by workflow

📋 Cost Breakdown by Workflow (Last 30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Workflow                  | Executions | Tokens    | Cost
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code Review Pipeline      |     45     | 1,234,567 | $4.56
Image Processing          |     23     | 567,890   | $2.10
Data Analysis             |     18     | 987,654   | $3.20
Test Generation           |     12     | 345,678   | $1.59
Custom Workflow           |     29     | 321,000   | $1.00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total                     |    127     | 3,456,789 | $12.45
```

---

## 9. 配置文件设计

### 9.1 config.yaml 扩展

```yaml
# ~/.vectahub/config.yaml

# AI 成本管理
cost:
  currency: USD
  pricingFile: ~/.vectahub/pricing.json  # 自定义定价文件
  
  # 默认预算策略
  defaultBudgets:
    - name: Monthly Limit
      limit: 50.00
      period: monthly
      action: soft_limit  # warn | soft_limit | hard_limit
      warnThresholds: [50, 75, 90]
      notifications:
        - type: console
        - type: webhook
          target: https://hooks.slack.com/services/xxx

  # 工作流特定预算
  workflowBudgets:
    code-review:
      limit: 10.00
      period: daily
      action: hard_limit

  # 提供者特定预算
  providerBudgets:
    gemini:
      limit: 5.00
      period: daily
      action: warn
```

### 9.2 自定义定价表

```json
{
  "version": "1.0.0",
  "updatedAt": "2026-05-01",
  "tiers": [
    {
      "provider": "gemini",
      "model": "gemini-2.5-pro",
      "inputPricePerMillion": 3.50,
      "outputPricePerMillion": 10.50,
      "cachedInputPricePerMillion": 0.88,
      "currency": "USD",
      "effectiveFrom": "2026-05-01"
    }
  ]
}
```

---

## 10. 场景示例

### 10.1 场景 1: 日常使用监控

```bash
# 用户设置月度预算
$ vectahub budget set monthly-limit --limit 50 --period monthly --action soft_limit

# 每次 AI 执行后显示成本
$ vectahub run "用 Gemini 审查代码"

🤖 AI 执行完成
  Provider: Gemini
  Model: gemini-2.5-pro
  Tokens: 12,345 (input: 10,000, output: 2,345)
  Cost: $0.04
  月度累计: $12.45 / $50.00 (24.9%)
✅ 完成
```

### 10.2 场景 2: 预算告警触发

```
执行前检查:
  当前使用: $45.00 / $50.00 (90%)
  预估成本: $6.00
  
  ⚠️ 警告: 执行后将超出预算
  策略: soft_limit
  
  确认继续执行? [y/N] y
```

### 10.3 场景 3: 硬限制拒绝执行

```
执行前检查:
  当前使用: $49.50 / $50.00 (99%)
  预估成本: $2.00
  
  ❌ 拒绝: 将超出预算 ($51.50 > $50.00)
  策略: hard_limit
  请调整预算或等待周期重置
```

### 10.4 场景 4: 成本优化建议

```bash
$ vectahub cost optimize

💡 Cost Optimization Suggestions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Use Gemini for code review (saves ~40% vs Claude)
2. Enable context caching for repetitive tasks (saves ~75% on input)
3. Batch similar requests together (reduces overhead)
4. Use cheaper models for simple tasks (e.g., gemini-flash vs pro)

Estimated Monthly Savings: $15.00 - $20.00
```

---

## 11. 存储设计

### 11.1 数据库 Schema

```sql
-- Token 使用记录表
CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT,
  execution_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER NOT NULL,
  timestamp DATETIME NOT NULL,
  metadata TEXT
);

-- 成本记录表
CREATE TABLE cost_records (
  id TEXT PRIMARY KEY,
  token_usage_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_cost REAL NOT NULL,
  output_cost REAL NOT NULL,
  cached_input_cost REAL DEFAULT 0,
  total_cost REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  pricing_version TEXT,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (token_usage_id) REFERENCES token_usage(id)
);

-- 预算策略表
CREATE TABLE budget_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  limit_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  period TEXT NOT NULL,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  provider_filter TEXT,
  workflow_filter TEXT,
  warn_thresholds TEXT,
  notifications TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

-- 告警历史表
CREATE TABLE alert_history (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  current_usage REAL NOT NULL,
  limit_amount REAL NOT NULL,
  percentage REAL NOT NULL,
  threshold REAL NOT NULL,
  notified BOOLEAN NOT NULL DEFAULT false,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (policy_id) REFERENCES budget_policies(id)
);

-- 索引
CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX idx_token_usage_provider ON token_usage(provider);
CREATE INDEX idx_token_usage_workflow ON token_usage(workflow_id);
CREATE INDEX idx_cost_records_timestamp ON cost_records(timestamp);
CREATE INDEX idx_alert_history_timestamp ON alert_history(timestamp);
```

---

## 12. 测试用例

### 12.1 单元测试

```typescript
describe('CostCalculator', () => {
  it('should calculate cost correctly for Gemini', () => {
    const calculator = new CostCalculator();
    const cost = calculator.calculateCost('gemini', 'gemini-2.5-pro', {
      inputTokens: 10000,
      outputTokens: 5000,
    });

    expect(cost.inputCost).toBeCloseTo(0.035, 3);   // 10000/1M * 3.50
    expect(cost.outputCost).toBeCloseTo(0.0525, 3); // 5000/1M * 10.50
    expect(cost.totalCost).toBeCloseTo(0.0875, 3);
  });

  it('should handle cached input tokens', () => {
    const calculator = new CostCalculator();
    const cost = calculator.calculateCost('gemini', 'gemini-2.5-pro', {
      inputTokens: 10000,
      outputTokens: 5000,
      cachedInputTokens: 8000,
    });

    expect(cost.cachedInputCost).toBeCloseTo(0.00704, 5); // 8000/1M * 0.88
  });
});

describe('QuotaManager', () => {
  it('should allow execution within budget', async () => {
    const quotaManager = new QuotaManager();
    await quotaManager.addPolicy({
      name: 'Monthly Limit',
      limit: 50.00,
      period: 'monthly',
      action: 'hard_limit',
    });

    const result = await quotaManager.checkQuotaBeforeExecution('gemini', 'wf_001');
    expect(result.allowed).toBe(true);
  });

  it('should reject execution when budget exceeded', async () => {
    const quotaManager = new QuotaManager();
    await quotaManager.addPolicy({
      name: 'Strict Limit',
      limit: 10.00,
      period: 'monthly',
      action: 'hard_limit',
    });

    // 模拟已使用 $9.50
    await quotaManager.recordUsage(/* ... */);

    const result = await quotaManager.checkQuotaBeforeExecution('gemini', 'wf_001', 2.00);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceed budget');
  });
});
```

---

## 13. 模块归属

| 模块 | 负责 Agent | 说明 |
|------|-----------|------|
| TokenTracker | Agent D (Executor) | 记录 AI 执行 token 使用 |
| CostCalculator | Agent G (Utils) | 成本计算引擎 |
| QuotaManager | Agent D (Executor) | 配额检查与管理 |
| AlertEngine | Agent G (Utils) | 告警通知引擎 |
| CLI 命令 | Agent A (CLI) | cost/budget/alert 命令 |
| 存储 | Agent F (Storage) | 使用数据和策略存储 |

---

## 14. 功能清单

| 功能 | 状态 | 优先级 |
|------|------|--------|
| Token 使用记录 | 🔲 待实现 | P0 |
| 成本计算 | 🔲 待实现 | P0 |
| 预算策略管理 | 🔲 待实现 | P0 |
| 执行前配额检查 | 🔲 待实现 | P0 |
| 预算告警 | 🔲 待实现 | P1 |
| Webhook 通知 | 🔲 待实现 | P1 |
| Slack 通知 | 🔲 待实现 | P2 |
| 成本预估 | 🔲 待实现 | P1 |
| 成本优化建议 | 🔲 待实现 | P2 |
| 自定义定价表 | 🔲 待实现 | P2 |
| 多币种支持 | 🔲 待实现 | P2 |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-02
status: design_complete
relatedTo:
  - docs/design/03_ai_cli_framework_design.md
  - docs/design/06_workflow_engine_design.md
  - docs/design/07_module_design.md
```
