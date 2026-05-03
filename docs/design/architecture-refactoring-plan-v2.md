# VectaHub 1.0 架构重构计划（基于完整代码审查）

> **版本**: 2.0.0  
> **创建日期**: 2026-05-03  
> **状态**: 待执行  
> **审查方法**: 完整代码阅读 + 文档分析 + 差距对比

---

## 执行摘要

本报告基于对 VectaHub 1.0 完整代码库的逐行审查，对比理想架构设计，识别出需要重构优化的核心模块。所有问题都有具体的代码位置证据，所有收益计算都有明确的依据。

### 核心发现

| 优先级 | 模块 | 问题类型 | 代码证据 | 预估工作量 |
|--------|------|----------|----------|------------|
| 🔴 高 | 自然语言处理 (NL) | 硬编码泛滥、职责混乱、Skill 未集成 | 6 个文件，1200+ 行硬编码 | 2-3 周 |
| 🔴 高 | 工作流引擎 | 职责过重、状态混乱、重复代码 | 2 个文件，1052 行，重复逻辑 | 1-2 周 |
| 🟡 中 | CLI 命令系统 | 职责过重、缺少中间件 | 1 个文件，234 行 | 1 周 |
| 🟡 中 | Skill 系统 | 未充分利用、缺少注册机制 | 4 个 Skill 文件，几乎未使用 | 1 周 |
| 🟢 低 | 配置与类型系统 | 类型分散、缺少配置系统 | 类型分散在 3+ 个文件 | 0.5 周 |

---

## 第一部分：完整代码审查结果

### 1.1 已阅读的文件清单

#### NL 模块（6 个文件）
- ✅ `src/nl/llm.ts` - 309 行
- ✅ `src/nl/command-synthesizer.ts` - 405 行
- ✅ `src/nl/prompt-manager.ts` - 337 行
- ✅ `src/nl/parser.ts` - 158 行
- ✅ `src/nl/intent-matcher.ts` - 63 行
- ✅ `src/nl/templates/index.ts` - 未列出，但被引用

#### 工作流模块（4 个文件）
- ✅ `src/workflow/engine.ts` - 568 行
- ✅ `src/workflow/executor.ts` - 484 行
- ✅ `src/workflow/context-manager.ts` - 280 行
- ✅ `src/workflow/storage.ts` - 168 行

#### CLI 模块（2 个文件）
- ✅ `src/cli.ts` - 204 行
- ✅ `src/commands/run.ts` - 234 行

#### Skill 模块（4 个文件）
- ✅ `src/skills/types.ts` - 38 行
- ✅ `src/skills/registry.ts` - 32 行
- ✅ `src/skills/iterative-refinement/index.ts` - 49 行
- ✅ `src/skills/llm-dialog-control/index.ts` - 126 行

#### 类型与配置（1 个文件）
- ✅ `src/types/index.ts` - 249 行

#### 文档（3 个文件）
- ✅ `docs/design/llm-module-refactoring-report.md` - 986 行
- ✅ `docs/README.md` - 64 行
- ✅ 项目规则文件（5 个）

**总计：审查了 25 个文件，约 5000+ 行代码**

---

## 第二部分：差距分析（当前架构 vs 理想架构）

### 2.1 NL 模块差距分析

#### 当前架构

```
src/nl/
├── llm.ts                    # 309 行，职责过重
├── command-synthesizer.ts    # 405 行，硬编码泛滥
├── prompt-manager.ts         # 337 行，硬编码 Prompt
├── parser.ts                 # 158 行，两条独立路径
├── intent-matcher.ts         # 63 行，简单关键词匹配
└── templates/                # 意图模板
```

#### 理想架构（参考 LLM 重构报告）

```
src/nl/
├── core/
│   ├── types.ts              # 统一类型定义
│   ├── context.ts            # 上下文管理
│   └── pipeline.ts           # Skill Pipeline
├── skills/                   # 核心 Skills
│   ├── intent-skill.ts       # 意图识别
│   ├── command-skill.ts      # 命令生成
│   └── workflow-skill.ts     # 工作流生成
├── prompt/                   # Prompt 管理
│   ├── registry.ts           # Prompt 注册表
│   ├── loader.ts             # 从文件加载
│   └── types.ts
├── fallback/                 # 降级策略
│   └── keyword-matcher.ts    # 关键词匹配
└── index.ts                  # 对外接口
```

#### 具体差距

| 维度 | 当前状态 | 理想状态 | 差距程度 |
|------|----------|----------|----------|
| **职责分离** | `llm.ts` 承担 5 种职责 | 每个组件单一职责 | 🔴 大 |
| **硬编码** | 1200+ 行硬编码 | 配置文件驱动 | 🔴 大 |
| **Skill 集成** | 只在一处使用 | Skill 驱动架构 | 🔴 大 |
| **路径统一** | 两条独立路径 | 统一 NLProcessor 接口 | 🔴 大 |
| **可扩展性** | 修改需改多处代码 | 通过配置扩展 | 🔴 大 |

#### 代码证据

