# VectaHub LLM 模块重构深度分析报告

> **版本**: 2.0.0  
> **创建日期**: 2026-05-03  
> **状态**: 待执行

---

## 执行摘要

当前 VectaHub 的 LLM 模块存在严重的架构问题，主要表现为：

1. **代码碎片化严重** - LLM 调用逻辑分散在多个文件中
2. **硬编码泛滥** - Prompt、命令模板、意图映射全部硬编码
3. **技能系统未充分利用** - 已有的 skill 框架没有被整合到核心流程
4. **扩展性差** - 添加新的意图或功能需要修改多处代码
5. **缺少统一的抽象层** - 没有清晰的接口定义各个组件的职责

本报告提出完整的重构方案，将 LLM 模块重构为一个可扩展、技能驱动的架构。

---

## 第一部分：当前问题深度分析

### 1.1 代码结构问题

#### 问题1：职责混乱

```typescript
// src/nl/llm.ts - 同时做了太多事情：
// 1. LLM API 调用
// 2. Prompt 构建
// 3. 响应解析
// 4. 会话管理
// 5. 配置加载
```

#### 问题2：硬编码问题

**位置1: `command-synthesizer.ts` - 命令模板**
```typescript
const COMMAND_TEMPLATES: Record<TaskType, CommandTemplate[]> = {
  GIT_OPERATION: [
    { synthesize: (params) => ({ cli: 'git', args: ['add', '-A'] }) },
    { synthesize: (params) => ({ cli: 'git', args: ['commit', '-m', params.message || 'auto commit'] }) },
    // ... 更多硬编码
  ],
  // ... 200+ 行硬编码逻辑
};
```

**位置2: `command-synthesizer.ts` - 意图映射**
```typescript
const taskTypeMap: Record<string, TaskType> = {
  IMAGE_COMPRESS: 'CODE_TRANSFORM',
  FILE_FIND: 'QUERY_EXEC',
  // ... 硬编码映射
};
```

**位置3: `command-synthesizer.ts` - 条件判断**
```typescript
if (intent === 'SYSTEM_INFO') {
  const input = originalInput.toLowerCase();
  if (input.includes('磁盘') || input.includes('disk')) {
    task.commands = [{ cli: 'df', args: ['-h'] }];
  } else if (input.includes('内存') || input.includes('memory')) {
    // ... 更多硬编码逻辑
  }
}
```

**位置4: `prompt-manager.ts` - 硬编码 Prompt**
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

#### 问题3：技能系统孤立

当前的 skill 系统（`llm-dialog-control`、`iterative-refinement`）存在但没有被整合到核心流程中：

```typescript
// src/nl/llm.ts - 只有一个地方使用了 skill
async generateYAMLWorkflow(userInput: string): Promise<string> {
  const systemPrompt = this.promptManager.buildSystemPrompt(DEFAULT_WORKFLOW_YAML_ID);
  const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 });  // 临时创建，用完即弃
  // ...
}
```

### 1.2 架构问题图示

```
┌─────────────────────────────────────────────────────────┐
│                    用户输入                               │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │   createNLParser()    │  ← 关键词匹配优先
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  createTaskFromIntent │  ← 200+ 行硬编码逻辑
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │ COMMAND_TEMPLATES     │  ← 更多硬编码
         └───────────┬───────────┘
                     │
┌────────────────────▼───────────────────────────┐
│  createLLMEnhancedParser() (可选)               │
│  - 硬编码的 Prompt                              │
│  - 简单的 LLM 调用                              │
└────────────────────┬───────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │   工作流执行          │
         └───────────────────────┘

问题：
- 关键词匹配和 LLM 两条路径完全独立
- 硬编码逻辑散落在各处
- 技能系统没有被使用
- 没有统一的抽象
```

---

## 第二部分：重构方案：技能驱动的 LLM 架构

### 2.1 核心设计理念

