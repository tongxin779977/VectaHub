# VectaHub 模块化设计规范

> 本文档定义 VectaHub 的模块划分、接口契约和协作方式，供多个 Agent 并行开发。

---

## 1. 模块划分

### 1.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    VectaHub 模块化架构                      │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   CLI 模块      │  │   NL 解析模块   │  │  工作流引擎模块  │
│   (vectahub)    │  │   (nl-parser)   │  │  (workflow)     │
│   Agent A       │  │   Agent B       │  │   Agent C       │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │   执行器模块    │
                    │   (executor)    │
                    │    Agent D      │
                    └─────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   沙盒模块      │  │   存储模块      │  │   工具模块      │
│   (sandbox)     │  │   (storage)     │  │   (utils)       │
│   Agent E       │  │   Agent F       │   Agent G        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 1.2 模块职责分配

| 模块 | Agent | 职责 | 交付物 |
|------|-------|------|--------|
| **CLI** | Agent A | 命令行入口、参数解析 | `src/cli.ts` |
| **NL Parser** | Agent B | 自然语言 → 意图 → Workflow | `src/nl/` |
| **Workflow Engine** | Agent C | 工作流执行、状态管理 | `src/workflow/engine.ts` |
| **Executor** | Agent D | CLI 命令执行、危险检测 | `src/workflow/executor.ts` |
| **Sandbox** | Agent E | 沙盒隔离、模式控制 | `src/sandbox/` |
| **Storage** | Agent F | 工作流存储、执行记录 | `src/workflow/storage.ts` |
| **Utils** | Agent G | 日志、配置、UI | `src/utils/` |

---

## 2. 模块接口契约

### 2.1 核心类型定义 (types.ts)

所有模块共用的类型定义，由 **Agent G (Utils)** 负责：

```typescript
// src/workflow/types.ts
export type StepType = 'exec' | 'for_each' | 'if' | 'parallel';
export type WorkflowMode = 'strict' | 'relaxed' | 'consensus';
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface Step {
  id: string;
  type: StepType;
  cli?: string;
  args?: string[];
  body?: Step[];
  condition?: string;
  dependsOn?: string[];
  items?: string;      // for_each: 引用其他步骤的输出
  outputVar?: string; // 存储输出变量名
  description?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  mode: WorkflowMode;
  steps: Step[];
  createdAt: Date;
  updatedAt: Date;
  inputSchema?: Record<string, ParamSchema>;
}

export interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface IntentMatch {
  intent: string;
  confidence: number;
  params: Record<string, unknown>;
  workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface StepResult {
  stepId: string;
  status: ExecutionStatus;
  startAt?: Date;
  endAt?: Date;
  output?: unknown;
  error?: string;
  iterations?: number;
}

export interface ExecutionRecord {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  mode: WorkflowMode;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  steps: StepResult[];
  warnings: string[];
  logs: string[];
}

export interface CLIResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
```

### 2.2 NL Parser 接口

**Agent B** 负责，输出给 **Agent C (Workflow Engine)**：

```typescript
// src/nl/parser.ts
export class NLParser {
  /**
   * 将自然语言转换为工作流
   * @param input 用户输入的自然语言
   * @param context 上下文信息
   * @returns 匹配到的意图和生成的工作流
   */
  parse(input: string, context?: ParseContext): IntentMatch | null;
}

interface ParseContext {
  cwd?: string;           // 当前工作目录
  ci?: boolean;           // 是否 CI 环境
  interactive?: boolean;  // 是否交互模式
}

// src/nl/intent-matcher.ts
export class IntentMatcher {
  /**
   * 查找最佳匹配的意图
   * @param input 标准化后的输入文本
   * @returns 匹配结果
   */
  findBestMatch(input: string): IntentMatchResult | null;
}

interface IntentMatchResult {
  intent: string;
  confidence: number;
  template: IntentTemplate;
}

export interface IntentTemplate {
  name: string;
  intent: string;
  description: string;
  keywords: string[];
  weight: number;
  params?: Record<string, ParamSchema>;
  steps: Step[];
}
```

### 2.3 Workflow Engine 接口

**Agent C** 负责，接收 **NL Parser** 的输出，调用 **Executor**：

```typescript
// src/workflow/engine.ts
export class WorkflowEngine {
  /**
   * 执行工作流
   * @param workflow 工作流对象
   * @param options 执行选项
   * @returns 执行记录
   */
  async execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord>;

  /**
   * 暂停当前执行
   */
  pause(): void;

  /**
   * 恢复执行
   */
  resume(): void;

  /**
   * 终止执行
   */
  abort(): void;

  /**
   * 获取当前状态
   */
  getStatus(): ExecutionRecord | undefined;
}

interface ExecuteOptions {
  dryRun?: boolean;      // 仅预览，不执行
  timeout?: number;      // 超时时间(ms)
}
```

### 2.4 Executor 接口

**Agent D** 负责，被 **Workflow Engine** 调用：