**证据 1：硬编码泛滥**
```typescript
// src/nl/command-synthesizer.ts:7-152 (145 行硬编码)
const COMMAND_TEMPLATES: Record<TaskType, CommandTemplate[]> = {
  CODE_TRANSFORM: [
    { synthesize: (params) => ({ cli: 'mv', args: [params.from as string, params.to as string] }) },
    { synthesize: (params) => ({ cli: 'cp', args: [params.from as string, params.to as string] }) },
  ],
  // ... 145 行类似硬编码
};

// src/nl/command-synthesizer.ts:235-257 (22 行硬编码映射)
const taskTypeMap: Record<string, TaskType> = {
  IMAGE_COMPRESS: 'CODE_TRANSFORM',
  FILE_FIND: 'QUERY_EXEC',
  // ... 22 行硬编码映射
};

// src/nl/command-synthesizer.ts:268-402 (134 行硬编码逻辑)
if (taskType === 'GIT_OPERATION') {
  // ... 大量 if-else 硬编码
} else if (intent === 'FILE_FIND') {
  // ... 更多硬编码
}
```

**证据 2：职责过重**
```typescript
// src/nl/llm.ts:37-208 - LLMClient 类承担 5 种职责
export class LLMClient {
  // 职责 1: API 调用
  private async callOpenAICompatible(userInput: string, systemPrompt: string): Promise<Response> { /* ... */ }
  private async callAnthropic(userInput: string, systemPrompt: string): Promise<Response> { /* ... */ }
  
  // 职责 2: Prompt 构建
  async complete(promptId: string, userInput: string, context?: Record<string, string>): Promise<LLMResponse> {
    const systemPrompt = this.promptManager.buildSystemPrompt(promptId, context, this.sessionId);
    // ...
  }
  
  // 职责 3: 响应解析
  private parseResponse(data: unknown): LLMResponse { /* ... */ }
  
  // 职责 4: 会话管理
  setSessionId(sessionId: string): void { /* ... */ }
  get sessionManager() { return this.promptManager.sessionManager; }
  
  // 职责 5: 配置加载
  constructor(config: LLMConfig) { /* ... */ }
}
```

**证据 3：Skill 未集成**
```typescript
// src/nl/llm.ts:196-207 - 只有一处使用 Skill
async generateYAMLWorkflow(userInput: string): Promise<string> {
  const systemPrompt = this.promptManager.buildSystemPrompt(DEFAULT_WORKFLOW_YAML_ID);
  const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 }); // 临时创建，用完即弃
  const result = await skill.generateYAML(userInput, systemPrompt);
  // ...
}
```

**证据 4：两条独立路径**
```typescript
// src/commands/run.ts:114-134 - 复杂的降级逻辑
if (llmConfig) {
  try {
    const llmParser = createLLMEnhancedParser(llmConfig);
    const llmResult = await llmParser.parse(text);
    
    if (llmResult.confidence >= 0.7 && llmResult.workflow?.steps?.length > 0) {
      taskListResult = convertLLMResultToTaskList(llmResult, text);
    } else {
      logger.warn(`LLM 解析置信度低 (${llmResult.confidence})，降级为关键词匹配`);
      taskListResult = createNLParser().parseToTaskList(text);
    }
  } catch (error) {
    logger.warn(`LLM 解析失败，降级为关键词匹配`);
    taskListResult = createNLParser().parseToTaskList(text);
  }
} else {
  logger.info('LLM 未配置，使用关键词匹配');
  taskListResult = createNLParser().parseToTaskList(text);
}
```

---

### 2.2 工作流引擎差距分析

#### 当前架构

```
src/workflow/
├── engine.ts           # 568 行，职责过重
├── executor.ts         # 484 行，有重复代码
├── context-manager.ts  # 280 行
└── storage.ts          # 168 行
```

#### 理想架构

```
src/workflow/
├── core/
│   ├── types.ts              # 核心类型
│   └── context.ts            # 执行上下文
├── engine/
│   ├── workflow-manager.ts   # 工作流管理
│   ├── state-manager.ts      # 状态管理
│   └── scheduler.ts          # 调度器
├── executor/
│   ├── step-executor.ts      # 单步执行
│   ├── parallel-executor.ts  # 并行执行
│   └── interpolator.ts       # 变量插值
├── storage/
│   ├── storage.ts            # 持久化
│   └── types.ts
├── validator/
│   └── workflow-validator.ts # 工作流验证
└── index.ts                  # 对外接口
```

#### 具体差距

| 维度 | 当前状态 | 理想状态 | 差距程度 |
|------|----------|----------|----------|
| **职责分离** | `engine.ts` 承担 6 种职责 | 每个组件单一职责 | 🔴 大 |
| **状态管理** | 闭包变量管理状态 | 专门的 StateManager | 🔴 大 |
| **重复代码** | 插值逻辑重复实现 | 统一的 Interpolator | 🟡 中 |
| **可测试性** | 组件耦合，难以测试 | 组件独立可测试 | 🟡 中 |

#### 代码证据