1. **一切皆 Skill** - 将所有业务逻辑封装为可重用的 Skill
2. **Skill 组合** - 通过组合多个 Skill 完成复杂任务
3. **声明式配置** - 用配置代替硬编码
4. **LLM 优先** - LLM 作为主要处理路径，关键词作为兜底

### 2.2 新架构图示

```
┌─────────────────────────────────────────────────────────────┐
│                       用户输入                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
            ┌──────────────▼────────────────┐
            │  LLM Orchestrator (核心)      │
            └──────────────┬────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ Intent  │       │Workflow │       │ Command │
   │ Skill   │       │ Skill   │       │ Skill   │
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
            ┌──────────────▼────────────────┐
            │      Skill Registry          │
            │  (管理所有可用的 Skill)       │
            └──────────────┬────────────────┘
                           │
            ┌──────────────▼────────────────┐
            │  Prompt Management System     │
            │  (结构化 Prompt, 版本控制)   │
            └──────────────┬────────────────┘
                           │
            ┌──────────────▼────────────────┐
            │    LLM Client (抽象层)        │
            └──────────────┬────────────────┘
                           │
            ┌──────────────▼────────────────┐
            │    Fallback (关键词匹配)      │
            └───────────────────────────────┘
```

### 2.3 核心抽象定义

#### 2.3.1 Skill 接口

```typescript
// src/skills/types.ts
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

export interface CompositeSkill extends Skill {
  skills: Skill[];
  strategy: 'parallel' | 'sequential' | 'conditional';
}
```

#### 2.3.2 Prompt 管理系统增强

```typescript
// src/nl/prompt/types.ts
export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: any;
  description?: string;
}

export interface PromptExample {
  input: Record<string, any>;
  output: any;
  explanation?: string;
}

export interface PromptConstraint {
  type: 'format' | 'content' | 'length' | 'schema';
  rule: string | Record<string, any>;
  validator?: (value: any) => boolean | Promise<boolean>;
}

export interface Prompt {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  
  // Prompt 内容（支持模板变量）
  systemTemplate: string;
  userTemplate: string;
  
  // 变量定义
  variables: PromptVariable[];
  
  // 示例
  examples: PromptExample[];
  
  // 约束
  constraints: PromptConstraint[];
  
  // 元数据
  metadata: {
    author: string;
    createdAt: Date;
    lastUpdated: Date;
    effectiveness: number;  // 0-1
    uses: number;
    successRate: number;
  };
}

export interface PromptRegistry {
  register(prompt: Prompt): void;
  get(id: string): Prompt | undefined;
  list(category?: string): Prompt[];
  build(promptId: string, variables: Record<string, any>): Promise<{ system: string; user: string }>;
  evaluate(promptId: string, testCases: PromptExample[]): Promise<EvaluationResult>;
}
```

---

## 第三部分：具体实现计划

### Phase 1: 核心基础设施（优先级：最高）

#### 1.1 创建 Skill 基础设施

```
src/skills/
├── types.ts           # Skill 核心类型定义
├── registry.ts        # Skill 注册和管理
├── executor.ts        # Skill 执行器
├── composite.ts       # 组合 Skill 支持
└── base.ts            # Skill 基类和工具
```

**文件: `src/skills/types.ts`** (新文件)
```typescript
// 如 2.3.1 节定义
```

**文件: `src/skills/registry.ts`** (新文件)
```typescript
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  
  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }
  
  get(id: string): Skill | undefined {
    return this.skills.get(id);
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

export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
```

#### 1.2 重构 Prompt 管理系统

**文件: `src/nl/prompt/registry.ts`** (新文件，替换现有 prompt-manager.ts)

