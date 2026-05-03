# VectaHub 1.0 架构重构计划

> **版本**: 1.0.0  
> **创建日期**: 2026-05-03  
> **状态**: 待执行

---

## 执行摘要

基于对 VectaHub 1.0 代码库的全面分析，我们识别出以下需要重构优化的核心模块，以保持现有功能完整性的同时提升未来可扩展性、可维护性和性能：

### 核心重构模块

| 优先级 | 模块 | 问题类型 | 预估工作量 |
|--------|------|----------|------------|
| 🔴 高 | 自然语言处理 (NL) | 架构分散、硬编码过多 | 2-3 周 |
| 🔴 高 | 工作流引擎 | 职责过重、状态管理混乱 | 1-2 周 |
| 🟡 中 | CLI 命令系统 | 耦合过重、可扩展性差 | 1 周 |
| 🟡 中 | 插件/Skill 系统 | 未充分利用、集成度低 | 1 周 |
| 🟢 低 | 配置与类型系统 | 类型分散、缺少统一管理 | 0.5 周 |

---

## 第一部分：问题深度分析

### 1.1 自然语言处理 (NL) 模块问题

#### 问题 1：职责混乱
```typescript
// src/nl/llm.ts - 同时做了太多事情：
// 1. LLM API 调用
// 2. Prompt 构建
// 3. 响应解析
// 4. 会话管理
// 5. 配置加载
```

#### 问题 2：硬编码泛滥
**位置 1: `command-synthesizer.ts`**
```typescript
const COMMAND_TEMPLATES: Record<TaskType, CommandTemplate[]> = {
  GIT_OPERATION: [
    { synthesize: (params) => ({ cli: 'git', args: ['add', '-A'] }) },
    { synthesize: (params) => ({ cli: 'git', args: ['commit', '-m', params.message || 'auto commit'] }) },
    // ... 更多硬编码
  ],
  // ... 200+ 行硬编码逻辑
};

const taskTypeMap: Record<string, TaskType> = {
  IMAGE_COMPRESS: 'CODE_TRANSFORM',
  FILE_FIND: 'QUERY_EXEC',
  // ... 硬编码映射
};
```

**位置 2: `prompt-manager.ts`**
```typescript
const BUILTIN_PROMPTS: Prompt[] = [
  {
    id: 'intent-parser-v1',
    system: `你是一个工作流解析专家...`, // 大段硬编码字符串
    // ...
  },
  // ...
];
```

#### 问题 3：Skill 系统孤立
当前的 skill 系统（`llm-dialog-control`、`iterative-refinement`）存在但没有被整合到核心流程中：
```typescript
// src/nl/llm.ts - 只有一个地方使用了 skill
async generateYAMLWorkflow(userInput: string): Promise<string> {
  const systemPrompt = this.promptManager.buildSystemPrompt(DEFAULT_WORKFLOW_YAML_ID);
  const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 }); // 临时创建，用完即弃
  // ...
}
```

#### 问题 4：两条路径完全独立
关键词匹配和 LLM 解析是两条完全独立的路径，缺少统一的抽象层：
```typescript
// src/commands/run.ts - 复杂的降级逻辑
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

---

### 1.2 工作流引擎模块问题

#### 问题 1：单一职责原则违反
`engine.ts` 承担了太多职责：
- 工作流创建/管理
- 执行调度
- 状态管理
- 拓扑排序
- 变量插值
- 审计日志

```typescript
// src/workflow/engine.ts - 500+ 行代码，太多职责
function topologicalSort(steps: Step[]): Step[] { /* ... */ }
function interpolateStep(step: Step, context: ExecutionContext): Step { /* ... */ }
function createWorkflowEngine(): WorkflowEngine { /* ... */ }
```

#### 问题 2：状态管理混乱
使用闭包变量管理执行状态，难以测试和维护：
```typescript
let workflowCounter = 0;
let executionCounter = 0;

// 还有多个状态变量分散在函数中
```

#### 问题 3：重复代码
`executor.ts` 和 `engine.ts` 中有重复的插值和验证逻辑：
```typescript
// src/workflow/executor.ts - 与 engine.ts 重复
function interpolateString(template: string, context: ExecutionContext): string { /* ... */ }