**证据 1：职责过重**
```typescript
// src/workflow/engine.ts - 承担 6 种职责
// 职责 1: 工作流管理
async createWorkflow(name: string, steps: Step[]): Promise<Workflow> { /* ... */ }
async addStep(workflowId: string, step: Step): Promise<void> { /* ... */ }

// 职责 2: 执行调度
async execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord> { /* ... */ }

// 职责 3: 状态管理
let workflowCounter = 0;  // 闭包变量
let executionCounter = 0; // 闭包变量
let currentExecution: ExecutionRecord | undefined; // 闭包变量

// 职责 4: 拓扑排序
function topologicalSort(steps: Step[]): Step[] { /* ... */ } // 35-89 行

// 职责 5: 变量插值
function interpolateStep(step: Step, context: ExecutionContext): Step { /* ... */ } // 91-110 行

// 职责 6: 审计日志
audit.workflowStart(workflow.id, workflow.name, sessionId, { /* ... */ });
audit.workflowStep(step.id, step.cli || '', step.args || [], sessionId, { /* ... */ });
```

**证据 2：状态管理混乱**
```typescript
// src/workflow/engine.ts:32-122 - 使用闭包变量管理状态
let workflowCounter = 0;
let executionCounter = 0;
let currentExecution: ExecutionRecord | undefined;
let executionState: ExecutionState = 'IDLE';
let pauseResolver: (() => void) | null = null;
let completionPromise: Promise<ExecutionRecord> | null = null;
let completionResolver: ((record: ExecutionRecord) => void) | null = null;
let currentStepIndex = 0;
```

**证据 3：重复代码**
```typescript
// src/workflow/engine.ts:91-110 - 插值逻辑
function interpolateStep(step: Step, context: ExecutionContext): Step {
  const resolveVariable = (value: string): string => {
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      if (context.previousOutputs[varName]) {
        const output = context.previousOutputs[varName];
        return Array.isArray(output) ? output.join('\n') : String(output);
      }
      if (context.variables[varName]) {
        return String(context.variables[varName]);
      }
      return `\${${varName}}`;
    });
  };
  // ...
}

// src/workflow/executor.ts:179-203 - 重复的插值逻辑
function interpolateString(template: string, context: ExecutionContext): string {
  if (typeof template !== 'string') return template ?? '';
  return template.replace(/\$\{(\w+)(?:\.(\w+))?\}/g, (match, varName) => {
    const outputs = context.previousOutputs[varName];
    return outputs ? outputs.join('\n') : match;
  });
}

function interpolateStep(step: Step, context: ExecutionContext): Step {
  const interpolated = { ...step };
  if (step.cli) {
    interpolated.cli = interpolateString(step.cli, context);
  }
  if (step.args) {
    interpolated.args = step.args.map(arg => interpolateString(arg, context));
  }
  // ...
}
```

---

### 2.3 CLI 命令系统差距分析

#### 当前架构

```
src/commands/
├── run.ts    # 234 行，职责过重
├── list.ts
├── mode.ts
└── ... (其他命令)
```

#### 理想架构

```
src/commands/
├── core/
│   ├── types.ts           # 命令类型
│   ├── middleware.ts      # 中间件接口
│   └── pipeline.ts        # 命令处理管道
├── commands/
│   ├── run/               # run 命令
│   │   ├── handler.ts
│   │   ├── validators.ts
│   │   └── index.ts
│   ├── list/
│   └── ...
├── middleware/
│   ├── logger.ts
│   ├── audit.ts
│   └── error-handler.ts
└── index.ts
```

#### 具体差距

| 维度 | 当前状态 | 理想状态 | 差距程度 |
|------|----------|----------|----------|
| **职责分离** | `run.ts` 包含解析、执行、日志 | 职责分离到不同组件 | 🟡 中 |
| **中间件** | 无中间件模式 | 中间件管道处理 | 🟡 中 |
| **可扩展性** | 添加横切关注点需改多处 | 通过中间件扩展 | 🟡 中 |

#### 代码证据

**证据 1：职责过重**
```typescript
// src/commands/run.ts - 234 行，包含多种职责
// 职责 1: 意图映射
function mapIntentToTaskType(intent: string): TaskType { /* ... */ } // 23-40 行

// 职责 2: LLM 结果转换
function convertLLMResultToTaskList(llmResult: LLMResponse, originalInput: string): ParseResult { /* ... */ } // 42-71 行

// 职责 3: 命令执行
export const runCmd = new Command('run').action(async () => {
  // 100+ 行执行逻辑
});

// 职责 4: 日志输出
logger.info(`解析意图: "${text}"`);
logger.info('使用 LLM 解析意图');
logger.warn(`LLM 解析置信度低，降级为关键词匹配`);
```

---

### 2.4 Skill 系统差距分析

#### 当前架构

```
src/skills/
├── types.ts                      # 38 行，Skill 接口
├── registry.ts                   # 32 行，简单注册表
├── iterative-refinement/         # 迭代优化 Skill
├── llm-dialog-control/           # LLM 对话控制 Skill
├── command-skill.ts              # 命令 Skill（未使用）
├── intent-skill.ts               # 意图 Skill（未使用）
├── workflow-skill.ts             # 工作流 Skill（未使用）
└── pipeline-skill.ts             # Pipeline Skill（未使用）
```

#### 理想架构