```typescript
export class PromptRegistryImpl implements PromptRegistry {
  private prompts: Map<string, Prompt> = new Map();
  private promptDir: string;
  
  constructor(promptDir?: string) {
    this.promptDir = promptDir || path.join(process.cwd(), 'config', 'prompts');
    this.loadBuiltinPrompts();
    this.loadUserPrompts();
  }
  
  private loadBuiltinPrompts(): void {
    // 从代码中加载内置 Prompt
  }
  
  private loadUserPrompts(): void {
    // 从文件系统加载用户自定义 Prompt (JSON/YAML)
  }
  
  register(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }
  
  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }
  
  list(category?: string): Prompt[] {
    const prompts = Array.from(this.prompts.values());
    return category ? prompts.filter(p => p.category === category) : prompts;
  }
  
  async build(promptId: string, variables: Record<string, any>): Promise<{ system: string; user: string }> {
    const prompt = this.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }
    
    // 验证变量
    this.validateVariables(prompt, variables);
    
    // 渲染模板
    const system = this.renderTemplate(prompt.systemTemplate, variables);
    const user = this.renderTemplate(prompt.userTemplate, variables);
    
    // 更新元数据
    prompt.metadata.uses++;
    
    return { system, user };
  }
  
  private validateVariables(prompt: Prompt, variables: Record<string, any>): void {
    for (const variable of prompt.variables) {
      if (variable.required && !(variable.name in variables)) {
        throw new Error(`Required variable ${variable.name} not provided`);
      }
    }
  }
  
  private renderTemplate(template: string, variables: Record<string, any>): string {
    // 简单的模板渲染，支持 {{ variable }} 语法
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : '';
    });
  }
}
```

#### 1.3 Prompt 配置文件示例

**目录结构**:
```
config/prompts/
├── intent-parsing/
│   ├── v1.json
│   └── v2.json
├── workflow-generation/
│   ├── v1.yaml
│   └── v2.yaml
└── custom/
    └── my-prompt.json
```

**示例: `config/prompts/intent-parsing/v2.yaml`**
```yaml
id: intent-parser-v2
name: Intent Parser V2
version: 2.0.0
description: 改进版的意图解析器，支持多阶段处理
category: parsing
tags: [intent, parsing, nlp]

systemTemplate: |
  你是一个专业的工作流解析专家。
  
  ## 支持的意图类型
  {{ intentList }}
  
  ## 项目上下文
  {{ projectContext }}
  
  ## 用户偏好
  {{ userPreferences }}

userTemplate: |
  用户输入: {{ userInput }}
  
  历史对话: {{ conversationHistory }}

variables:
  - name: intentList
    type: string
    required: true
    description: 支持的意图列表
  - name: userInput
    type: string
    required: true
  - name: projectContext
    type: string
    required: false
  - name: userPreferences
    type: string
    required: false
  - name: conversationHistory
    type: string
    required: false

examples:
  - input:
      userInput: 查看 git 状态
      intentList: "GIT_WORKFLOW, FILE_FIND, SYSTEM_INFO"
    output:
      intent: GIT_WORKFLOW
      confidence: 0.95
      params: {}
    explanation: 明确提到 git，所以匹配 GIT_WORKFLOW

constraints:
  - type: schema
    rule:
      type: object
      properties:
        intent: { type: string }
        confidence: { type: number, minimum: 0, maximum: 1 }
        params: { type: object }

metadata:
  author: VectaHub Team
  createdAt: 2026-05-03
  lastUpdated: 2026-05-03
  effectiveness: 0.92
  uses: 0
  successRate: 0.88
```

### Phase 2: 核心 Skill 实现（优先级：高）

#### 2.1 IntentSkill - 意图识别 Skill

```typescript
// src/skills/intent-skill.ts
export interface IntentSkillOutput {
  intent: string;
  confidence: number;
  params: Record<string, any>;
}

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
      const intentList = getAllIntentNames().join(', ');
      const projectContext = await buildProjectContext(context);
      const userPreferences = buildUserPreferences(context);
      
      const { system, user } = await promptRegistry.build('intent-parser-v2', {
        userInput,
        intentList,
        projectContext,
        userPreferences,
        conversationHistory: formatHistory(context),
      });
      
      const result = await llmDialogSkill.generateJSON(user, system);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          confidence: 0,
        };
      }
      
      const parsed = result.data as IntentSkillOutput;
      
      // 验证意图是否在支持列表中
      if (!getAllIntentNames().includes(parsed.intent)) {
        return {
          success: false,
          error: `Unknown intent: ${parsed.intent}`,
          confidence: 0,
        };
      }
      
      return {
        success: true,
        data: parsed,
        confidence: parsed.confidence,
      };
    },
  };
}
```