// src/workflow/engine.ts - 重复实现
function interpolateStep(step: Step, context: ExecutionContext): Step { /* ... */ }
```

---

### 1.3 CLI 命令系统问题

#### 问题 1：命令处理器过于复杂
`run.ts` 中包含了太多业务逻辑：
```typescript
// src/commands/run.ts - 300+ 行代码
function mapIntentToTaskType(intent: string): TaskType { /* ... */ }
function convertLLMResultToTaskList(llmResult: LLMResponse, originalInput: string): ParseResult { /* ... */ }
export const runCmd = new Command('run').action(async () => { /* ... */ });
```

#### 问题 2：缺少中间件/管道模式
没有统一的请求处理管道，很难添加横切关注点（如日志、监控、认证）。

---

### 1.4 Skill 系统问题

#### 问题 1：现有 Skills 未充分利用
- `llm-dialog-control`: 只在一处临时使用
- `iterative-refinement`: 几乎未被使用
- 新添加的 `command-skill`、`intent-skill`、`workflow-skill`、`pipeline-skill` 还未集成

#### 问题 2：缺少 Skill 注册与发现机制
没有统一的 Skill 注册表和生命周期管理。

---

### 1.5 配置与类型系统问题

#### 问题 1：类型定义分散
类型分散在多个文件中，缺少统一组织：
- `src/types/index.ts` - 部分类型
- `src/nl/prompt/types.ts` - 另一部分
- 各模块内部也有类型定义

#### 问题 2：缺少配置系统
配置管理分散，没有统一的配置加载、验证和访问机制。

---

## 第二部分：重构方案

### 2.1 核心设计原则

1. **渐进式重构** - 不破坏现有功能，新旧代码可以并存
2. **测试驱动** - 先写测试，再重构
3. **统一抽象** - 定义清晰的接口，降低耦合
4. **配置优先** - 用配置代替硬编码
5. **Skill 驱动** - 一切可封装为 Skill

---

### 2.2 自然语言处理模块重构

#### 新架构设计
```
src/nl/
├── core/
│   ├── types.ts           # 统一类型定义
│   ├── context.ts         # 上下文管理
│   └── pipeline.ts        # 处理管道
├── skills/                # 核心 Skills
│   ├── intent-skill.ts    # 意图识别
│   ├── command-skill.ts   # 命令生成
│   └── workflow-skill.ts  # 工作流生成
├── prompt/                # Prompt 管理
│   ├── registry.ts        # Prompt 注册表
│   ├── loader.ts          # 从文件加载
│   └── types.ts
├── fallback/              # 降级策略
│   └── keyword-matcher.ts # 关键词匹配
└── index.ts               # 对外接口
```

#### 核心接口定义
```typescript
// src/nl/core/types.ts
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

#### Skill Pipeline 实现
```typescript
// src/nl/core/pipeline.ts
import { SkillRegistry } from '../../skills/registry.js';

export class SkillPipeline implements NLProcessor {
  private skills: Skill[];
  private fallback: NLProcessor;

  constructor(
    private skillRegistry: SkillRegistry,
    fallback: NLProcessor
  ) {
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

    // 降级到关键词匹配
    return this.fallback.parse(context);
  }
}
```

---

### 2.3 工作流引擎模块重构

#### 新架构设计
```
src/workflow/
├── core/
│   ├── types.ts           # 核心类型
│   └── context.ts         # 执行上下文
├── engine/
│   ├── workflow-manager.ts  # 工作流管理
│   ├── state-manager.ts     # 状态管理
│   └── scheduler.ts         # 调度器
├── executor/
│   ├── step-executor.ts     # 单步执行
│   ├── parallel-executor.ts # 并行执行
│   └── interpolator.ts      # 变量插值
├── storage/
│   ├── storage.ts         # 持久化
│   └── types.ts
├── validator/
│   └── workflow-validator.ts # 工作流验证
└── index.ts               # 对外接口
```

#### 核心组件拆分
```typescript
// src/workflow/engine/state-manager.ts
export class ExecutionStateManager {
  private state: ExecutionState;

  constructor() {
    this.state = {
      currentExecution: null,
      executionCounter: 0,
      workflowCounter: 0,
      pauseResolver: null
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

  // ... 其他状态管理方法
}

// src/workflow/engine/scheduler.ts
export class WorkflowScheduler {
  constructor(
    private stateManager: ExecutionStateManager,
    private executor: StepExecutor,
    private storage: WorkflowStorage
  ) {}

  async execute(
    workflow: Workflow,
    options: ExecuteOptions = {}
  ): Promise<ExecutionRecord> {
    // 调度逻辑
  }
}

// src/workflow/executor/interpolator.ts
export class VariableInterpolator {
  interpolateString(template: string, context: ExecutionContext): string { /* ... */ }
  interpolateStep(step: Step, context: ExecutionContext): Step { /* ... */ }
}
```

