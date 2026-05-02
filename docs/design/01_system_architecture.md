# VectaHub 技术架构设计

> 版本: 6.0.0 | 最后更新: 2026-05-02
> 定位: 本地自然语言工作流引擎

---

## 0. 实现状态

| 模块 | 状态 | 说明 |
|------|------|------|
| **CLI 框架** | ✅ 已实现 | Commander.js + 审计日志 + 工具注册 |
| **NL Parser** | ⚠️ 部分实现 | 规则匹配已完成，LLM 待接入核心路径 |
| **Workflow Engine** | ✅ 已实现 | 顺序/条件/循环/并行，暂停/恢复 |
| **Executor** | ✅ 已实现 | 五种步骤类型 |
| **Sandbox** | ✅ 已实现 | 三层检测 + macOS sandbox-exec + Linux bubblewrap |
| **CLI Tools Registry** | ✅ 已实现 | git/npm/docker/curl + 搜索/分类 |
| **LLM Client** | ✅ 已实现 | OpenAI/Anthropic/Ollama，但未接入 run 命令 |

---

## 1. 系统架构

### 1.1 三层架构

```
┌─────────────────────────────────────────────────┐
│   第 1 层：智能交互层                             │
│   "说人话，做复杂事"                              │
│   - LLM 意图解析（待接入核心路径）                 │
│   - 关键词匹配降级                                │
│   - YAML 工作流编辑                              │
│   - 命令编辑器审查                                │
├─────────────────────────────────────────────────┤
│   第 2 层：工作流引擎层                           │
│   "条件、循环、并行、依赖"                        │
│   - 步骤编排（exec/if/for_each/parallel/opencli） │
│   - 上下文传递                                   │
│   - 暂停/恢复/中止                               │
│   - DryRun 模式                                  │
├─────────────────────────────────────────────────┤
│   第 3 层：安全执行层                             │
│   "安全、隔离、审计"                              │
│   - 安全协议引擎（17条规则）                      │
│   - 命令黑白名单                                 │
│   - 危险命令正则检测                             │
│   - 多平台沙箱（macOS/Linux）                    │
└─────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **NL Parser** | 自然语言 → 结构化任务 | `"压缩图片"` | `TaskList` 或 `LLMResponse` |
| **Workflow Engine** | 管理工作流生命周期 | `Workflow` | `ExecutionRecord` |
| **Executor** | 执行步骤（含安全检测） | `Step` | `StepResult` |
| **Sandbox** | 隔离执行环境 | `CLI command` | `result + logs` |
| **LLM Client** | 调用 LLM API | `user input` | `structured response` |
| **Storage** | 持久化工作流 | `Workflow object` | `file system` |

### 1.3 数据流

```
用户输入自然语言
    │
    ▼