```typescript
// src/workflow/executor.ts
export class Executor {
  /**
   * 执行单个 CLI 命令
   * @param cli 命令名称
   * @param args 参数列表
   * @param options 执行选项
   * @returns 执行结果
   */
  async exec(cli: string, args: string[], options: ExecOptions): Promise<CLIResult>;
}

interface ExecOptions {
  mode: WorkflowMode;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}
```

### 2.5 Sandbox 接口

**Agent E** 负责，被 **Executor** 调用：

```typescript
// src/sandbox/detector.ts
export type DangerLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface DangerResult {
  level: DangerLevel;
  reason?: string;
  pattern?: string;
}

export class DangerDetector {
  /**
   * 分析命令危险性
   * @param command 完整命令字符串
   * @returns 危险等级和原因
   */
  analyze(command: string): DangerResult;

  /**
   * 判断是否危险命令
   */
  isDangerous(command: string): boolean;
}

// src/sandbox/sandbox.ts
export class Sandbox {
  /**
   * 创建隔离环境并执行命令
   * @param command 命令
   * @param mode 执行模式
   * @returns 执行结果
   */
  async run(command: string, mode: WorkflowMode): Promise<CLIResult>;

  /**
   * 设置沙盒模式
   */
  setMode(mode: WorkflowMode): void;

  /**
   * 获取当前模式
   */
  getMode(): WorkflowMode;
}
```

### 2.6 Storage 接口

**Agent F** 负责，被 **Workflow Engine** 调用：

```typescript
// src/workflow/storage.ts
export class Storage {
  /**
   * 保存工作流
   */
  saveWorkflow(workflow: Workflow): void;

  /**
   * 加载工作流
   */
  loadWorkflow(id: string): Workflow | null;

  /**
   * 列出所有工作流
   */
  listWorkflows(): Workflow[];

  /**
   * 删除工作流
   */
  deleteWorkflow(id: string): void;

  /**
   * 保存执行记录
   */
  saveExecution(record: ExecutionRecord): void;

  /**
   * 更新执行记录
   */
  updateExecution(record: ExecutionRecord): void;

  /**
   * 获取执行记录
   */
  getExecution(id: string): ExecutionRecord | null;

  /**
   * 列出执行历史
   */
  listExecutions(workflowId?: string): ExecutionRecord[];
}
```

### 2.7 CLI 接口

**Agent A** 负责，作为入口调用其他模块：

```typescript
// src/cli.ts
export class VectaHubCLI {
  /**
   * 运行自然语言命令
   * @param intent 用户输入
   * @param options 选项
   */
  async run(intent: string[], options: RunOptions): Promise<void>;

  /**
   * 列出工作流
   */
  list(): void;

  /**
   * 设置/获取模式
   */
  mode(mode?: string): void;

  /**
   * 查看状态
   */
  status(): void;

  /**
   * 查看历史
   */
  history(): void;
}

interface RunOptions {
  mode?: WorkflowMode;
  save?: boolean;
  yes?: boolean;
  file?: string;
}
```

---

## 3. 模块协作流程

### 3.1 主流程：NL → Workflow → Execute

```
用户命令: "vectahub run 压缩图片"
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              Agent A (CLI)                          │
│  • 解析命令行参数                                    │
│  • 调用 NL Parser                                   │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              Agent B (NL Parser)                    │
│  • 匹配意图: IMAGE_COMPRESS                         │
│  • 提取参数: { pattern: "*.jpg" }                   │
│  • 返回 IntentMatch                                 │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              Agent C (Workflow Engine)              │
│  • 构建 Workflow 对象                               │
│  • 调用 Storage 保存                                │
│  • 遍历 Steps，调用 Executor                        │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              Agent D (Executor)                      │
│  • 调用 DangerDetector 检测危险命令                   │
│  • 调用 Sandbox.run() 执行                           │
│  • 返回 CLIResult                                   │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              Agent E (Sandbox)                       │
│  • 根据模式决定是否执行                              │
│  • 在隔离环境中运行命令                              │
│  • 返回执行结果                                     │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              Agent F (Storage)                       │
│  • 保存 ExecutionRecord                             │
│  • 更新执行状态                                     │
└─────────────────────────────────────────────────────┘
```

### 3.2 数据流向图

```
用户输入
    │
    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│    CLI      │─────▶│  NL Parser  │─────▶│ Workflow    │
│ (Agent A)   │      │  (Agent B)  │      │ Engine      │
│             │      │             │      │  (Agent C)  │
└─────────────┘      └─────────────┘      └─────────────┘
                                                   │
                    ┌─────────────┐                │
                    │   Storage   │◀───────────────│
                    │  (Agent F)  │                │
                    └─────────────┘                │
                                                   ▼
                              ┌─────────────┐      ┌─────────────┐
                              │  Executor   │─────▶│   Sandbox   │
                              │  (Agent D)  │      │  (Agent E)  │
                              └─────────────┘      └─────────────┘
```

---

## 4. 意图模板规范