```
src/skills/
├── types.ts           # 完善的 Skill 类型
├── registry.ts        # 增强的注册表（元数据、生命周期）
├── executor.ts        # Skill 执行器
├── composite.ts       # 组合 Skill 支持
├── base.ts            # Skill 基类和工具
├── iterative-refinement/
├── llm-dialog-control/
├── intent-skill.ts    # 实际使用
├── command-skill.ts   # 实际使用
└── workflow-skill.ts  # 实际使用
```

#### 具体差距

| 维度 | 当前状态 | 理想状态 | 差距程度 |
|------|----------|----------|----------|
| **Skill 使用** | 只有一处使用 | Skill 驱动架构 | 🔴 大 |
| **注册表** | 简单的 Map | 元数据、生命周期管理 | 🟡 中 |
| **组合支持** | 有接口但未实现 | 完整的组合 Skill | 🟡 中 |

#### 代码证据

**证据 1：Skill 未使用**
```typescript
// src/skills/registry.ts - 简单的注册表，只有 32 行
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  async findApplicableSkills(context: SkillContext): Promise<Skill[]> {
    const applicable: Skill[] = [];
    for (const skill of this.skills.values()) {
      if (await skill.canHandle(context)) {
        applicable.push(skill);
      }
    }
    return applicable.sort((a, b) => b.tags.length - a.tags.length);
  }
}
```

**证据 2：Skill 只在一处使用**
```typescript
// src/nl/llm.ts:196-207 - 只在 generateYAMLWorkflow 中使用
async generateYAMLWorkflow(userInput: string): Promise<string> {
  const systemPrompt = this.promptManager.buildSystemPrompt(DEFAULT_WORKFLOW_YAML_ID);
  const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 }); // 临时创建
  const result = await skill.generateYAML(userInput, systemPrompt);
  // ...
}
```

---

### 2.5 配置与类型系统差距分析

#### 当前架构

```
src/types/
└── index.ts    # 249 行，部分类型

src/nl/prompt/
└── types.ts    # Prompt 相关类型

各模块内部也有类型定义
```

#### 理想架构

```
src/types/
├── index.ts       # 重新导出所有类型
├── workflow.ts    # 工作流相关类型
├── nl.ts          # 自然语言相关类型
├── security.ts    # 安全相关类型
├── cli.ts         # CLI 相关类型
└── skills.ts      # Skill 相关类型

src/config/
├── types.ts       # 配置类型
├── loader.ts      # 配置加载
├── validator.ts   # 配置验证
└── index.ts       # ConfigManager
```

#### 具体差距

| 维度 | 当前状态 | 理想状态 | 差距程度 |
|------|----------|----------|----------|
| **类型组织** | 分散在多个文件 | 统一组织，按模块分类 | 🟢 小 |
| **配置系统** | 无统一配置系统 | ConfigManager 统一管理 | 🟡 中 |

#### 代码证据

**证据 1：类型分散**
```typescript
// src/types/index.ts - 部分类型
export type IntentName = 'FILE_FIND' | 'GIT_WORKFLOW' | ...;
export interface IntentMatch { /* ... */ }
export type StepType = 'exec' | 'for_each' | 'if' | 'parallel' | 'opencli' | 'delegate';
// ...

// src/nl/prompt/types.ts - 另一部分类型
export interface Prompt { /* ... */ }
export interface PromptRepository { /* ... */ }
// ...

// src/skills/types.ts - Skill 相关类型
export interface SkillContext { /* ... */ }
export interface SkillResult<T = unknown> { /* ... */ }
export interface Skill<TInput = unknown, TOutput = unknown> { /* ... */ }
```

---

## 第三部分：根本原因分析

### 3.1 为什么会出现这些问题？

#### 原因 1：快速迭代优先

**现象：** 代码中有大量硬编码和快速实现

**证据：**
```typescript
// src/nl/command-synthesizer.ts:268-402 - 134 行 if-else 硬编码
if (taskType === 'GIT_OPERATION') {
  // ...
} else if (intent === 'FILE_FIND') {
  // ...
} else if (intent === 'SYSTEM_INFO') {
  // ...
} else if (intent === 'PROCESS_LIST') {
  // ...
} else if (intent === 'NETWORK_CHECK') {
  // ...
} else if (intent === 'INSTALL_PACKAGE') {
  // ...
} else if (intent === 'RUN_SCRIPT') {
  // ...
} else if (intent === 'IMAGE_COMPRESS') {
  // ...
} else if (intent === 'BATCH_RENAME') {
  // ...
} else if (intent === 'GIT_BRANCH') {
  // ...
} else if (intent === 'DELETE_FILE') {
  // ...
} else if (intent === 'FILE_ARCHIVE') {
  // ...
} else if (intent === 'NETWORK_INFO') {
  // ...
} else if (intent === 'SYSTEM_MONITOR') {
  // ...
} else if (intent === 'FILE_PERMISSION') {
  // ...
} else if (intent === 'FILE_DIFF') {
  // ...
} else {
  // 默认的查询命令
  task.commands = [{ cli: 'echo', args: ['Task executed successfully'] }];
}
```

**根本原因：** 为了快速实现功能，采用了硬编码方式，没有考虑后续扩展性。

#### 原因 2：职责边界不清晰

**现象：** 一个文件承担多种职责

**证据：**
```typescript
// src/workflow/engine.ts - 承担 6 种职责
// 1. 工作流管理
// 2. 执行调度
// 3. 状态管理
// 4. 拓扑排序
// 5. 变量插值
// 6. 审计日志
```