---

### 2.4 CLI 命令系统重构

#### 新架构设计
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

#### 中间件模式实现
```typescript
// src/commands/core/middleware.ts
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

// src/commands/core/pipeline.ts
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

---

### 2.5 Skill 系统重构

#### 统一 Skill 系统
```typescript
// src/skills/types.ts - 已有，需要完善
export interface SkillContext {
  userInput: string;
  sessionId?: string;
  projectContext?: ProjectContext;
  userPreferences?: UserPreferences;
  executionHistory?: ExecutionRecord[];
}

export interface SkillResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface Skill<TInput = any, TOutput = any> {
  id: string;
  name: string;
  version: string;
  description: string;
  tags: string[];

  canHandle(context: SkillContext): Promise<boolean>;
  execute(input: TInput, context: SkillContext): Promise<SkillResult<TOutput>>;
}
```

#### Skill 注册表增强
```typescript
// src/skills/registry.ts - 已有，需要增强
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
}

interface SkillMetadata {
  author?: string;
  createdAt?: Date;
  lastUpdated?: Date;
  documentation?: string;
  dependencies?: string[];
}
```

---

### 2.6 配置与类型系统重构

#### 统一类型组织
```
src/types/
├── index.ts               # 重新导出所有类型
├── workflow.ts            # 工作流相关类型
├── nl.ts                  # 自然语言相关类型
├── security.ts            # 安全相关类型
├── cli.ts                 # CLI 相关类型
└── skills.ts              # Skill 相关类型
```

#### 配置系统
```typescript
// src/config/types.ts
export interface Config {
  nl: NLConfig;
  workflow: WorkflowConfig;
  security: SecurityConfig;
  cli: CLIConfig;
}

export interface NLConfig {
  enabled: boolean;
  provider?: 'openai' | 'anthropic';
  model?: string;
  fallbackToKeyword: boolean;
  promptDir: string;
  maxRetries: number;
}

// src/config/index.ts
import { loadConfig, mergeConfigs } from './loader.js';
import { validateConfig } from './validator.js';

export class ConfigManager {
  private config: Config;

  constructor(configPath?: string) {
    const defaultConfig = this.getDefaultConfig();
    const userConfig = configPath ? loadConfig(configPath) : {};
    this.config = mergeConfigs(defaultConfig, userConfig);
    validateConfig(this.config);
  }

  get(): Config {
    return this.config;
  }

  get<T>(path: string): T {
    // 通过路径获取配置，如 'nl.enabled'
  }