### 4.1 模板目录结构

```
src/nl/templates/
├── index.ts            # 导出所有模板
├── image-compress.ts   # 图片压缩
├── file-find.ts        # 文件查找
├── backup.ts           # 备份
├── ci-pipeline.ts      # CI 流程
├── git-workflow.ts     # Git 操作
└── shell-exec.ts       # 通用 Shell
```

### 4.2 模板编写规范

每个模板必须导出一个 `IntentTemplate` 对象：

```typescript
// src/nl/templates/image-compress.ts
import { IntentTemplate } from '../intent-matcher';

export const imageCompressTemplate: IntentTemplate = {
  name: 'image-compress',
  intent: 'IMAGE_COMPRESS',
  description: '压缩图片文件',
  keywords: ['压缩', '缩小', 'resize', 'compress', '图片'],
  weight: 0.9,

  params: {
    pattern: {
      type: 'string',
      required: false,
      default: '*.jpg',
      description: '文件匹配模式'
    },
    quality: {
      type: 'number',
      required: false,
      default: 80,
      description: '压缩质量 1-100'
    }
  },

  steps: [
    {
      type: 'exec',
      id: 'find-images',
      cli: 'find',
      args: ['.', '-type', 'f', '-name', '${pattern}'],
      outputVar: 'images'
    },
    {
      type: 'for_each',
      id: 'compress-images',
      items: '${find-images.output}',
      body: [
        {
          type: 'exec',
          id: 'convert-image',
          cli: 'convert',
          args: ['${item}', '-quality', '${quality}', '${item}']
        }
      ]
    }
  ]
};
```

### 4.3 参数插值规则

| 变量 | 来源 | 示例 |
|------|------|------|
| `${paramName}` | 用户输入解析出的参数 | `${pattern}` → `*.jpg` |
| `${stepId.output}` | 前序步骤的输出 | `${find-images.output}` |
| `${item}` | for_each 循环的当前项 | `${item}` → `a.jpg` |

---

## 5. 配置与环境

### 5.1 配置文件结构

```
~/.vectahub/
├── config.yaml          # 用户配置
├── workflows/           # 保存的工作流
│   ├── wf_xxx.yaml
│   └── wf_yyy.yaml
├── executions/          # 执行记录
│   └── exec_xxx.json
└── intents/             # 自定义意图模板
    └── my-template.yaml
```

### 5.2 config.yaml 格式

```yaml
mode: consensus          # 默认模式
timeout: 60000          # 默认超时(ms)
logLevel: info           # 日志级别
autoSave: false          # 是否自动保存工作流
```

---

## 6. 错误处理规范

### 6.1 错误类型

| 错误码 | 错误类型 | 描述 |
|--------|----------|------|
| 1001 | IntentNotFound | 无法识别意图 |
| 1002 | WorkflowError | 工作流格式错误 |
| 1003 | ExecutionError | 执行失败 |
| 1004 | DangerousCommand | 危险命令被拦截 |
| 1005 | TimeoutError | 执行超时 |
| 1006 | StorageError | 存储操作失败 |

### 6.2 错误处理流程

```
错误发生
    │
    ▼
┌─────────────────────────────────────────────────────┐
│              统一错误处理                            │
│  • 记录日志                                         │
│  • 更新 ExecutionRecord.status = 'failed'           │
│  • 返回用户友好的错误信息                            │
│  • 根据错误类型决定是否重试                          │
└─────────────────────────────────────────────────────┘
```

---

## 7. 开发检查清单

### 7.1 模块开发完成标准

| 模块 | 完成条件 |
|------|----------|
| CLI | 实现所有命令，支持参数解析 |
| NL Parser | 支持 5+ 意图模板，匹配准确率 > 80% |
| Workflow Engine | 支持 exec/for_each/if/parallel |
| Executor | 支持命令执行、超时、危险检测 |
| Sandbox | 支持三种模式，危险命令拦截 |
| Storage | 支持工作流和执行记录的 CRUD |
| Utils | 提供日志、配置、UI 工具函数 |

### 7.2 集成测试标准

- [ ] 端到端测试：`vectahub run "压缩图片"` 完整流程
- [ ] 危险命令拦截测试
- [ ] 三种模式切换测试
- [ ] 工作流保存/加载测试
- [ ] 执行记录查询测试

---

## 8. 协作规范

### 8.1 分支管理

```
main                    # 稳定版本
├── dev                 # 开发分支
│   ├── feature/cli     # Agent A
│   ├── feature/nl      # Agent B
│   ├── feature/workflow # Agent C
│   ├── feature/executor # Agent D
│   ├── feature/sandbox  # Agent E
│   ├── feature/storage  # Agent F
│   └── feature/utils    # Agent G
```

### 8.2 PR 提交规范

```
[模块] 描述

例如：
[CLI] 添加 run 命令
[NL] 实现意图匹配
[Workflow] 支持 for_each 步骤
```

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
status: ready_for_development
modules: 7
agents: 7
```
