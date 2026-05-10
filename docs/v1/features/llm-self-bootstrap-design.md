# 架构设计文档：LLM + Rule + Skill 自举系统

```yaml
document: architecture-design
version: 1.0.0
date: 2026-05-10
status: draft
scope: Phase 1-3 已实现架构 + Phase 4-6 设计方案
related:
  - llm-self-bootstrap-feasibility.md  # 可行性分析与审计结果
  - llm-self-bootstrap-roadmap.md      # 路线图与里程碑
  - llm-self-bootstrap-implementation.md  # 实施指南
  - llm-self-bootstrap-issues.md       # 问题与风险
```

---

## 1. 架构总览

### 1.0 架构定位：微型 Agent Orchestrator

VectaHub 的定位不是重型代码生成 agent，而是**微型 Agent Orchestrator**：
它负责理解用户目标、拆分任务、选择工具、下发结构化执行请求、跟踪状态并校验结果；
实际代码修改、测试修复和长任务执行交给 Aider、Claude Code、Codex CLI 等重型 agent CLI。

```
用户目标 / 开发文档
  ↓
VectaHub 微型 Agent Orchestrator
  - 解析意图
  - 拆分任务
  - 选择重型 agent CLI 或本地 CLI 工具
  - 生成结构化执行请求
  - 执行权限、安全、状态、结果校验
  ↓
重型 agent CLI / 本地 CLI 工具
  ↓
实际代码修改、测试、修复、报告输出
```

由此得到一个核心边界：LLM 可以参与理解、规划和候选生成，但默认执行路径中
**不允许 LLM 直接拼最终 shell 命令或 workflow step**。最终可执行的 workflow step
必须由确定性的映射层生成，并经过参数校验和安全规则检查。

### 1.1 当前架构（Phase 1-3 完成后）

```
┌─────────────────────────────────────────────────┐
│ 用户输入                                          │
│   ↓                                              │
│ ┌───────────────────────────────────────────┐    │
│ │ Context Builder                             │    │
│ │  L1: System Rules（.trae/rules/）           │    │
│ │  L2: Skill Knowledge（.skills/）            │    │
│ │  L3: Project Context（git/package.json）    │    │
│ │  L4: Session History（滑窗 50 条）           │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ Pipeline（LLM-Only）                        │    │
│ │  IntentSplitter → Orchestrator → LLM        │    │
│ │  tool-calling.ts → CommandSynthesizer       │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ Pre-Processing（Regex 确定性提取）           │    │
│ │  extractRunIds/Urls/Shas/FilePaths          │    │
│ │  classifyConfidence 阈值分级                 │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ Safety Layer（永不降级）                     │    │
│ │  sandbox/detector + command-rules           │    │
│ │  security-protocol                          │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ Execution Layer（确定性执行）               │    │
│ │  workflow/engine + executor                 │    │
│ │  tool-service/chain/registry                │    │
│ │  doctor.ts / self-healing.ts                │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ VS Code Extension（薄壳，委托 CLI）         │    │
│ │  planRunner → runCli()                      │    │
│ │  adapter → spawn + JSON                     │    │
│ └───────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 1.2 目标架构（Phase 6 完成后）

```
┌─────────────────────────────────────────────────────────┐
│ 用户输入                                                  │
│   ↓                                                      │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ LLMOrchestrator（新增：LLM 编排层）                    │  │
│ │  ┌───────────────────────────────────────────────┐  │  │
│ │  │ PromptManager（增强）                           │  │  │
│ │  │  - 动态 Prompt 选择（基于 effectiveness）        │  │  │
│ │  │  - A/B 测试框架                                 │  │  │
│ │  │  - Prompt 版本管理                              │  │  │
│ │  └───────────────────────────────────────────────┘  │  │
│ │  ┌───────────────────────────────────────────────┐  │  │
│ │  │ ContextManager（增强 SessionManager）            │  │  │
│ │  │  - 分层记忆：短期/中期摘要/长期 RAG              │  │  │
│ │  │  - Token 计数与智能滑窗                         │  │  │
│ │  │  - 自动摘要生成                                  │  │  │
│ │  └───────────────────────────────────────────────┘  │  │
│ │  ┌───────────────────────────────────────────────┐  │  │
│ │  │ LLMObservability（新增）                        │  │  │
│ │  │  - 全链路 Trace（输入/输出/Prompt/耗时）         │  │  │
│ │  │  - 失败案例自动收集                              │  │  │
│ │  │  - 效果度量与回归检测                            │  │  │
│ │  └───────────────────────────────────────────────┘  │  │
│ └─────────────────────┬───────────────────────────────┘  │
│                       ↓                                   │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Dynamic Tool Registry（新增）                        │  │
│ │  - 已知 CLI 工具 → 自动转 function tool              │  │
│ │  - 用户自定义工具注入                                 │  │
│ │  - Skill 语义匹配发现                                │  │
│ └─────────────────────┬───────────────────────────────┘  │
│                       ↓                                   │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Semantic Guardrails（新增）                          │  │
│ │  - 输入侧：Prompt Injection 检测                     │  │
│ │  - 输出侧：命令安全语义扫描                           │  │
│ └─────────────────────┬───────────────────────────────┘  │
│                       ↓                                   │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Safety Layer + Execution Layer（不变）                │  │
│ │  - sandbox/detector + command-rules                  │  │
│ │  - workflow/engine + executor                        │  │
│ │  - doctor.ts / self-healing.ts                       │  │
│ └─────────────────────┬───────────────────────────────┘  │
│                       ↓                                   │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ VS Code Extension（薄壳，不变）                       │  │
│ └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 核心设计：LLMOrchestrator