#### 2.2 CommandSkill - 命令生成 Skill

```typescript
// src/skills/command-skill.ts
export interface CommandSkillInput {
  intent: string;
  params: Record<string, any>;
  userInput: string;
}

export interface CommandSkillOutput {
  commands: Array<{ cli: string; args: string[] }>;
}

export function createCommandSkill(
  promptRegistry: PromptRegistry,
  llmDialogSkill: LLMDialogControlSkill
): Skill<CommandSkillInput, CommandSkillOutput> {
  return {
    id: 'vectahub.command',
    name: 'Command Generation',
    version: '2.0.0',
    description: '根据意图生成具体的 CLI 命令',
    tags: ['command', 'cli', 'generation'],
    
    async canHandle(context: SkillContext): Promise<boolean> {
      return true;
    },
    
    async execute(input: CommandSkillInput, context: SkillContext): Promise<SkillResult<CommandSkillOutput>> {
      const { system, user } = await promptRegistry.build('command-generator-v1', {
        intent: input.intent,
        params: JSON.stringify(input.params),
        userInput: input.userInput,
        availableTools: getAvailableTools(),
      });
      
      const result = await llmDialogSkill.generateJSON(user, system);
      
      if (!result.success) {
        // 兜底：使用关键词匹配（从旧代码迁移）
        return {
          success: true,
          data: fallbackToKeywordMatching(input),
          confidence: 0.5,
          metadata: { fallback: true },
        };
      }
      
      return {
        success: true,
        data: result.data as CommandSkillOutput,
        confidence: 0.9,
      };
    },
  };
}
```

#### 2.3 WorkflowSkill - 工作流生成 Skill