  private getDefaultConfig(): Config {
    return {
      nl: {
        enabled: true,
        fallbackToKeyword: true,
        promptDir: './config/prompts',
        maxRetries: 3
      },
      // ... 其他默认配置
    };
  }
}
```

---

## 第三部分：实施计划

### Phase 1: 基础设施重构（优先级：最高，1-2 周）

#### 1.1 类型系统统一
- [ ] 重构 `src/types/index.ts`，按模块组织
- [ ] 确保所有模块使用统一类型定义
- [ ] 添加类型测试

#### 1.2 配置系统实现
- [ ] 创建 `src/config/` 模块
- [ ] 实现配置加载、验证
- [ ] 迁移现有配置

#### 1.3 Skill 系统完善
- [ ] 完善 `SkillRegistry`
- [ ] 集成现有的 3 个 Skills
- [ ] 添加 Skill 测试

#### 1.4 向后兼容层
- [ ] 创建适配器，保持现有接口不变
- [ ] 确保旧代码可以继续工作

---

### Phase 2: 工作流引擎重构（优先级：高，1-2 周）

#### 2.1 组件拆分
- [ ] 提取 `ExecutionStateManager`
- [ ] 提取 `WorkflowScheduler`
- [ ] 提取 `VariableInterpolator`
- [ ] 提取 `WorkflowValidator`

#### 2.2 重构实现
- [ ] 重构 `engine.ts`，使用新组件
- [ ] 重构 `executor.ts`
- [ ] 更新测试

#### 2.3 验证
- [ ] 运行完整测试套件
- [ ] 性能基准测试

---

### Phase 3: NL 模块重构（优先级：高，2-3 周）

#### 3.1 核心基础设施
- [ ] 创建 `src/nl/core/` 模块
- [ ] 实现 `NLProcessor` 接口
- [ ] 实现 `SkillPipeline`

#### 3.2 Prompt 管理系统
- [ ] 重构 `prompt-manager.ts` 为 `PromptRegistry`
- [ ] 支持从文件加载 Prompt
- [ ] Prompt 版本管理

#### 3.3 Skill 实现
- [ ] 完善 `IntentSkill`
- [ ] 完善 `CommandSkill`
- [ ] 完善 `WorkflowSkill`
- [ ] 集成现有 skills

#### 3.4 集成与测试
- [ ] 更新 `commands/run.ts` 使用新架构
- [ ] 完整集成测试
- [ ] 性能测试

---

### Phase 4: CLI 命令系统重构（优先级：中，1 周）

#### 4.1 中间件系统
- [ ] 实现中间件接口
- [ ] 实现日志中间件
- [ ] 实现审计中间件
- [ ] 实现错误处理中间件

#### 4.2 命令重构
- [ ] 重构 `run.ts` 使用新架构
- [ ] 迁移其他命令

---

### Phase 5: 优化与清理（优先级：中，1 周）

#### 5.1 清理工作
- [ ] 删除冗余代码
- [ ] 清理硬编码
- [ ] 更新文档

#### 5.2 性能优化
- [ ] 实现缓存机制
- [ ] 懒加载优化
- [ ] 性能基准测试

---

## 第四部分：迁移策略

### 4.1 渐进式迁移

1. **阶段 1**: 创建新架构，新旧并存
2. **阶段 2**: 并行运行，通过配置切换
3. **阶段 3**: 逐步迁移，一个模块一个模块
4. **阶段 4**: 清理旧代码

### 4.2 回退机制

- 所有新功能都有对应的回退方案
- 保留关键词匹配作为兜底
- 保留旧接口作为适配器

### 4.3 测试策略

- 保持现有测试不变作为回归测试
- 为新组件添加完整测试
- 集成测试验证新旧系统兼容性

---

## 第五部分：预期收益

### 5.1 可维护性提升

- 🔧 **职责清晰** - 每个模块职责单一
- 📝 **易于理解** - 清晰的接口定义
- 🧪 **易于测试** - 组件可独立测试

### 5.2 可扩展性提升

- ➕ **易于添加新功能** - 通过 Skill 或中间件扩展
- 🔌 **插件化架构** - 支持第三方扩展
- ⚙️ **配置驱动** - 修改行为不需要改代码

### 5.3 性能提升

- 🚀 **懒加载** - 只在需要时加载模块
- 💾 **缓存机制** - 避免重复计算
- ⚡ **并行优化** - 更好的并行执行支持

### 5.4 开发效率提升

- 📦 **模块化开发** - 团队可并行工作
- 🔧 **清晰文档** - 更好的架构文档
- 🧪 **TDD 友好** - 可测试性强

---

## 第六部分：风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构周期过长 | 🔴 高 | 🟡 中 | 分阶段交付，每个阶段都有可用版本 |
| 兼容性问题 | 🔴 高 | 🟡 中 | 保持向后兼容，完整的测试覆盖 |
| 性能下降 | 🟡 中 | 🟢 低 | 性能基准测试，及时回退 |
| 学习曲线陡峭 | 🟡 中 | 🟡 中 | 完善文档，逐步培训 |
| 团队接受度低 | 🟡 中 | 🟢 低 | 早期反馈，渐进式变更 |

---

## 第七部分：成功指标

### 7.1 代码质量指标

- [ ] 测试覆盖率保持 ≥90%
- [ ] 减少重复代码 ≥50%
- [ ] 单一职责原则符合度 ≥90%
- [ ] 无严重 TypeScript 类型错误

### 7.2 性能指标

- [ ] 启动时间减少 ≥30%
- [ ] 工作流执行时间保持不变或更快
- [ ] 内存使用减少 ≥20%

### 7.3 可维护性指标

- [ ] 添加新意图 ≤30 分钟（通过配置）
- [ ] 添加新 Skill ≤1 小时
- [ ] 修改现有功能 ≤2 小时

---

## 总结

本次重构将：

1. ✅ **统一架构** - 所有模块遵循一致的设计原则
2. ✅ **Skill 驱动** - Skill 成为一等公民
3. ✅ **配置优先** - 减少硬编码，提高灵活性
4. ✅ **可扩展性** - 易于添加新功能和插件
5. ✅ **向后兼容** - 保持现有功能完整，渐进式迁移
6. ✅ **测试保障** - 完整的测试覆盖，确保质量

这不是一次重写，而是一次渐进式的架构优化，将为 VectaHub 的长期发展奠定坚实基础。

---

**附录 A: 文件变更清单**  
**附录 B: 完整的接口定义**  
**附录 C: 迁移指南**