### 2.1 设计动机

当前 `pipeline.ts` → `orchestrator.ts` → `tool-calling.ts` 的调用链存在以下问题：
- Prompt 组装逻辑散落在 `PromptManager.buildSystemPrompt()` 和各消费端
- Session 上下文注入与 Prompt 构建耦合
- LLM 调用无统一入口，无法集中埋点

### 2.2 接口设计

```typescript
// src/nl/llm-orchestrator.ts

interface LLMOrchestratorOptions {
  promptManager: PromptManager;
  contextManager: ContextManager;
  llmAdapter: LLMAdapter;
  observability: LLMObservability;
}

interface LLMRequest {
  input: string;
  sessionId?: string;
  promptId?: string;       // 不指定则自动选择
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

interface LLMResponse {
  content: string;
  intent?: IntentMatch;
  toolCalls?: ToolCall[];
  traceId: string;         // 用于关联日志
  tokenUsage: TokenUsage;
  latencyMs: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

class LLMOrchestrator {
  async ask(request: LLMRequest): Promise<LLMResponse>;
  async selectPrompt(input: string, context?: ProjectContext): Promise<string>;
  getTrace(traceId: string): LLMTrace | undefined;
  getRecentTraces(limit?: number): LLMTrace[];
}
```

### 2.3 调用流程

```
用户输入
  ↓
LLMOrchestrator.ask(request)
  ├─ 1. observability.startTrace(request)
  ├─ 2. contextManager.buildContext(sessionId)
  ├─ 3. promptManager.selectBest(input, context)  // 动态选择
  ├─ 4. promptManager.buildSystemPrompt(id, context)
  ├─ 5. llmAdapter.complete(systemPrompt, userMessage, tools)
  ├─ 6. observability.endTrace(traceId, response)
  └─ 7. return LLMResponse
```

---

## 3. 核心设计：LLMObservability

### 3.1 Trace 数据结构

```typescript
interface LLMTrace {
  traceId: string;
  sessionId?: string;
  timestamp: Date;

  // 输入
  userInput: string;
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];

  // 输出
  rawResponse: string;
  parsedResponse: {
    intent?: string;
    confidence?: number;
    toolCalls?: ToolCall[];
  };

  // 元数据
  model: string;
  tokenUsage: TokenUsage;
  latencyMs: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;

  // 关联
  workflowId?: string;
  executionResult?: 'success' | 'failure';
}
```

### 3.2 存储策略

| 维度 | 策略 |
|------|------|
| 短期 | 内存环形缓冲区，最近 100 条 |
| 中期 | 写入 `~/.vectahub/traces/` JSON 文件 |
| 长期 | 可选上传至遥测后端 |

### 3.3 失败分析闭环