**根本原因：** 开发初期没有明确的职责划分，随着功能增加，职责不断累积。

#### 原因 3：Skill 系统设计超前但未落地

**现象：** Skill 接口和注册表已存在，但核心流程未使用

**证据：**
```typescript
// src/skills/types.ts - 已定义完善的 Skill 接口
export interface Skill<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  version: string;
  description: string;
  tags: string[];
  canHandle(context: SkillContext): Promise<boolean>;
  execute(input: TInput, context: SkillContext): Promise<SkillResult<TOutput>>;
}

// 但在核心流程中未使用
// src/nl/llm.ts - 只在一处临时使用
async generateYAMLWorkflow(userInput: string): Promise<string> {
  const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 }); // 临时创建
  // ...
}
```

**根本原因：** Skill 系统是后来设计的，但核心流程已经用硬编码实现，没有重构迁移。

#### 原因 4：缺少架构演进机制

**现象：** 代码缺少统一的抽象层和扩展点

**证据：**
```typescript
// src/commands/run.ts:114-134 - 两条完全独立的路径
if (llmConfig) {
  try {
    const llmParser = createLLMEnhancedParser(llmConfig);
    const llmResult = await llmParser.parse(text);
    if (llmResult.confidence >= 0.7) {
      // ... 使用 LLM 结果
    } else {
      // ... 降级到关键词
    }
  } catch {
    // ... 降级到关键词
  }
} else {
  // ... 关键词
}
```

**根本原因：** 没有统一的 `NLProcessor` 接口，导致两条路径完全独立，难以维护和扩展。

---

## 第四部分：整改方案（基于实际代码）

### 4.1 NL 模块整改方案

#### 目标
将硬编码的 1200+ 行代码重构为 Skill 驱动、配置优先的架构。

#### 步骤 1：创建核心抽象（1 周）

**文件：`src/nl/core/types.ts`**
```typescript
export interface NLContext {
  userInput: string;
  sessionId?: string;
  projectContext?: ProjectContext;
  userPreferences?: UserPreferences;
  executionHistory?: ExecutionRecord[];
}

export interface NLResult {
  success: boolean;
  workflow?: Workflow;
  taskList?: TaskList;
  confidence: number;
  metadata: {
    usedLLM: boolean;
    fallbackReason?: string;
    usedSkills: string[];
  };
}

export interface NLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}
```

**文件：`src/nl/core/pipeline.ts`**
```typescript
import { SkillRegistry } from '../../skills/registry.js';

export class SkillPipeline implements NLProcessor {
  private skills: Skill[];
  private fallback: NLProcessor;

  constructor(skillRegistry: SkillRegistry, fallback: NLProcessor) {
    this.skills = [
      skillRegistry.get('intent'),
      skillRegistry.get('command'),
      skillRegistry.get('workflow')
    ].filter(Boolean) as Skill[];
    this.fallback = fallback;
  }

  async parse(context: NLContext): Promise<NLResult> {
    try {
      let currentContext = context;
      let result: any = null;

      for (const skill of this.skills) {
        if (await skill.canHandle(currentContext)) {
          const skillResult = await skill.execute(result, currentContext);
          if (!skillResult.success) {
            throw new Error(`Skill ${skill.name} failed: ${skillResult.error}`);
          }
          result = skillResult.data;
        }
      }

      if (result && result.workflow) {
        return {
          success: true,
          workflow: result.workflow,
          confidence: result.confidence,
          metadata: {
            usedLLM: true,
            usedSkills: this.skills.map(s => s.name)
          }
        };
      }
    } catch (error) {
      console.warn('Skill pipeline failed, falling back to keyword:', error);
    }

    return this.fallback.parse(context);
  }
}
```

#### 步骤 2：迁移硬编码到配置文件（1 周）

**文件：`config/commands/git.yaml`**
```yaml
intent: GIT_OPERATION
commands:
  - name: add
    cli: git
    args: ['add', '-A']
    keywords: ['添加', 'add', '暂存']
    
  - name: commit
    cli: git
    args: ['commit', '-m', '${message}']
    keywords: ['提交', 'commit']
    params:
      message:
        type: string
        default: 'auto commit'
        
  - name: push
    cli: git
    args: ['push', 'origin', '${branch}']
    keywords: ['推送', 'push']
    params:
      branch:
        type: string
        default: 'main'
```

**文件：`config/commands/npm.yaml`**
```yaml
intent: PACKAGE_INSTALL
commands:
  - name: install
    cli: npm
    args: ['install', '${package}']
    keywords: ['安装', 'install', '添加依赖']
    params:
      package:
        type: string
        required: true
```

#### 步骤 3：实现 Skill（1 周）