```typescript
// src/skills/workflow-skill.ts
export interface WorkflowSkillInput {
  intent: string;
  params: Record<string, any>;
  commands: Array<{ cli: string; args: string[] }>;
  userInput: string;
}

export interface WorkflowSkillOutput {
  workflowYAML: string;
}

export function createWorkflowSkill(
  promptRegistry: PromptRegistry,
  llmDialogSkill: LLMDialogControlSkill
): Skill<WorkflowSkillInput, WorkflowSkillOutput> {
  return {
    id: 'vectahub.workflow',
    name: 'Workflow Generation',
    version: '2.0.0',
    description: '生成完整的 VectaHub 工作流 YAML',
    tags: ['workflow', 'yaml', 'generation'],
    
    async canHandle(context: SkillContext): Promise<boolean> {
      return true;
    },
    
    async execute(input: WorkflowSkillInput, context: SkillContext): Promise<SkillResult<WorkflowSkillOutput>> {
      const { system, user } = await promptRegistry.build('workflow-generator-v2', {
        userInput: input.userInput,
        intent: input.intent,
        commands: JSON.stringify(input.commands),
        workflowSpec: getWorkflowSpec(),
      });
      
      const result = await llmDialogSkill.generateYAML(user, system);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          confidence: 0,
        };
      }
      
      // 验证生成的 YAML
      const validation = validateWorkflowYAML(result.output);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid workflow YAML: ${validation.error}`,
          confidence: 0,
        };
      }
      
      return {
        success: true,
        data: { workflowYAML: result.output },
        confidence: 0.85,
      };
    },
  };
}
```

#### 2.4 CompositeSkill - 组合 Skill

```typescript
// src/skills/pipeline-skill.ts
export function createPipelineSkill(
  intentSkill: Skill<string, IntentSkillOutput>,
  commandSkill: Skill<CommandSkillInput, CommandSkillOutput>,
  workflowSkill: Skill<WorkflowSkillInput, WorkflowSkillOutput>
): CompositeSkill {
  return {
    id: 'vectahub.pipeline',
    name: 'End-to-End Pipeline',
    version: '2.0.0',
    description: '完整的从用户输入到工作流生成的流水线',
    tags: ['pipeline', 'core'],
    skills: [intentSkill, commandSkill, workflowSkill],
    strategy: 'sequential',
    
    async canHandle(context: SkillContext): Promise<boolean> {
      return true;
    },
    
    async execute(userInput: string, context: SkillContext): Promise<SkillResult<{ workflowYAML: string }>> {
      // 阶段 1: 意图识别
      const intentResult = await intentSkill.execute(userInput, context);
      if (!intentResult.success) {
        return intentResult;
      }
      
      // 阶段 2: 命令生成
      const commandResult = await commandSkill.execute({
        intent: intentResult.data!.intent,
        params: intentResult.data!.params,
        userInput,
      }, context);
      if (!commandResult.success) {
        return commandResult;
      }
      
      // 阶段 3: 工作流生成
      const workflowResult = await workflowSkill.execute({
        intent: intentResult.data!.intent,
        params: intentResult.data!.params,
        commands: commandResult.data!.commands,
        userInput,
      }, context);
      
      return workflowResult;
    },
  };
}
```

### Phase 3: 迁移现有代码（优先级：高）

#### 3.1 迁移硬编码的命令模板为 Prompt

将 `command-synthesizer.ts` 中的硬编码逻辑迁移到 Prompt 配置文件中，创建：

- `config/prompts/command-generation/git-commands.yaml`
- `config/prompts/command-generation/npm-commands.yaml`
- `config/prompts/command-generation/system-commands.yaml`

#### 3.2 重构 LLM 客户端

**文件: `src/nl/llm-client.ts`** (重构现有 llm.ts)

```typescript
// 简化的 LLM 客户端，只负责 API 调用
export class LLMClient {
  private config: LLMConfig;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  async chat(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string> {
    // 统一的 LLM 调用逻辑
  }
  
  async chatJSON(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<any> {
    const response = await this.chat(systemPrompt, userPrompt, options);
    return JSON.parse(response);
  }
}
```

#### 3.3 重构 Parser

**文件: `src/nl/parser.ts`** (完全重构)

```typescript
export interface EnhancedNLParser {
  parse(userInput: string, sessionId?: string): Promise<ParseResult>;
}

export function createEnhancedNLParser(
  pipelineSkill: CompositeSkill,
  fallbackParser: NLParser
): EnhancedNLParser {
  return {
    async parse(userInput: string, sessionId?: string): Promise<ParseResult> {
      const context: SkillContext = {
        userInput,
        sessionId,
        projectContext: await getProjectContext(),
        userPreferences: getUserPreferences(),
      };
      
      // 优先使用 Skill Pipeline
      try {
        const result = await pipelineSkill.execute(userInput, context);
        if (result.success && result.confidence >= 0.7) {
          return {
            status: 'SUCCESS',
            taskList: createTaskListFromWorkflow(result.data!.workflowYAML),
            confidenceLevel: getConfidenceLevel(result.confidence),
            originalInput: userInput,
          };
        }
      } catch (error) {
        logger.warn('Skill pipeline failed, falling back to keyword matching', error);
      }
      
      // 兜底：使用关键词匹配
      return fallbackParser.parseToTaskList(userInput, sessionId);
    },
  };
}
```

### Phase 4: CLI 和配置增强（优先级：中）

#### 4.1 添加 LLM 管理命令

```bash
# Prompt 管理
vectahub llm prompts list
vectahub llm prompts show <id>
vectahub llm prompts evaluate <id>
vectahub llm prompts import <file>
vectahub llm prompts export <id>

# Skill 管理
vectahub llm skills list
vectahub llm skills test <id>

# 调试
vectahub llm debug <user-input>
```

#### 4.2 配置文件增强

**文件: `config/vectahub.yaml`**
```yaml
llm:
  enabled: true
  provider: openai
  model: gpt-4o-mini
  fallbackToKeyword: true
  
  # Skill 配置
  skills:
    - id: vectahub.intent
      enabled: true
      prompt: intent-parser-v2
    - id: vectahub.command
      enabled: true
      prompt: command-generator-v1
    - id: vectahub.workflow
      enabled: true
      prompt: workflow-generator-v2
  
  # Prompt 配置
  promptDir: config/prompts
  defaultPromptVersion: v2
```

### Phase 5: 测试和优化（优先级：中）

#### 5.1 单元测试

- Skill 独立测试
- Prompt 渲染测试
- 集成测试

#### 5.2 A/B 测试框架

支持不同 Prompt 版本的 A/B 测试，自动选择效果最好的。

---

## 第四部分：迁移策略

### 4.1 渐进式迁移

**阶段 1** - 基础设施（不影响现有功能）
- 创建 Skill 框架
- 创建 Prompt Registry
- 向后兼容的接口

**阶段 2** - 并行运行
- 新架构和旧代码同时存在
- 通过配置选择使用哪个
- 收集对比数据

**阶段 3** - 逐步迁移
- 一个一个 Skill 替换旧代码
- 保留回退选项

**阶段 4** - 清理旧代码
- 删除硬编码逻辑
- 删除旧的 parser 代码

### 4.2 回退机制

始终保留关键词匹配作为兜底方案，确保即使 LLM 不可用或失败，系统仍能正常工作。

---

## 第五部分：预期收益

### 5.1 可维护性提升

- **配置代替代码** - 修改行为不需要改代码
- **模块化设计** - 每个组件独立，易于理解和修改
- **统一抽象** - 清晰的接口定义

### 5.2 可扩展性提升

- **易于添加新意图** - 只需添加 Prompt 配置
- **易于添加新 Skill** - 实现 Skill 接口即可
- **支持自定义** - 用户可以添加自己的 Prompt 和 Skill

### 5.3 功能增强

- **上下文感知** - 更好地理解用户需求
- **持续优化** - 基于使用数据优化 Prompt
- **智能调试** - LLM 辅助调试

### 5.4 开发效率提升

- **测试更容易** - Skill 可独立测试
- **迭代更快** - Prompt 可热加载，无需重启
- **A/B 测试** - 数据驱动优化

---

## 第六部分：风险和缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构周期过长 | 高 | 中 | 渐进式迁移，分阶段交付 |
| 性能下降 | 中 | 低 | 优化 LLM 调用，添加缓存 |
| 兼容性问题 | 高 | 中 | 保留完整的回退机制 |
| 学习曲线陡峭 | 中 | 中 | 完善文档和示例 |

---

## 第七部分：实施时间线

| 阶段 | 任务 | 预计时间 | 依赖 |
|------|------|----------|------|
| Phase 1 | 基础设施 | 3-4 天 | - |
| Phase 2 | 核心 Skill | 4-5 天 | Phase 1 |
| Phase 3 | 代码迁移 | 3-4 天 | Phase 2 |
| Phase 4 | CLI 增强 | 2-3 天 | Phase 3 |
| Phase 5 | 测试优化 | 3-4 天 | Phase 4 |
| **总计** | | **15-20 天** | |

---

## 总结

本次重构将：

1. ✅ **彻底消除硬编码** - 所有业务逻辑可配置
2. ✅ **充分利用 Skill 系统** - Skill 成为一等公民
3. ✅ **提升可维护性** - 模块化设计，清晰的接口
4. ✅ **增强可扩展性** - 易于添加新功能
5. ✅ **保持向后兼容** - 完整的回退机制

这是一次架构层面的重构，将为 VectaHub 的长期发展奠定坚实基础。

---

**附录 A**: 文件变更清单
**附录 B**: 完整的类型定义
**附录 C**: Prompt 配置示例全集