┌─────────────────────────────────────┐
│         run.ts（命令入口）            │
│  检查 LLM 配置                       │
│  ├─ 可用 → LLM 解析                 │
│  └─ 不可用 → 关键词匹配降级          │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│      NL Parser / LLM Parser          │
│  1. 识别意图                         │
│  2. 提取参数                         │
│  3. 生成任务列表                     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│       Command Editor                 │
│  用户审查/编辑生成的命令              │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│      Workflow Engine                 │
│  1. 构建 Workflow 对象               │
│  2. 拓扑排序                         │
│  3. 发送到 Executor                  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│         Executor                     │
│  1. 安全检查（三层检测）             │
│  2. 沙箱执行                         │
│  3. 记录结果                         │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│      Execution Log                   │
│  状态/输出/耗时/错误                  │
└─────────────────────────────────────┘
```

---

## 2. 核心数据结构

### 2.1 Workflow

```typescript
interface Workflow {
  id: string;                    // wf_001
  name: string;                  // "压缩图片"
  description?: string;          // "压缩当前目录所有图片"
  mode: 'strict' | 'relaxed' | 'consensus';
  steps: Step[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.2 Step

```typescript
interface Step {
  id: string;                    // step_1
  type: 'exec' | 'for_each' | 'if' | 'parallel' | 'opencli';
  
  // exec 类型
  cli?: string;                  // "find"
  args?: string[];               // [".", "-name", "*.jpg"]
  
  // opencli 类型
  site?: string;                 // "hackernews"
  command?: string;              // "top"
  
  // 控制流
  body?: Step[];                 // for_each/if 的嵌套步骤
  condition?: string;            // "${step1.exitCode} == 0"
  dependsOn?: string[];          // ["step1"]
  items?: string;                // "step1.output"
  outputVar?: string;            // "found_files"
}
```

### 2.3 ExecutionRecord

```typescript
interface ExecutionRecord {
  executionId: string;           // exec_001
  workflowId: string;            // wf_001
  workflowName: string;          // "压缩图片"
  status: 'COMPLETED' | 'FAILED' | 'ABORTED' | 'PAUSED';
  mode: string;
  startedAt: string;
  endedAt?: string;
  duration: number;              // ms
  steps: StepResult[];
  warnings: string[];
  logs: string[];
}
```

### 2.4 LLMResponse

```typescript
interface LLMResponse {
  intent: string;                // "FIND_FILES"
  confidence: number;            // 0.0 - 1.0
  params: Record<string, unknown>;
  workflow: {
    name: string;
    steps: {
      type: 'exec' | 'for_each' | 'if' | 'parallel';
      cli?: string;
      args?: string[];
    }[];
  };
}
```

---

## 3. NL 解析系统

### 3.1 当前实现：关键词匹配

```
输入文本 → 转小写 → 分词 → 匹配关键词 → 计算置信度 → 返回最高分意图
```

**局限**：无法理解语义，只能匹配预定义关键词。

### 3.2 LLM 增强解析（待接入）

**流程**：
```
用户输入 → LLMClient.complete() → 结构化 JSON 响应 → 转换为 TaskList
```

**Prompt 示例**：
```
你是一个工作流解析专家。用户输入一段自然语言，你需要：
1. 识别用户意图（从列表中选择）
2. 提取关键参数
3. 生成标准化的工作流步骤

支持意图：FIND_FILES, GIT_WORKFLOW, CI_PIPELINE, ...

输出 JSON：
{
  "intent": "...",
  "confidence": 0.95,
  "params": {},
  "workflow": {
    "name": "...",
    "steps": [
      { "type": "exec", "cli": "find", "args": ["..."] }
    ]
  }
}
```

---

## 4. 工作流引擎

### 4.1 状态机

```
PENDING ──▶ RUNNING ──▶ COMPLETED
              │   │
              │   ├──▶ PAUSED ──▶ RESUMED
              │   │
              │   └──▶ FAILED ──▶ (retry) ──▶ RUNNING
              │
              └──▶ ABORTED
```

### 4.2 执行流程

```
1. 加载 Workflow
2. 拓扑排序（处理 dependsOn）
3. 按序执行步骤
   ├─ exec: 执行 CLI 命令
   ├─ if: 评估条件，执行 body
   ├─ for_each: 循环执行 body
   ├─ parallel: 并行执行 body（Promise.all）
   └─ opencli: 调用 OpenCLI 工具
4. 记录 ExecutionRecord
```

### 4.3 条件表达式（当前限制）

仅支持两种模式：
- `${stepId.exitCode} == 0`
- `varName == value`

不支持逻辑运算符、比较运算符、或任意表达式。

---

## 5. 安全执行层

### 5.1 三层检测

```
1. CommandRuleEngine（黑白名单）
   ├─ 命中黑名单 → 拒绝
   └─ 命中白名单 → 放行

2. SecurityProtocolManager（安全协议）
   ├─ 17 条内置规则
   └─ 支持增删改查

3. DangerDetector（正则检测）
   ├─ 系统级危险（sudo, rm -rf /）
   ├─ 文件系统危险（覆写系统文件）
   └─ 网络危险（iptables）
```

### 5.2 执行模式

| 模式 | 非危险命令 | 危险命令 | 适用场景 |
|------|-----------|----------|----------|
| STRICT | 自动执行 | 报错 | CI/CD |
| RELAXED | 自动执行 | 报错 | 开发调试 |
| CONSENSUS | 确认后执行 | 确认后执行 | 交互执行 |

### 5.3 沙箱隔离

| 平台 | 方案 | 需要 sudo | 说明 |
|------|------|----------|------|
| macOS | sandbox-exec | ❌ | 系统级隔离 |
| Linux | bubblewrap | ✅ | 容器级隔离 |
| 降级 | 目录隔离 | ❌ | 仅限制 cwd |

---

## 6. LLM 集成

### 6.1 支持提供商

| 提供商 | 环境变量 | 端点 |
|--------|----------|------|
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| Anthropic | `ANTHROPIC_API_KEY` | `https://api.anthropic.com/v1` |
| Ollama | `OLLAMA_API_KEY` | 本地端点 |

### 6.2 配置

```bash
VECTAHUB_LLM_PROVIDER=openai
VECTAHUB_LLM_MODEL=gpt-4o-mini
VECTAHUB_LLM_BASE_URL=https://api.openai.com/v1
```

### 6.3 当前使用位置

| 命令 | 是否使用 LLM | 说明 |
|------|-------------|------|
| `run` | ❌ 未使用 | 使用关键词匹配 |
| `generate` | ✅ 使用 | 生成 YAML 工作流 |
| `serve` | ❌ 未使用 | 只实现 GIT_WORKFLOW |

---

## 7. 目录结构

```
src/
├── cli.ts                      # CLI 入口
├── nl/                         # 自然语言解析
│   ├── parser.ts               # NL Parser（关键词匹配）
│   ├── intent-matcher.ts       # 意图匹配
│   ├── command-synthesizer.ts  # 命令合成
│   ├── llm.ts                  # LLM 客户端（已实现）
│   └── templates/              # 意图模板
├── workflow/                   # 工作流引擎
│   ├── engine.ts               # 引擎核心
│   ├── executor.ts             # 执行器
│   ├── storage.ts              # 持久化
│   └── context-manager.ts      # 上下文管理
├── sandbox/                    # 安全沙箱
│   ├── sandbox.ts              # 沙箱实现
│   └── detector.ts             # 危险命令检测
├── cli-tools/                  # 工具集成
│   ├── registry.ts             # 注册中心
│   └── tools/                  # git/npm/docker/curl
├── skills/                     # 技能系统
│   ├── iterative-refinement/
│   └── llm-dialog-control/
├── setup/                      # 配置向导
│   ├── first-run-wizard.ts
│   └── cli-scanner.ts
├── security-protocol/          # 安全协议
│   ├── manager.ts
│   └── default-rules.ts
├── command-rules/              # 黑白名单
│   ├── engine.ts
│   └── matcher.ts
└── utils/                      # CLI 命令
    ├── run.ts                  # 核心执行命令
    ├── generate.ts             # LLM 生成
    ├── serve.ts                # Socket 服务
    └── ...
```

---

## 8. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全 |
| 运行时 | Node.js 21+ | 跨平台 |
| 构建 | tsup | 快速打包 |
| CLI | Commander.js | 简单 |
| 配置 | YAML | 用户友好 |
| 存储 | 本地文件系统 | 无依赖 |
| 测试 | Vitest | 现代 |

---

```yaml
version: 6.0.0
lastUpdated: 2026-05-02
```