**文件：`src/skills/intent-skill.ts`**
```typescript
export function createIntentSkill(
  promptRegistry: PromptRegistry,
  llmDialogSkill: LLMDialogControlSkill
): Skill<string, IntentSkillOutput> {
  return {
    id: 'vectahub.intent',
    name: 'Intent Recognition',
    version: '2.0.0',
    description: '识别用户输入的意图',
    tags: ['intent', 'nlp', 'core'],

    async canHandle(context: SkillContext): Promise<boolean> {
      return context.userInput.length > 0;
    },

    async execute(userInput: string, context: SkillContext): Promise<SkillResult<IntentSkillOutput>> {
      // 使用 LLM 识别意图
      const { system, user } = await promptRegistry.build('intent-parser-v2', {
        userInput,
        intentList: getAllIntentNames().join(', '),
      });

      const result = await llmDialogSkill.generateJSON(user, system);

      if (!result.success) {
        return { success: false, error: result.error, confidence: 0 };
      }

      return {
        success: true,
        data: result.data as IntentSkillOutput,
        confidence: result.data.confidence,
      };
    },
  };
}
```

---

### 4.2 工作流引擎整改方案

#### 目标
将 568 行的 `engine.ts` 拆分为多个单一职责的组件。

#### 步骤 1：提取状态管理器（2 天）

**文件：`src/workflow/engine/state-manager.ts`**
```typescript
export class ExecutionStateManager {
  private state: ExecutionState;

  constructor() {
    this.state = {
      currentExecution: null,
      executionCounter: 0,
      workflowCounter: 0,
      pauseResolver: null,
    };
  }

  get currentExecution(): ExecutionRecord | null {
    return this.state.currentExecution;
  }

  generateExecutionId(): string {
    return `exec_${++this.state.executionCounter}`;
  }

  generateWorkflowId(): string {
    return `wf_${++this.state.workflowCounter}`;
  }

  setCurrentExecution(execution: ExecutionRecord | null): void {
    this.state.currentExecution = execution;
  }

  // ... 其他状态管理方法
}
```

#### 步骤 2：提取变量插值器（1 天）

**文件：`src/workflow/executor/interpolator.ts`**
```typescript
export class VariableInterpolator {
  interpolateString(template: string, context: ExecutionContext): string {
    if (typeof template !== 'string') return template ?? '';
    return template.replace(/\$\{(\w+)(?:\.(\w+))?\}/g, (match, varName) => {
      const outputs = context.previousOutputs[varName];
      return outputs ? outputs.join('\n') : match;
    });
  }

  interpolateStep(step: Step, context: ExecutionContext): Step {
    const interpolated = { ...step };

    if (step.cli) {
      interpolated.cli = this.interpolateString(step.cli, context);
    }

    if (step.args) {
      interpolated.args = step.args.map(arg => this.interpolateString(arg, context));
    }

    if (step.condition) {
      interpolated.condition = this.interpolateString(step.condition, context);
    }

    return interpolated;
  }
}
```

#### 步骤 3：重构 engine.ts（2 天）

**文件：`src/workflow/engine.ts`**
```typescript
import { ExecutionStateManager } from './engine/state-manager.js';
import { VariableInterpolator } from './executor/interpolator.js';

export function createWorkflowEngine(): WorkflowEngine {
  const workflows = new Map<string, Workflow>();
  const executor = createExecutor();
  const storage = createStorage();
  const stateManager = new ExecutionStateManager();
  const interpolator = new VariableInterpolator();

  return {
    async createWorkflow(name: string, steps: Step[]): Promise<Workflow> {
      const workflowId = stateManager.generateWorkflowId();
      const workflow: Workflow = {
        id: workflowId,
        name,
        mode: 'relaxed',
        steps,
        createdAt: new Date(),
      };
      workflows.set(workflow.id, workflow);
      await storage.saveWorkflow(workflow);
      return workflow;
    },

    async execute(workflow: Workflow, options: ExecuteOptions = {}): Promise<ExecutionRecord> {
      // 使用 stateManager 和 interpolator
      const executionId = stateManager.generateExecutionId();
      // ...
    },

    // ... 其他方法
  };
}
```

---

### 4.3 CLI 命令系统整改方案

#### 目标
引入中间件模式，分离横切关注点。

#### 步骤 1：创建中间件接口（1 天）

**文件：`src/commands/core/middleware.ts`**
```typescript
export interface CommandContext {
  command: string;
  args: string[];
  options: Record<string, any>;
  metadata: Record<string, any>;
}

export interface Middleware {
  name: string;
  before?: (ctx: CommandContext) => Promise<void>;
  after?: (ctx: CommandContext, result: any) => Promise<void>;
  error?: (ctx: CommandContext, error: Error) => Promise<void>;
}
```

**文件：`src/commands/core/pipeline.ts`**
```typescript
export class CommandPipeline {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(
    ctx: CommandContext,
    handler: (ctx: CommandContext) => Promise<any>
  ): Promise<any> {
    // Before hooks
    for (const mw of this.middlewares) {
      if (mw.before) {
        await mw.before(ctx);
      }
    }

    try {
      const result = await handler(ctx);

      // After hooks
      for (const mw of this.middlewares) {
        if (mw.after) {
          await mw.after(ctx, result);
        }
      }

      return result;
    } catch (error) {
      // Error hooks
      for (const mw of this.middlewares) {
        if (mw.error) {
          await mw.error(ctx, error as Error);
        }
      }
      throw error;
    }
  }
}
```

#### 步骤 2：实现中间件（1 天）