```
任务执行失败
  ↓
关联 traceId → 获取 LLMTrace
  ↓
分析：Prompt 是否完整？上下文是否丢失？输出格式是否异常？
  ↓
归类到失败案例库
  ↓
定期 review → 优化 Prompt / 调整阈值
```

---

## 4. 核心设计：Dynamic Tool Registry

### 4.1 设计动机

当前 `tool-calling.ts` 的 `buildToolsFromTemplates()` 只能从静态模板构建 tools。VectaHub 的核心价值是执行用户环境中的 CLI 命令，LLM 需要"看到"这些工具才能使用它们。

### 4.2 工具来源

```
┌─────────────────────────────────┐
│ Dynamic Tool Registry            │
│                                  │
│  来源 1: known-tools.ts          │
│    → npm/git/eslint/tsc 等       │
│    → 自动生成 function tool 定义  │
│                                  │
│  来源 2: .vectahub/tools/        │
│    → 用户自定义 CLI 工具          │
│    → 用户编写 tool schema        │
│                                  │
│  来源 3: Skills Registry         │
│    → LLM 语义匹配               │
│    → canHandle() + embedding     │
└─────────────────────────────────┘
```

### 4.3 工具自动发现流程

```typescript
interface DynamicToolRegistry {
  // 扫描 known-tools + 用户自定义
  discover(): Promise<ToolDefinition[]>;

  // LLM 语义匹配
  findRelevant(query: string, limit?: number): Promise<ToolDefinition[]>;

  // 注册用户自定义工具
  registerUserTool(tool: UserToolDefinition): void;
}
```

**从 known-tools 到 function tool 的映射示例**：

```typescript
// known-tools.ts 中的条目
{
  name: 'npm',
  checkCommand: 'npm --version',
  checkOutputRegex: /^\d+\.\d+\.\d+/,
}

// 自动生成的 function tool
{
  type: 'function',
  function: {
    name: 'run_npm',
    description: '执行 npm 命令（install, run, test, build 等）',
    parameters: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['install', 'run', 'test', 'build', 'publish', 'update'] },
        args: { type: 'array', items: { type: 'string' } },
      },
      required: ['subcommand'],
    },
  },
}
```

### 4.4 Intent-to-Workflow Mapping

Dynamic Tool Registry 只负责让 LLM 看到可调用的结构化 tool。LLM 调用 tool 后，系统还需要一层
确定性的 `Intent-to-Workflow Mapping`，把 `intent + arguments` 转换为可执行 workflow step。

默认数据流如下：

```
LLM Tool Call
  name: git_commit
  arguments: { "message": "fix bug" }
  ↓
Intent-to-Workflow Mapping
  - 查找 intent 映射
  - 校验 required 参数
  - 渲染参数模板
  - 检查 CLI 白名单和权限
  ↓
Workflow Step
  type: exec
  cli: git
  args: ["commit", "-m", "fix bug"]
  ↓
Safety Layer
  - sandbox/detector
  - command-rules
  - security-protocol
```

映射应优先配置化，而不是硬编码在 `convertToolCallToSteps()` 中：

```yaml
git_commit:
  type: exec
  cli: git
  args:
    - commit
    - -m
    - "{{message}}"
  required:
    - message

git_push:
  type: exec
  cli: git
  args:
    - push
    - "{{remote}}"
    - "{{branch}}"
  required:
    - remote
    - branch
```

代码职责：
- 读取内置映射和用户显式注册的映射
- 校验 intent 是否存在映射；不存在则失败，不回退到任意 CLI
- 校验 required 参数；缺失时失败，不让 LLM 猜默认值
- 渲染参数模板，保证带空格参数仍作为单个 `args` 元素
- 对 `cli`、`args`、工作目录、环境变量做 schema 校验
- 调用现有安全层做最终拦截

LLM 直接生成 workflow 可以作为草稿能力或低风险预览能力，但不能作为默认执行路径。

---

## 5. 核心设计：Context Manager

### 5.1 分层记忆架构