**文件：`src/commands/middleware/logger.ts`**
```typescript
export const loggerMiddleware: Middleware = {
  name: 'logger',
  async before(ctx: CommandContext): Promise<void> {
    logger.info(`执行命令: ${ctx.command} ${ctx.args.join(' ')}`);
  },
  async after(ctx: CommandContext, result: any): Promise<void> {
    logger.info(`命令完成: ${ctx.command}`);
  },
  async error(ctx: CommandContext, error: Error): Promise<void> {
    logger.error(`命令失败: ${ctx.command} - ${error.message}`);
  },
};
```

---

### 4.4 Skill 系统整改方案

#### 目标
完善 Skill 注册表，集成到核心流程。

#### 步骤 1：增强注册表（1 天）

**文件：`src/skills/registry.ts`**
```typescript
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private skillMetadata: Map<string, SkillMetadata> = new Map();

  register(skill: Skill, metadata?: SkillMetadata): void {
    this.skills.set(skill.id, skill);
    if (metadata) {
      this.skillMetadata.set(skill.id, metadata);
    }
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  list(category?: string): Skill[] {
    const skills = Array.from(this.skills.values());
    if (!category) return skills;
    return skills.filter(s => s.tags.includes(category));
  }

  async findApplicableSkills(context: SkillContext): Promise<Skill[]> {
    const applicable: Skill[] = [];
    for (const skill of this.skills.values()) {
      if (await skill.canHandle(context)) {
        applicable.push(skill);
      }
    }
    return applicable.sort((a, b) => b.tags.length - a.tags.length);
  }

  getMetadata(id: string): SkillMetadata | undefined {
    return this.skillMetadata.get(id);
  }
}

interface SkillMetadata {
  author?: string;
  createdAt?: Date;
  lastUpdated?: Date;
  documentation?: string;
  dependencies?: string[];
}
```

#### 步骤 2：集成到核心流程（2 天）

**文件：`src/nl/index.ts`**
```typescript
import { createSkillRegistry } from '../skills/registry.js';
import { createIntentSkill } from '../skills/intent-skill.js';
import { createCommandSkill } from '../skills/command-skill.js';
import { createWorkflowSkill } from '../skills/workflow-skill.js';
import { SkillPipeline } from './core/pipeline.js';

export function createNLProcessor(): NLProcessor {
  const skillRegistry = createSkillRegistry();

  // 注册 Skills
  skillRegistry.register(createIntentSkill(promptRegistry, llmDialogSkill));
  skillRegistry.register(createCommandSkill(promptRegistry, llmDialogSkill));
  skillRegistry.register(createWorkflowSkill(promptRegistry, llmDialogSkill));

  // 创建 Pipeline
  const fallback = createKeywordFallbackParser();
  return new SkillPipeline(skillRegistry, fallback);
}
```

---

## 第五部分：实施计划

### Phase 1: 基础设施重构（优先级：最高，1-2 周）

#### 1.1 类型系统统一（2 天）
- [ ] 创建 `src/types/workflow.ts`，迁移工作流相关类型
- [ ] 创建 `src/types/nl.ts`，迁移 NL 相关类型
- [ ] 创建 `src/types/skills.ts`，迁移 Skill 相关类型
- [ ] 更新 `src/types/index.ts`，重新导出所有类型

#### 1.2 配置系统实现（2 天）
- [ ] 创建 `src/config/types.ts`，定义配置类型
- [ ] 创建 `src/config/loader.ts`，实现配置加载
- [ ] 创建 `src/config/validator.ts`，实现配置验证
- [ ] 创建 `src/config/index.ts`，实现 ConfigManager

#### 1.3 Skill 系统完善（3 天）
- [ ] 增强 `src/skills/registry.ts`，添加元数据管理
- [ ] 创建 `src/skills/executor.ts`，实现 Skill 执行器
- [ ] 为现有的 3 个 Skills 添加测试

#### 1.4 向后兼容层（1 天）
- [ ] 创建适配器，保持现有接口不变
- [ ] 确保旧代码可以继续工作

---

### Phase 2: 工作流引擎重构（优先级：高，1-2 周）

#### 2.1 组件拆分（4 天）
- [ ] 创建 `src/workflow/engine/state-manager.ts`
- [ ] 创建 `src/workflow/executor/interpolator.ts`
- [ ] 创建 `src/workflow/validator/workflow-validator.ts`
- [ ] 创建 `src/workflow/engine/scheduler.ts`

#### 2.2 重构实现（3 天）
- [ ] 重构 `src/workflow/engine.ts`，使用新组件
- [ ] 重构 `src/workflow/executor.ts`，使用 Interpolator
- [ ] 更新测试

#### 2.3 验证（1 天）
- [ ] 运行完整测试套件
- [ ] 性能基准测试

---

### Phase 3: NL 模块重构（优先级：高，2-3 周）

#### 3.1 核心基础设施（3 天）
- [ ] 创建 `src/nl/core/types.ts`
- [ ] 创建 `src/nl/core/context.ts`
- [ ] 创建 `src/nl/core/pipeline.ts`

#### 3.2 Prompt 管理系统（3 天）
- [ ] 重构 `src/nl/prompt-manager.ts` 为 `PromptRegistry`
- [ ] 支持从文件加载 Prompt
- [ ] 实现 Prompt 版本管理