```
┌─────────────────────────────────────┐
│ Context Manager                      │
│                                      │
│  L1: 短期记忆（Working Memory）       │
│    最近 5 轮原始对话                  │
│    存储：内存                         │
│    Token 预算：~2000                  │
│                                      │
│  L2: 中期记忆（Session Summary）      │
│    LLM 自动生成的会话摘要             │
│    每 10 轮或 Token 超限时触发         │
│    Token 预算：~500                   │
│                                      │
│  L3: 长期记忆（Project Context）      │
│    项目结构、git 状态、package.json   │
│    定时刷新（TTL 5 分钟）              │
│    Token 预算：~1000                  │
│                                      │
│  L4: 领域知识（Domain Knowledge）     │
│    .trae/rules/ + .skills/           │
│    按需加载                           │
│    Token 预算：~1500                  │
└─────────────────────────────────────┘
```

### 5.2 摘要生成策略

```typescript
interface ContextManager {
  // 当对话超长时自动摘要
  summarizeIfNeeded(sessionId: string): Promise<void>;

  // 获取精简上下文（用于注入 Prompt）
  getCompactContext(sessionId: string): string;

  // Token 估算
  estimateTokens(text: string): number;
}
```

**摘要触发条件**：
- 对话轮数 > 10 轮
- 累计 Token > 3000
- 用户显式要求"继续之前的话题"

### 5.3 Token 估算

当前不需要精确的 tokenizer（如 tiktoken），使用简单估算：
- 英文：1 token ≈ 4 字符
- 中文：1 token ≈ 1.5 字符
- 代码：1 token ≈ 3 字符

---

## 6. 核心设计：Semantic Guardrails

### 6.1 设计动机

当前安全层基于硬规则匹配（`rm -rf`、`sudo` 等），但无法应对：
- 语义等价的危险命令变体
- 通过 LLM Prompt Injection 绕过安全检查
- LLM 输出的命令"看起来安全但实际危险"

### 6.2 双层防护架构

```
用户输入
  ↓
┌──────────────────────────────┐
│ Layer 1: Input Guardrail      │
│  Prompt Injection 检测        │
│  "忽略之前的规则" → 拦截       │
│  "假装你是 root" → 拦截        │
└──────────────┬───────────────┘
               ↓
         LLM 处理
               ↓
┌──────────────────────────────┐
│ Layer 2: Output Guardrail     │
│  命令语义扫描                  │
│  "删除所有日志" → 拦截         │
│  "格式化磁盘" → 拦截           │
│                                │
│  与 Safety Layer 协同           │
│  detector.ts（硬规则）兜底      │
└──────────────────────────────┘
```

### 6.3 实现策略

- **不替换**现有 `detector.ts` 硬规则，而是**在其前方增加**语义检查
- 语义检查使用**轻量级 LLM 或 embedding**，延迟 < 200ms
- 硬规则是**最终兜底**，即使语义检查通过，硬规则仍可拦截

---

## 7. 模块边界与依赖关系

### 7.1 依赖方向

```
LLMOrchestrator
  ├── depends on → PromptManager
  ├── depends on → ContextManager (SessionManager)
  ├── depends on → LLMAdapter
  ├── depends on → LLMObservability
  └── depends on → DynamicToolRegistry

Pipeline
  └── depends on → LLMOrchestrator（替代直接调用 llm-adapter）

Safety Layer
  └── depends on → 无（独立，不依赖 LLM）

Execution Layer
  └── depends on → 无（独立，不依赖 LLM）
```

### 7.2 不变模块清单

以下模块在 Phase 4-6 中**不修改**：

| 模块 | 理由 |
|------|------|
| `sandbox/detector.ts` | 安全兜底，永不修改 |
| `command-rules/engine.ts` | 安全规则引擎，永不修改 |
| `command-rules/templates.ts` | 安全规则定义，永不修改 |
| `security-protocol/manager.ts` | 安全协议，永不修改 |
| `workflow/engine.ts` | 执行引擎核心 |
| `workflow/executor.ts` | 执行引擎核心 |
| `tool-service.ts` | 进程管理基础设施 |
| `tool-chain.ts` | 工具链执行核心 |
| `tool-registry.ts` | 工具注册核心 |
| `doctor.ts` | 精确健康检查 |
| `self-healing.ts` | 已是 LLM-native |
| `generate.ts` | 已是 LLM-native |
| `system-workflows.ts` | 已知良好的系统工作流 |
| VS Code 扩展全部文件 | 已是薄壳架构 |