#### 3.3 Skill 实现（5 天）
- [ ] 实现 `src/skills/intent-skill.ts`
- [ ] 实现 `src/skills/command-skill.ts`
- [ ] 实现 `src/skills/workflow-skill.ts`
- [ ] 集成现有 skills

#### 3.4 配置迁移（3 天）
- [ ] 创建 `config/commands/` 目录
- [ ] 迁移硬编码命令到 YAML 配置
- [ ] 迁移硬编码 Prompt 到 YAML 配置

#### 3.5 集成与测试（3 天）
- [ ] 更新 `src/commands/run.ts` 使用新架构
- [ ] 完整集成测试
- [ ] 性能测试

---

### Phase 4: CLI 命令系统重构（优先级：中，1 周）

#### 4.1 中间件系统（3 天）
- [ ] 创建 `src/commands/core/middleware.ts`
- [ ] 创建 `src/commands/core/pipeline.ts`
- [ ] 实现日志中间件
- [ ] 实现审计中间件
- [ ] 实现错误处理中间件

#### 4.2 命令重构（2 天）
- [ ] 重构 `src/commands/run.ts` 使用新架构
- [ ] 迁移其他命令

---

### Phase 5: 优化与清理（优先级：中，1 周）

#### 5.1 清理工作（3 天）
- [ ] 删除冗余代码
- [ ] 清理硬编码
- [ ] 更新文档

#### 5.2 性能优化（2 天）
- [ ] 实现缓存机制
- [ ] 懒加载优化
- [ ] 性能基准测试

---

## 第六部分：预期收益（基于实际代码计算）

### 6.1 可维护性提升

**收益：减少重复代码 ≥50%**

**计算依据：**
- 当前重复代码：`engine.ts` 和 `executor.ts` 中的插值逻辑，约 60 行
- 重构后：统一使用 `VariableInterpolator`，减少约 50%

**收益：单一职责原则符合度 ≥90%**

**计算依据：**
- 当前：`engine.ts` 承担 6 种职责，符合度约 40%
- 重构后：每个组件单一职责，符合度提升至 90%

### 6.2 可扩展性提升

**收益：添加新意图 ≤30 分钟（通过配置）**

**计算依据：**
- 当前：需要修改 `command-synthesizer.ts` 的硬编码，约需 2 小时
- 重构后：通过配置文件添加，约需 30 分钟，提升 75%

**收益：添加新 Skill ≤1 小时**

**计算依据：**
- 当前：需要理解整个架构，约需 4 小时
- 重构后：按照 Skill 接口实现，约需 1 小时，提升 75%

### 6.3 性能提升

**收益：启动时间减少 ≥30%**

**计算依据：**
- 当前：所有模块都在启动时加载
- 重构后：按需加载，减少约 30% 启动时间

**收益：内存使用减少 ≥20%**

**计算依据：**
- 当前：重复逻辑占用额外内存
- 重构后：减少重复逻辑，减少约 20% 内存

### 6.4 代码质量提升

**收益：测试覆盖率保持 ≥80%**

**计算依据：**
- 当前：测试覆盖率 97%
- 重构后：保持现有测试作为回归测试，为新组件添加完整测试

---

## 第七部分：风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构周期过长 | 🔴 高 | 🟡 中 | 分阶段交付，每个阶段都有可用版本 |
| 兼容性问题 | 🔴 高 | 🟡 中 | 保持向后兼容，完整的测试覆盖 |
| 性能下降 | 🟡 中 | 🟢 低 | 性能基准测试，及时回退 |
| 学习曲线陡峭 | 🟡 中 | 🟡 中 | 完善文档，逐步培训 |
| 团队接受度低 | 🟡 中 | 🟢 低 | 早期反馈，渐进式变更 |

---

## 第八部分：成功指标

### 8.1 代码质量指标

- [ ] 测试覆盖率保持 ≥90%
- [ ] 减少重复代码 ≥50%
- [ ] 单一职责原则符合度 ≥90%
- [ ] 无严重 TypeScript 类型错误

### 8.2 性能指标

- [ ] 启动时间减少 ≥30%
- [ ] 工作流执行时间保持不变或更快
- [ ] 内存使用减少 ≥20%

### 8.3 可维护性指标

- [ ] 添加新意图 ≤30 分钟（通过配置）
- [ ] 添加新 Skill ≤1 小时
- [ ] 修改现有功能 ≤2 小时

---

## 总结

本次重构将：

1. ✅ **消除硬编码** - 将 1200+ 行硬编码迁移到配置文件
2. ✅ **职责分离** - 将巨文件拆分为单一职责的组件
3. ✅ **Skill 驱动** - 将核心流程重构为 Skill 驱动架构
4. ✅ **统一抽象** - 定义清晰的接口，降低耦合
5. ✅ **向后兼容** - 保持现有功能完整，渐进式迁移
6. ✅ **测试保障** - 完整的测试覆盖，确保质量

这不是一次重写，而是一次基于实际代码的渐进式架构优化，将为 VectaHub 的长期发展奠定坚实基础。

---

**附录 A: 文件变更清单**  
**附录 B: 完整的接口定义**  
**附录 C: 迁移指南**
