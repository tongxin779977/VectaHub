# VectaHub 工作流引擎详细设计

> 本文档是工作流引擎的具体实现指南，包含代码结构和实现路径

---

## 1. 核心模块职责

```
┌──────────────────────────────────────────────────────────────┐
│                         CLI 层                               │
│  vectahub run "压缩图片"                                       │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      NL Parser                              │
│  输入: "压缩 current directory 里的所有图片"                    │
│  输出: { intent: 'IMAGE_COMPRESS', params: { pattern: '*.jpg' }}
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Intent Resolver                           │
│  根据 intent 找到对应的意图模板                                │
│  输出: Workflow 对象                                          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   Workflow Engine                            │
│  管理工作流生命周期: 创建 → 执行 → 完成                         │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      Executor                               │
│  执行单个 Step，支持 for_each / if / parallel                │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      Sandbox                                │
│  危险命令检测 + 隔离执行                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 文件结构

```
src/
├── index.ts                    # 入口，CLI 解析
├── nl/
│   ├── parser.ts               # NL Parser
│   ├── intent-matcher.ts       # 意图匹配
│   └── templates/
│       ├── index.ts            # 导出所有模板
│       ├── image-compress.ts   # 图片压缩
│       ├── file-find.ts        # 文件查找
│       ├── backup.ts           # 备份
│       ├── ci-pipeline.ts      # CI 流程
│       ├── git-workflow.ts     # Git 操作
│       └── shell-exec.ts       # 通用 Shell
├── workflow/
│   ├── engine.ts               # 工作流引擎
│   ├── executor.ts             # 执行器
│   ├── storage.ts              # 存储
│   └── types.ts                # 类型定义
├── sandbox/
│   ├── detector.ts             # 危险命令检测
│   ├── macos.ts               # macOS 沙盒
│   ├── linux.ts               # Linux 沙盒
│   └── sandbox.ts             # 沙盒工厂
└── utils/
    ├── logger.ts
    ├── config.ts
    └── ui.ts                   # 输出格式化
```

---

## 3. 类型定义 (types.ts)

```typescript
export type StepType = 'exec' | 'for_each' | 'if' | 'parallel' | 'delegate';
export type WorkflowMode = 'strict' | 'relaxed' | 'consensus';
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';

export interface Step {
  id: string;
  type: StepType;
  cli?: string;
  args?: string[];
  body?: Step[];
  condition?: string;
  dependsOn?: string[];
  items?: string;
  outputVar?: string;
  description?: string;
  delegate_to?: 'gemini' | 'claude' | 'codex' | 'aider' | 'opencli' | 'custom';
  delegate_prompt?: string;
  delegate_context?: Record<string, unknown>;
  delegate_options?: AIDelegateOptions;
}

export interface AIDelegateOptions {
  maxTurns?: number;
  allowedTools?: string[];
  timeout?: number;
  outputFormat?: 'text' | 'json' | 'stream-json';
  sandboxOverride?: boolean;
  retry?: RetryPolicy;
}

export interface RetryPolicy {
  maxRetries: number;
  retryOnExitCodes: number[];
  backoffMs: number;
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
  session_config?: SessionConfig;
}

export interface SessionConfig {
  timeout?: number;
  maxTokenUsage?: number;
  keepAlive?: boolean;
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

---

## 4. NL Parser 实现 (parser.ts)

### 4.1 解析流程

```typescript
import { IntentMatcher } from './intent-matcher';

export class NLParser {
  private matcher: IntentMatcher;

  constructor() {
    this.matcher = new IntentMatcher();
  }

  parse(input: string, context?: ParseContext): IntentMatch | null {
    const normalized = this.normalizeInput(input);

    const match = this.matcher.findBestMatch(normalized);
    if (!match) {
      return null;
    }

    const params = this.extractParams(normalized, match.template);

    return {
      intent: match.intent,
      confidence: match.confidence,
      params,
      workflow: {
        name: match.template.name,
        description: match.template.description,
        mode: this.inferMode(match.intent, context),
        steps: this.buildSteps(match.template, params),
        inputSchema: match.template.params
      }
    };
  }

  private normalizeInput(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private extractParams(input: string, template: IntentTemplate): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    for (const [key, schema] of Object.entries(template.params || {})) {
      const value = this.extractParamValue(input, key, schema);
      if (value !== undefined) {
        params[key] = value;
      } else if (schema.required) {
        params[key] = schema.default ?? this.getDefaultValue(schema.type);
      }
    }

    return params;
  }

  private extractParamValue(input: string, key: string, schema: ParamSchema): unknown {
    const patterns: Record<string, RegExp[]> = {
      pattern: [
        /(?:\*|\.)?\*\.(jpg|jpeg|png|gif|webp)/i,
        /(?:file|pattern|match):\s*([^\s]+)/i,
      ],
      source: [
        /从\s+([^\s]+)/,
        /source[:\s]+([^\s]+)/i,
      ],
      target: [
        /到\s+([^\s]+)/,
        /target[:\s]+([^\s]+)/i,
        /保存到\s+([^\s]+)/,
      ],
      directory: [
        /(?:在|于)\s+([^\s]+?)(?:\s+(?:目录|文件夹))/,
        /(?:directory|dir)[:\s]+([^\s]+)/i,
      ]
    };

    const regexes = patterns[key];
    if (!regexes) return undefined;

    for (const regex of regexes) {
      const match = input.match(regex);
      if (match) {
        return match[1] || match[0];
      }
    }

    return undefined;
  }

  private inferMode(intent: string, context?: ParseContext): WorkflowMode {
    if (context?.ci) return 'strict';
    if (context?.interactive === false) return 'relaxed';
    return 'consensus';
  }

  private buildSteps(template: IntentTemplate, params: Record<string, unknown>): Step[] {
    return template.steps.map((step, index) => ({
      ...step,
      id: `step_${index + 1}`,
      args: this.interpolateArgs(step.args || [], params)
    }));
  }

  private interpolateArgs(args: string[], params: Record<string, unknown>): string[] {
    return args.map(arg => {
      return arg.replace(/\$\{(\w+)\}/g, (_, key) => {
        return String(params[key] ?? arg);
      });
    });
  }

  private getDefaultValue(type: string): unknown {
    switch (type) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'array': return [];
      default: return undefined;
    }
  }
}

interface ParseContext {
  cwd?: string;
  ci?: boolean;
  interactive?: boolean;
}
```

---

## 5. 意图模板 (templates/)

### 5.1 图片压缩模板 (image-compress.ts)

```typescript
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
    },
    directory: {
      type: 'string',
      required: false,
      default: '.',
      description: '目标目录'
    }
  },

  steps: [
    {
      type: 'exec',
      id: 'find-images',
      cli: 'find',
      args: ['${directory}', '-type', 'f', '-name', '${pattern}'],
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

### 5.2 Git 工作流模板 (git-workflow.ts)

```typescript
import { IntentTemplate } from '../intent-matcher';

export const gitWorkflowTemplate: IntentTemplate = {
  name: 'git-workflow',
  intent: 'GIT_WORKFLOW',
  description: 'Git 提交推送流程',

  keywords: ['提交', 'commit', '推送', 'push', 'git'],
  weight: 0.95,

  params: {
    message: {
      type: 'string',
      required: false,
      default: 'update',
      description: '提交信息'
    },
    branch: {
      type: 'string',
      required: false,
      default: 'main',
      description: '目标分支'
    }
  },

  steps: [
    {
      type: 'exec',
      id: 'git-add',
      cli: 'git',
      args: ['add', '-A']
    },
    {
      type: 'exec',
      id: 'git-commit',
      cli: 'git',
      args: ['commit', '-m', '${message}']
    },
    {
      type: 'if',
      id: 'check-branch',
      condition: 'branch != current_branch',
      body: [
        {
          type: 'exec',
          id: 'git-push',
          cli: 'git',
          args: ['push', 'origin', '${branch}']
        }
      ]
    }
  ]
};
```

### 5.3 CI Pipeline 模板 (ci-pipeline.ts)

```typescript
import { IntentTemplate } from '../intent-matcher';

export const ciPipelineTemplate: IntentTemplate = {
  name: 'ci-pipeline',
  intent: 'CI_PIPELINE',
  description: '测试通过后部署',

  keywords: ['测试', 'test', '部署', 'deploy', '构建', 'build', '通过就'],
  weight: 0.85,

  params: {
    testCmd: {
      type: 'string',
      required: false,
      default: 'npm test',
      description: '测试命令'
    },
    deployCmd: {
      type: 'string',
      required: false,
      default: 'npm run deploy',
      description: '部署命令'
    }
  },

  steps: [
    {
      type: 'exec',
      id: 'run-test',
      cli: 'npm',
      args: ['test'],
      outputVar: 'testResult'
    },
    {
      type: 'if',
      id: 'check-test',
      condition: '${testResult.exitCode} == 0',
      body: [
        {
          type: 'exec',
          id: 'run-deploy',
          cli: 'npm',
          args: ['run', 'deploy']
        }
      ]
    }
  ]
};
```

---

## 6. Workflow Engine (engine.ts)

### 6.1 核心实现

```typescript
import { Workflow, ExecutionRecord, Step, StepResult, WorkflowMode } from './types';
import { Executor, ExecutorOptions } from './executor';
import { Storage } from './storage';

export class WorkflowEngine {
  private executor: Executor;
  private storage: Storage;
  private currentExecution?: ExecutionRecord;

  constructor(options?: EngineOptions) {
    this.executor = new Executor(options);
    this.storage = new Storage();
  }

  async execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord> {
    const execution: ExecutionRecord = {
      executionId: this.generateId('exec'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      mode: workflow.mode,
      startedAt: new Date(),
      steps: [],
      warnings: [],
      logs: []
    };

    this.currentExecution = execution;
    this.storage.saveExecution(execution);

    try {
      for (const step of workflow.steps) {
        const stepResult = await this.executeStep(step, workflow, execution);
        execution.steps.push(stepResult);

        if (stepResult.status === 'failed') {
          execution.status = 'failed';
          execution.endedAt = new Date();
          execution.duration = execution.endedAt.getTime() - execution.startedAt.getTime();
          break;
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
      }
    } catch (error) {
      execution.status = 'failed';
      execution.logs.push(`Workflow error: ${error}`);
    }

    execution.endedAt = new Date();
    execution.duration = execution.endedAt.getTime() - execution.startedAt.getTime();
    this.storage.updateExecution(execution);

    return execution;
  }

  private async executeStep(
    step: Step,
    workflow: Workflow,
    execution: ExecutionRecord
  ): Promise<StepResult> {
    const result: StepResult = {
      stepId: step.id,
      status: 'running',
      startAt: new Date()
    };

    try {
      switch (step.type) {
        case 'exec':
          const execResult = await this.executor.exec(
            step.cli!,
            step.args!,
            { mode: workflow.mode, cwd: process.cwd() }
          );
          result.status = execResult.success ? 'completed' : 'failed';
          result.output = execResult.stdout;
          break;

        case 'for_each':
          const items = this.resolveItems(step.items!, execution);
          result.iterations = items.length;
          for (const item of items) {
            for (const bodyStep of step.body || []) {
              const interpolated = this.interpolateStep(bodyStep, { item });
              const bodyResult = await this.executeStep(interpolated, workflow, execution);
              if (bodyResult.status === 'failed') {
                result.status = 'failed';
                break;
              }
            }
          }
          break;

        case 'if':
          if (this.evaluateCondition(step.condition!, execution)) {
            for (const bodyStep of step.body || []) {
              const bodyResult = await this.executeStep(bodyStep, workflow, execution);
              if (bodyResult.status === 'failed') {
                result.status = 'failed';
                break;
              }
            }
          }
          result.status = 'completed';
          break;

        case 'parallel':
          const promises = (step.body || []).map(s =>
            this.executeStep(s, workflow, execution)
          );
          const results = await Promise.all(promises);
          result.status = results.some(r => r.status === 'failed') ? 'failed' : 'completed';
          break;
      }
    } catch (error) {
      result.status = 'failed';
      result.output = undefined;
      result.error = String(error);
    }

    result.endAt = new Date();
    return result;
  }

  private resolveItems(itemsExpr: string, execution: ExecutionRecord): string[] {
    const match = itemsExpr.match(/\$\{(\w+)\.output\}/);
    if (!match) return [];

    const stepId = match[1];
    const stepResult = execution.steps.find(s => s.stepId === stepId);
    if (!stepResult?.output) return [];

    if (Array.isArray(stepResult.output)) {
      return stepResult.output.map(String);
    }
    return String(stepResult.output).split('\n').filter(Boolean);
  }

  private evaluateCondition(condition: string, execution: ExecutionRecord): boolean {
    const testMatch = condition.match(/\$\{(\w+)\.exitCode\}\s*==\s*0/);
    if (testMatch) {
      const stepId = testMatch[1];
      const stepResult = execution.steps.find(s => s.stepId === stepId);
      return stepResult?.output === 0;
    }
    return false;
  }

  private interpolateStep(step: Step, context: Record<string, unknown>): Step {
    return {
      ...step,
      cli: step.cli?.replace(/\$\{item\}/g, String(context.item)),
      args: step.args?.map(arg =>
        arg.replace(/\$\{item\}/g, String(context.item))
      )
    };
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

interface EngineOptions {
  sandboxEnabled?: boolean;
  timeout?: number;
}

interface ExecuteOptions {
  dryRun?: boolean;
}
```

---

### 6.2 执行状态机

VectaHub 工作流引擎实现了一个完整的状态机来管理执行生命周期：

```typescript
type ExecutionState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'PAUSING' | 'ABORTING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
```

**状态转换图**：

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
              ┌──────────┐                                     │
              │   IDLE   │                                     │
              └────┬─────┘                                     │
                   │ execute()                                 │
                   ▼                                           │
           ┌───────────────┐                                   │
           │    RUNNING    │◄────────────────────────┐         │
           └───────┬───────┘                         │         │
                   │                                 │         │
         ┌─────────┼─────────┐                       │         │
         │         │         │                       │         │
         ▼         ▼         ▼                       │         │
    ┌────────┐ ┌────────┐ ┌──────────┐              │         │
    │COMPLETED│ │ FAILED │ │  PAUSING  │              │         │
    └────────┘ └────────┘ └────┬─────┘              │         │
                                │                     │         │
                                ▼                     │         │
                          ┌──────────┐               │         │
                          │  PAUSED  │─── resume() ──┘         │
                          └────┬─────┘                         │
                               │                               │
                               ▼                               │
                         ┌──────────┐                          │
                         │ ABORTING │                          │
                         └────┬─────┘                          │
                              │                                │
                              ▼                                │
                         ┌──────────┐                          │
                         │ ABORTED  │                          │
                         └──────────┘                          │
```

**状态说明**：

| 状态 | 描述 | 可转换到 |
|------|------|----------|
| `IDLE` | 初始状态，无执行进行中 | `RUNNING` |
| `RUNNING` | 工作流正在执行 | `PAUSING`, `COMPLETED`, `FAILED`, `ABORTING` |
| `PAUSING` | 正在暂停（等待当前命令终止） | `PAUSED`, `ABORTING` |
| `PAUSED` | 已暂停，可恢复或终止 | `RUNNING`, `ABORTING` |
| `ABORTING` | 正在终止（发送 SIGKILL） | `ABORTED` |
| `COMPLETED` | 工作流成功完成 | `IDLE` |
| `FAILED` | 工作流执行失败 | `IDLE` |
| `ABORTED` | 工作流被用户终止 | `IDLE` |

**核心方法**：

```typescript
interface WorkflowEngine {
  execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord>;
  executeAsync(workflow: Workflow, options?: ExecuteOptions): void;
  pause(): boolean;
  resume(): boolean;
  abort(): boolean;
  getStatus(): ExecutionRecord | undefined;
  waitForCompletion(): Promise<ExecutionRecord>;
}
```

**pause/resume/abort 实现**：

```typescript
pause(): boolean {
  if (executionState !== 'RUNNING') {
    return false;
  }
  setState('PAUSING');
  executor.killCurrentProcess();  // 终止当前子进程
  setState('PAUSED');
  return true;
}

resume(): boolean {
  if (executionState !== 'PAUSED') {
    return false;
  }
  setState('RUNNING');
  if (pauseResolver) {
    pauseResolver();  // 唤醒暂停的循环
  }
  return true;
}

abort(): boolean {
  if (executionState !== 'RUNNING' && executionState !== 'PAUSED') {
    return false;
  }
  setState('ABORTING');
  executor.killCurrentProcess();  // 强制终止
  if (pauseResolver) {
    pauseResolver();  // 唤醒暂停的循环
  }
  setState('ABORTED');
  return true;
}
```

**关键设计点**：

1. **原子性状态转换**：所有状态变更通过 `setState()` 函数集中处理
2. **进程终止**：使用 `SIGKILL` 确保子进程被强制终止
3. **Promise 暂停**：使用 `pauseResolver` 保存暂停时的 Promise resolve 函数
4. **异步执行支持**：`executeAsync()` + `waitForCompletion()` 支持非阻塞执行

---

## 7. Executor 实现 (executor.ts)

### 7.1 核心执行器

```typescript
import { spawn } from 'child_process';
import { Sandbox, SandboxOptions } from '../sandbox/sandbox';
import { DangerDetector, DangerLevel } from '../sandbox/detector';
import { CLIResult, WorkflowMode } from './types';

export class Executor {
  private sandbox: Sandbox;
  private detector: DangerDetector;

  constructor(options?: ExecutorOptions) {
    this.sandbox = new Sandbox(options);
    this.detector = new DangerDetector();
  }

  async exec(
    cli: string,
    args: string[],
    options: ExecOptions
  ): Promise<CLIResult> {
    const startTime = Date.now();
    const command = `${cli} ${args.join(' ')}`;

    const danger = this.detector.analyze(command);
    if (danger.level !== 'none') {
      const allowed = this.shouldAllow(danger, options.mode);
      if (!allowed) {
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: `Dangerous command blocked: ${danger.reason}`,
          duration: Date.now() - startTime
        };
      }
    }

    return new Promise((resolve) => {
      const proc = spawn(cli, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        shell: true
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          exitCode: code ?? 1,
          stdout,
          stderr,
          duration: Date.now() - startTime
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: err.message,
          duration: Date.now() - startTime
        });
      });

      setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          exitCode: 124,
          stdout,
          stderr: 'Command timeout',
          duration: Date.now() - startTime
        });
      }, options.timeout || 60000);
    });
  }

  private shouldAllow(danger: DangerResult, mode: WorkflowMode): boolean {
    if (danger.level === 'critical') {
      return mode === 'consensus';
    }
    if (danger.level === 'high') {
      return mode === 'consensus' || mode === 'relaxed';
    }
    return true;
  }
}

interface ExecutorOptions {
  sandboxEnabled?: boolean;
  timeout?: number;
}

interface ExecOptions {
  mode: WorkflowMode;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

interface DangerResult {
  level: DangerLevel;
  reason?: string;
}
```

---

## 8.5 AI 委派执行器 (AIDelegateExecutor)

### 8.5.1 设计目标

支持将工作流步骤委派给外部 AI CLI 工具执行，实现跨工具协作。

### 8.5.2 AI CLI 适配器接口

```typescript
interface AIAdapter {
  name: string;
  version: string;
  headlessCommand: string;
  allowedTools?: string[];
  maxTurns?: number;
  outputFormat?: 'text' | 'json' | 'stream-json';
  sandboxCompatible: boolean;
  recommendedTimeout: number;
  healthCheck(): Promise<boolean>;
  buildCommand(prompt: string, context?: Record<string, unknown>, options?: AIDelegateOptions): string;
  parseOutput(stdout: string, options?: AIDelegateOptions): ParsedAIOutput;
}

interface ParsedAIOutput {
  success: boolean;
  result: string;
  metadata?: Record<string, unknown>;
  tokenUsage?: number;
  error?: string;
}
```

### 8.5.3 预定义 AI 适配器

#### Gemini CLI 适配器

```typescript
const GEMINI_ADAPTER: AIAdapter = {
  name: 'gemini',
  version: '>=2.5.0',
  headlessCommand: 'gemini -p',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'json',
  sandboxCompatible: false,  // 沙盒模式有已知问题
  recommendedTimeout: 120000,

  healthCheck(): Promise<boolean> {
    return spawn('gemini', ['--version']).then(r => r.exitCode === 0);
  },

  buildCommand(prompt, context, options): string {
    let cmd = `${this.headlessCommand} "${prompt}"`;
    if (options?.allowedTools) {
      cmd += ` --allowedTools "${options.allowedTools.join(',')}"`;
    }
    if (options?.maxTurns) {
      cmd += ` --max-turns ${options.maxTurns}`;
    }
    if (options?.outputFormat) {
      cmd += ` --output-format ${options.outputFormat}`;
    }
    if (context) {
      const ctxFile = writeContextToFile(context);
      cmd += ` --context ${ctxFile}`;
    }
    return cmd;
  },

  parseOutput(stdout, options): ParsedAIOutput {
    if (options?.outputFormat === 'json') {
      try {
        const parsed = JSON.parse(stdout);
        return {
          success: true,
          result: parsed.result || stdout,
          metadata: parsed,
          tokenUsage: parsed.tokenUsage,
        };
      } catch {
        return { success: true, result: stdout };
      }
    }
    return { success: true, result: stdout };
  }
};
```

#### Claude Code 适配器

```typescript
const CLAUDE_ADAPTER: AIAdapter = {
  name: 'claude',
  version: '>=1.0.33',
  headlessCommand: 'claude -p',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'json',
  sandboxCompatible: true,
  recommendedTimeout: 180000,

  healthCheck(): Promise<boolean> {
    return spawn('claude', ['--version']).then(r => r.exitCode === 0);
  },

  buildCommand(prompt, context, options): string {
    let cmd = `${this.headlessCommand} "${prompt}"`;
    if (options?.allowedTools) {
      cmd += ` --allowedTools "${options.allowedTools.join(',')}"`;
    }
    if (options?.maxTurns) {
      cmd += ` --max-turns ${options.maxTurns}`;
    }
    if (options?.outputFormat) {
      cmd += ` --output-format ${options.outputFormat}`;
    }
    return cmd;
  },

  parseOutput(stdout, options): ParsedAIOutput {
    if (options?.outputFormat === 'json') {
      try {
        return { success: true, result: stdout, metadata: JSON.parse(stdout) };
      } catch {
        return { success: true, result: stdout };
      }
    }
    return { success: true, result: stdout };
  }
};
```

#### Codex CLI 适配器

```typescript
const CODEX_ADAPTER: AIAdapter = {
  name: 'codex',
  version: '>=1.0.0',
  headlessCommand: 'codex exec',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'json',
  sandboxCompatible: true,  // 自带云端沙盒
  recommendedTimeout: 300000,

  healthCheck(): Promise<boolean> {
    return spawn('codex', ['--version']).then(r => r.exitCode === 0);
  },

  buildCommand(prompt, context, options): string {
    let cmd = `${this.headlessCommand} "${prompt}"`;
    if (options?.allowedTools) {
      cmd += ` --allowedTools "${options.allowedTools.join(',')}"`;
    }
    if (options?.maxTurns) {
      cmd += ` --max-turns ${options.maxTurns}`;
    }
    if (options?.outputFormat === 'json') {
      cmd += ' --json';
    }
    if (options?.timeout) {
      cmd += ` --timeout ${options.timeout}`;
    }
    return cmd;
  },

  parseOutput(stdout, options): ParsedAIOutput {
    if (options?.outputFormat === 'json') {
      try {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        return { success: true, result: stdout, metadata: JSON.parse(lastLine) };
      } catch {
        return { success: true, result: stdout };
      }
    }
    return { success: true, result: stdout };
  }
};
```

#### Aider 适配器

```typescript
const AIDER_ADAPTER: AIAdapter = {
  name: 'aider',
  version: '>=0.50.0',
  headlessCommand: 'aider --message',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'text',
  sandboxCompatible: true,
  recommendedTimeout: 120000,

  healthCheck(): Promise<boolean> {
    return spawn('aider', ['--version']).then(r => r.exitCode === 0);
  },

  buildCommand(prompt, context, options): string {
    let cmd = `${this.headlessCommand} "${prompt}"`;
    if (options?.allowedTools) {
      cmd += ` --yes`;
    }
    return cmd;
  },

  parseOutput(stdout): ParsedAIOutput {
    return { success: true, result: stdout };
  }
};
```

### 8.5.4 委派执行器实现

```typescript
class AIDelegateExecutor {
  private adapters: Map<string, AIAdapter>;
  private sessionManager: AISessionManager;

  constructor() {
    this.adapters = new Map([
      ['gemini', GEMINI_ADAPTER],
      ['claude', CLAUDE_ADAPTER],
      ['codex', CODEX_ADAPTER],
      ['aider', AIDER_ADAPTER],
    ]);
    this.sessionManager = new AISessionManager();
  }

  async execute(step: Step, options: ExecutorOptions): Promise<StepResult> {
    if (step.type !== 'delegate') {
      throw new Error(`Invalid step type for delegate execution: ${step.type}`);
    }

    const adapter = this.adapters.get(step.delegate_to!);
    if (!adapter) {
      throw new Error(`AI adapter not found: ${step.delegate_to}`);
    }

    const startTime = Date.now();

    try {
      // 健康检查
      const healthy = await adapter.healthCheck();
      if (!healthy) {
        throw new Error(`${adapter.name} is not available. Please install it first.`);
      }

      // 沙盒兼容性检查
      if (options.sandboxEnabled && !adapter.sandboxCompatible) {
        throw new Error(
          `${adapter.name} is not compatible with sandbox mode. ` +
          `Please disable sandbox for this step or use a different adapter.`
        );
      }

      // 构建命令
      const command = adapter.buildCommand(
        step.delegate_prompt!,
        step.delegate_context,
        step.delegate_options
      );

      // 执行命令
      const result = await this.executeWithRetry(
        command,
        step.delegate_options?.retry || DEFAULT_RETRY,
        options
      );

      // 解析输出
      const parsedOutput = adapter.parseOutput(result.stdout, step.delegate_options);

      return {
        stepId: step.id,
        status: parsedOutput.success ? 'completed' : 'failed',
        startAt: new Date(startTime),
        endAt: new Date(),
        output: parsedOutput.result,
        error: parsedOutput.error,
        metadata: parsedOutput.metadata,
      };
    } catch (error) {
      return {
        stepId: step.id,
        status: 'failed',
        startAt: new Date(startTime),
        endAt: new Date(),
        error: String(error),
      };
    }
  }

  private async executeWithRetry(
    command: string,
    retry: RetryPolicy,
    options: ExecutorOptions
  ): Promise<CLIResult> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts <= retry.maxRetries) {
      try {
        const result = await spawn(command, [], {
          cwd: options.cwd || process.cwd(),
          env: { ...process.env, ...options.env },
          timeout: options.timeout || 120000,
        });

        if (result.exitCode === 0 || !retry.retryOnExitCodes.includes(result.exitCode)) {
          return result;
        }

        lastError = new Error(`Command failed with exit code ${result.exitCode}`);
        attempts++;

        if (attempts <= retry.maxRetries) {
          await this.delay(retry.backoffMs * attempts);
        }
      } catch (error) {
        lastError = error as Error;
        attempts++;

        if (attempts <= retry.maxRetries) {
          await this.delay(retry.backoffMs * attempts);
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 8.5.5 AI 会话管理器

```typescript
interface AISession {
  id: string;
  adapter: string;
  process: ChildProcess;
  lastUsed: Date;
  isActive(): boolean;
  isExpired(): boolean;
  tokenUsage: number;
  context: Record<string, unknown>;
}

class AISessionManager {
  private sessions: Map<string, AISession>;
  private config: SessionConfig;

  constructor(config?: SessionConfig) {
    this.sessions = new Map();
    this.config = config || {
      timeout: 1800000,  // 30 分钟
      maxTokenUsage: 100000,
      keepAlive: true,
    };
  }

  async getSession(adapter: string, context: SessionContext): Promise<AISession> {
    const key = `${adapter}:${JSON.stringify(context)}`;

    if (this.sessions.has(key)) {
      const session = this.sessions.get(key)!;
      if (session.isActive() && !session.isExpired()) {
        return session;
      }
    }

    return this.createSession(adapter, context);
  }

  private async createSession(adapter: string, context: SessionContext): Promise<AISession> {
    const aiAdapter = this.adapters.get(adapter);
    if (!aiAdapter) {
      throw new Error(`Adapter not found: ${adapter}`);
    }

    const process = spawn(adapter, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: context.cwd || process.cwd(),
    });

    const session: AISession = {
      id: `${adapter}_${Date.now()}`,
      adapter,
      process,
      lastUsed: new Date(),
      tokenUsage: 0,
      context,
      isActive(): boolean {
        return !process.killed;
      },
      isExpired(): boolean {
        return Date.now() - this.lastUsed.getTime() > this.config.timeout;
      }
    };

    return session;
  }

  async executeViaStdin(session: AISession, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      session.process.stdin.write(`${prompt}\n`);

      let output = '';
      const onData = (data: Buffer) => {
        output += data.toString();
        if (this.isOutputComplete(output)) {
          session.process.stdout.off('data', onData);
          resolve(output);
        }
      };

      session.process.stdout.on('data', onData);
      session.process.on('error', reject);
    });
  }

  private isOutputComplete(output: string): boolean {
    // 实现输出完整性检测
    return output.includes('\n\n') || output.includes('✅') || output.includes('Done');
  }

  cleanup(): void {
    for (const session of this.sessions.values()) {
      session.process.kill();
    }
    this.sessions.clear();
  }
}
```

### 8.5.6 使用示例

```yaml
# ~/.vectahub/workflows/ai-assisted-dev.yaml
name: "AI 辅助开发流程"
session_config:
  timeout: 1800000
  maxTokenUsage: 100000
  keepAlive: true

steps:
  - id: review
    type: delegate
    delegate_to: gemini
    delegate_prompt: "Review the code in src/ for potential bugs"
    outputVar: reviewResult
    delegate_options:
      maxTurns: 5
      allowedTools: ["Read"]
      outputFormat: "json"

  - id: fix
    type: delegate
    delegate_to: claude
    delegate_prompt: "Fix the issues: ${review}"
    delegate_context:
      review: "${reviewResult}"
    outputVar: fixResult
    delegate_options:
      allowedTools: ["Read", "Edit", "Bash"]
      maxTurns: 10

  - id: tests
    type: delegate
    delegate_to: aider
    delegate_prompt: "Write unit tests for the fixed code"
    outputVar: testResult
    delegate_options:
      allowedTools: ["Read", "Edit", "Bash"]

  - id: run-tests
    type: exec
    cli: "npm"
    args: ["test"]
    dependsOn: ["tests"]
```

---

## 8.6 AI 守护进程架构

> 你最初提出的方案：通过一个守护进程持续运行 AI CLI 工具，VectaHub 通过任务队列与守护进程通信，避免重复启动 AI CLI 工具的开销。

### 8.6.1 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VectaHub CLI                                 │
│  vectahub run "用 Gemini 审查代码，然后用 Claude 修复问题"           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ IPC (Unix Socket / Named Pipe)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    vectahub-daemon (守护进程)                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    TaskQueueManager                              │ │
│  │  • 任务队列: 接收/分发任务                                       │ │
│  │  • 任务状态: pending/running/completed/failed                   │ │
│  │  • 优先级: 高/中/低                                             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐ │
│  │    AISessionManager      │  │    SessionStore                  │ │
│  │  • 管理 AI 工具进程      │  │  • 会话状态持久化               │ │
│  │  • 会话复用/创建/清理    │  │  • 上下文保持                    │ │
│  │  • stdin/stdout 通信     │  │  • Token 使用追踪               │ │
│  └──────────────────────────┘  └──────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    HealthChecker                                │ │
│  │  • AI 工具健康检查                                              │ │
│  │  • 会话超时检测                                                 │ │
│  │  • 资源清理                                                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ spawn() / stdio
                            ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Gemini CLI      │  │  Claude Code     │  │  Codex CLI       │
│  (持久进程)      │  │  (持久进程)      │  │  (持久进程)      │
│  stdin/stdout    │  │  stdin/stdout    │  │  stdin/stdout    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### 8.6.2 守护进程接口

```typescript
// src/daemon/types.ts

// 任务定义
interface AITask {
  id: string;
  adapter: string;          // gemini/claude/codex/aider
  prompt: string;
  context?: Record<string, unknown>;
  options?: AIDelegateOptions;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: AITaskResult;
  error?: string;
}

interface AITaskResult {
  output: string;
  metadata?: Record<string, unknown>;
  tokenUsage?: number;
  duration: number;
}

// 任务队列接口
interface TaskQueueManager {
  enqueue(task: AITask): Promise<string>;
  dequeue(adapter: string): Promise<AITask | null>;
  getStatus(taskId: string): Promise<AITask>;
  getTasks(adapter?: string): Promise<AITask[]>;
  cancel(taskId: string): Promise<boolean>;
}

// 会话管理接口
interface AIDaemonSession {
  id: string;
  adapter: string;
  process: ChildProcess;
  lastUsed: Date;
  createdAt: Date;
  isActive: boolean;
  isIdle: boolean;  // 进程在运行但无任务
  tokenUsage: number;
  tasksCompleted: number;
  context: Record<string, unknown>;
}

interface AIDaemonSessionManager {
  getSession(adapter: string, context?: Record<string, unknown>): Promise<AIDaemonSession>;
  executeViaStdin(session: AIDaemonSession, prompt: string): Promise<string>;
  keepAlive(session: AIDaemonSession): Promise<void>;
  cleanup(session: AIDaemonSession): Promise<void>;
  cleanupAll(): Promise<void>;
  listSessions(): Promise<AIDaemonSession[]>;
}

// 守护进程配置
interface DaemonConfig {
  socketPath: string;           // Unix Socket 路径
  taskQueueSize: number;        // 任务队列大小
  sessionTimeout: number;       // 会话超时 (ms)
  idleTimeout: number;          // 空闲超时 (ms)
  maxConcurrentSessions: number; // 最大并发会话数
  healthCheckInterval: number;  // 健康检查间隔 (ms)
  autoCleanup: boolean;         // 自动清理过期会话
}
```

### 8.6.3 守护进程实现

```typescript
// src/daemon/index.ts
import { spawn, ChildProcess } from 'child_process';
import { createServer, connect, Socket } from 'net';
import { AITask, AITaskResult, TaskQueueManager, DaemonConfig, AIDaemonSession } from './types';
import { AIAdapter } from '../workflow/ai-delegate';

class AIDaemon {
  private config: DaemonConfig;
  private taskQueues: Map<string, AITask[]> = new Map();  // per adapter
  private sessions: Map<string, AIDaemonSession> = new Map();
  private adapters: Map<string, AIAdapter>;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(config?: Partial<DaemonConfig>) {
    this.config = {
      socketPath: `${os.tmpdir()}/vectahub-daemon.sock`,
      taskQueueSize: 1000,
      sessionTimeout: 1800000,  // 30 分钟
      idleTimeout: 300000,      // 5 分钟
      maxConcurrentSessions: 10,
      healthCheckInterval: 60000,  // 1 分钟
      autoCleanup: true,
      ...config
    };
    this.adapters = new Map([
      ['gemini', GEMINI_ADAPTER],
      ['claude', CLAUDE_ADAPTER],
      ['codex', CODEX_ADAPTER],
      ['aider', AIDER_ADAPTER],
    ]);
  }

  // 启动守护进程
  async start(): Promise<void> {
    console.log('Starting vectahub-daemon...');

    // 1. 创建 Unix Socket 服务器
    this.server = createServer((socket) => {
      this.handleConnection(socket);
    });

    // 2. 监听 Socket
    if (fs.existsSync(this.config.socketPath)) {
      fs.unlinkSync(this.config.socketPath);
    }
    this.server.listen(this.config.socketPath);
    console.log(`Daemon listening on ${this.config.socketPath}`);

    // 3. 启动健康检查
    this.startHealthCheck();

    // 4. 加载持久化的会话状态（如果有）
    await this.loadSessionState();

    console.log('Daemon started successfully');
  }

  // 处理客户端连接
  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // 尝试解析完整消息
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) break;

        const message = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        try {
          this.processMessage(JSON.parse(message), socket);
        } catch (error) {
          this.sendResponse(socket, {
            success: false,
            error: `Invalid message: ${error}`,
          });
        }
      }
    });

    socket.on('close', () => {
      console.log('Client disconnected');
    });
  }

  // 处理消息
  private async processMessage(message: DaemonMessage, socket: Socket): Promise<void> {
    switch (message.type) {
      case 'enqueue':
        const taskId = await this.enqueue(message.task);
        this.sendResponse(socket, { success: true, taskId });
        break;

      case 'get_status':
        const task = await this.getTaskStatus(message.taskId);
        this.sendResponse(socket, { success: true, task });
        break;

      case 'list_tasks':
        const tasks = await this.listTasks(message.adapter);
        this.sendResponse(socket, { success: true, tasks });
        break;

      case 'cancel':
        const cancelled = await this.cancelTask(message.taskId);
        this.sendResponse(socket, { success: cancelled });
        break;

      case 'list_sessions':
        const sessions = await this.listSessions();
        this.sendResponse(socket, { success: true, sessions });
        break;

      case 'shutdown':
        await this.shutdown();
        this.sendResponse(socket, { success: true });
        break;

      default:
        this.sendResponse(socket, { success: false, error: 'Unknown message type' });
    }
  }

  // 入队任务
  async enqueue(task: AITask): Promise<string> {
    const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    task.id = taskId;
    task.status = 'pending';
    task.createdAt = new Date();

    if (!this.taskQueues.has(task.adapter)) {
      this.taskQueues.set(task.adapter, []);
    }
    const queue = this.taskQueues.get(task.adapter)!;

    if (queue.length >= this.config.taskQueueSize) {
      throw new Error(`Task queue for ${task.adapter} is full`);
    }

    queue.push(task);
    console.log(`Task enqueued: ${taskId} (${task.adapter})`);

    // 触发任务处理
    this.processNextTask(task.adapter);

    return taskId;
  }

  // 处理下一个任务
  private async processNextTask(adapter: string): Promise<void> {
    const queue = this.taskQueues.get(adapter);
    if (!queue || queue.length === 0) return;

    // 获取或创建会话
    const session = await this.getSession(adapter);
    if (!session) {
      console.error(`No session available for ${adapter}`);
      return;
    }

    const task = queue.shift()!;
    task.status = 'running';
    task.startedAt = new Date();

    try {
      // 构建命令
      const aiAdapter = this.adapters.get(adapter)!;
      const command = aiAdapter.buildCommand(
        task.prompt,
        task.context,
        task.options
      );

      // 执行任务
      const startTime = Date.now();
      const output = await this.executeViaStdin(session, command);

      // 解析结果
      const parsedOutput = aiAdapter.parseOutput(output, task.options);

      task.status = 'completed';
      task.completedAt = new Date();
      task.result = {
        output: parsedOutput.result,
        metadata: parsedOutput.metadata,
        tokenUsage: parsedOutput.tokenUsage,
        duration: Date.now() - startTime,
      };

      session.lastUsed = new Date();
      session.tasksCompleted++;

      console.log(`Task completed: ${task.id} (${task.adapter}, ${task.result.duration}ms)`);
    } catch (error) {
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = String(error);
      console.error(`Task failed: ${task.id} - ${error}`);
    }
  }

  // 获取或创建会话
  private async getSession(adapter: string): Promise<AIDaemonSession | null> {
    // 查找现有空闲会话
    for (const session of this.sessions.values()) {
      if (session.adapter === adapter && session.isIdle && session.isActive) {
        return session;
      }
    }

    // 检查并发限制
    const activeSessions = Array.from(this.sessions.values()).filter(
      s => s.adapter === adapter && s.isActive
    ).length;
    if (activeSessions >= this.config.maxConcurrentSessions) {
      return null;
    }

    // 创建新会话
    return this.createSession(adapter);
  }

  // 创建 AI 工具会话
  private async createSession(adapter: string): Promise<AIDaemonSession> {
    const aiAdapter = this.adapters.get(adapter);
    if (!aiAdapter) {
      throw new Error(`Adapter not found: ${adapter}`);
    }

    // 启动 AI CLI 工具进程
    const process = spawn(adapter, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    const session: AIDaemonSession = {
      id: `${adapter}_${Date.now()}`,
      adapter,
      process,
      lastUsed: new Date(),
      createdAt: new Date(),
      isActive: true,
      isIdle: true,
      tokenUsage: 0,
      tasksCompleted: 0,
      context: {},
    };

    this.sessions.set(session.id, session);

    // 监听进程输出
    this.setupSessionListeners(session);

    console.log(`Session created: ${session.id}`);
    return session;
  }

  // 通过 stdin/stdout 执行任务
  private async executeViaStdin(
    session: AIDaemonSession,
    prompt: string
  ): Promise<string> {
    session.isIdle = false;

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error(`Task execution timeout for ${session.adapter}`));
      }, this.config.sessionTimeout);

      let output = '';
      let isComplete = false;

      const onData = (data: Buffer) => {
        output += data.toString();

        // 检测输出是否完成
        if (this.isOutputComplete(output)) {
          isComplete = true;
          clearTimeout(timeout);
          session.process.stdout?.off('data', onData);
          session.isIdle = true;
          resolve(output.trim());
        }
      };

      session.process.stdout?.on('data', onData);

      // 发送 prompt
      session.process.stdin.write(`${prompt}\n`);

      // 监听进程错误
      session.process.on('error', (error) => {
        if (!isComplete) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  // 检测输出完整性
  private isOutputComplete(output: string): boolean {
    // 多种方式检测输出完成
    return (
      output.includes('\n\n') ||  // 双换行
      output.includes('✅') ||    // 完成标记
      output.includes('Done') ||  // Done 文本
      output.includes('Finished') ||
      this.isJSONComplete(output)  // JSON 完整性
    );
  }

  private isJSONComplete(output: string): boolean {
    try {
      JSON.parse(output);
      return true;
    } catch {
      return false;
    }
  }

  // 启动健康检查
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  // 执行健康检查
  private async performHealthCheck(): Promise<void> {
    const now = Date.now();

    for (const session of this.sessions.values()) {
      // 检查会话是否过期
      if (now - session.lastUsed.getTime() > this.config.sessionTimeout) {
        console.log(`Session expired: ${session.id}`);
        await this.cleanup(session);
        continue;
      }

      // 检查进程是否存活
      if (session.process.killed || session.process.exitCode !== null) {
        console.log(`Session process died: ${session.id}`);
        session.isActive = false;
        await this.cleanup(session);
      }

      // 检查空闲超时
      if (session.isIdle && now - session.lastUsed.getTime() > this.config.idleTimeout) {
        console.log(`Session idle timeout: ${session.id}`);
        await this.cleanup(session);
      }
    }
  }

  // 清理会话
  private async cleanup(session: AIDaemonSession): Promise<void> {
    if (session.process && !session.process.killed) {
      session.process.kill();
    }
    session.isActive = false;
    this.sessions.delete(session.id);
    console.log(`Session cleaned up: ${session.id}`);
  }

  // 关闭守护进程
  async shutdown(): Promise<void> {
    console.log('Shutting down daemon...');

    // 停止健康检查
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // 清理所有会话
    await this.cleanupAll();

    // 关闭 Socket 服务器
    if (this.server) {
      this.server.close();
    }

    // 删除 Socket 文件
    if (fs.existsSync(this.config.socketPath)) {
      fs.unlinkSync(this.config.socketPath);
    }

    console.log('Daemon shut down successfully');
  }

  // 发送响应
  private sendResponse(socket: Socket, response: DaemonResponse): void {
    socket.write(JSON.stringify(response) + '\n');
  }
}

// 消息类型
interface DaemonMessage {
  type: 'enqueue' | 'get_status' | 'list_tasks' | 'cancel' | 'list_sessions' | 'shutdown';
  task?: AITask;
  taskId?: string;
  adapter?: string;
}

interface DaemonResponse {
  success: boolean;
  taskId?: string;
  task?: AITask;
  tasks?: AITask[];
  sessions?: AIDaemonSession[];
  error?: string;
}
```

### 8.6.4 守护进程 CLI 命令

```typescript
// src/daemon/cli.ts
import { Command } from 'commander';
import { connect, Socket } from 'net';
import { DaemonMessage, AITask } from './types';

const daemon = new Command();

daemon
  .name('vectahub-daemon')
  .description('VectaHub AI Daemon')
  .version('1.0.0');

daemon
  .command('start')
  .description('Start the daemon')
  .option('-s, --socket <path>', 'Unix socket path')
  .option('--session-timeout <ms>', 'Session timeout', '1800000')
  .option('--idle-timeout <ms>', 'Idle timeout', '300000')
  .action(async (options) => {
    const daemon = new AIDaemon({
      socketPath: options.socket,
      sessionTimeout: parseInt(options.sessionTimeout),
      idleTimeout: parseInt(options.idleTimeout),
    });
    await daemon.start();
  });

daemon
  .command('stop')
  .description('Stop the daemon')
  .action(async () => {
    const socket = connect({ path: DAEMON_SOCKET });
    socket.write(JSON.stringify({ type: 'shutdown' }) + '\n');

    socket.on('data', (data) => {
      const response = JSON.parse(data.toString());
      if (response.success) {
        console.log('Daemon stopped');
      }
      socket.end();
    });
  });

daemon
  .command('status')
  .description('Show daemon status')
  .action(async () => {
    const socket = connect({ path: DAEMON_SOCKET });
    socket.write(JSON.stringify({ type: 'list_sessions' }) + '\n');

    socket.on('data', (data) => {
      const response = JSON.parse(data.toString());
      if (response.success) {
        console.log('Active Sessions:');
        response.sessions.forEach((session: AIDaemonSession) => {
          console.log(
            `  ${session.id}: ${session.adapter} ` +
            `(tasks: ${session.tasksCompleted}, idle: ${session.isIdle})`
          );
        });
      }
      socket.end();
    });
  });

daemon
  .command('tasks')
  .description('List tasks')
  .option('-a, --adapter <name>', 'Filter by adapter')
  .action(async (options) => {
    const socket = connect({ path: DAEMON_SOCKET });
    socket.write(JSON.stringify({
      type: 'list_tasks',
      adapter: options.adapter,
    }) + '\n');

    socket.on('data', (data) => {
      const response = JSON.parse(data.toString());
      if (response.success) {
        console.log('Tasks:');
        response.tasks.forEach((task: AITask) => {
          console.log(
            `  ${task.id}: ${task.adapter} [${task.status}] - ${task.prompt.slice(0, 50)}...`
          );
        });
      }
      socket.end();
    });
  });

daemon.parse();
```

### 8.6.5 客户端集成（VectaHub CLI）

```typescript
// src/daemon/client.ts
import { connect, Socket } from 'net';

class DaemonClient {
  private socketPath: string;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  // 发送任务到守护进程
  async enqueueTask(task: AITask): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect({ path: this.socketPath });

      socket.on('connect', () => {
        const message: DaemonMessage = { type: 'enqueue', task };
        socket.write(JSON.stringify(message) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        socket.end();

        if (response.success) {
          resolve(response.taskId);
        } else {
          reject(new Error(response.error));
        }
      });

      socket.on('error', reject);
    });
  }

  // 查询任务状态
  async getTaskStatus(taskId: string): Promise<AITask> {
    return new Promise((resolve, reject) => {
      const socket = connect({ path: this.socketPath });

      socket.on('connect', () => {
        const message: DaemonMessage = { type: 'get_status', taskId };
        socket.write(JSON.stringify(message) + '\n');
      });

      socket.on('data', (data) => {
        const response = JSON.parse(data.toString());
        socket.end();

        if (response.success) {
          resolve(response.task);
        } else {
          reject(new Error(response.error));
        }
      });

      socket.on('error', reject);
    });
  }

  // 等待任务完成（轮询）
  async waitForCompletion(taskId: string, timeout: number = 300000): Promise<AITask> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const task = await this.getTaskStatus(taskId);

      if (task.status === 'completed' || task.status === 'failed') {
        return task;
      }

      await this.delay(1000);  // 每秒轮询一次
    }

    throw new Error('Task completion timeout');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 8.6.6 使用示例

```bash
# 1. 启动守护进程（后台运行）
vectahub-daemon start --session-timeout 1800000 &

# 2. 查看守护进程状态
vectahub-daemon status

# 3. VectaHub 执行工作流（自动使用守护进程）
vectahub run "用 Gemini 审查代码，然后用 Claude 修复问题"

# 守护进程自动:
# - 创建 Gemini 会话（启动 gemini 进程，保持运行）
# - 执行审查任务
# - 复用会话执行 Claude 任务
# - 会话空闲 5 分钟后自动清理

# 4. 查看任务列表
vectahub-daemon tasks

# 5. 停止守护进程
vectahub-daemon stop
```

### 8.6.7 两种架构对比

| 特性 | Headless 模式 | 守护进程模式 |
|------|--------------|-------------|
| **实现复杂度** | 低 | 高 |
| **首次调用** | 3-5s（启动 AI CLI） | 3-5s（首次启动） |
| **后续调用** | 3-5s（重复启动） | 0.5-1s（复用会话） |
| **上下文保持** | ❌ 每次丢失 | ✅ 会话内保持 |
| **资源占用** | 用完即释放 | 持续占用 200-500MB |
| **多 AI 支持** | 简单 | 复杂 |
| **调试难度** | 低 | 高 |
| **适用场景** | 低频调用、简单任务 | 高频调用、多步骤任务 |

### 8.6.8 混合架构策略（推荐）

VectaHub 支持两种执行模式，用户可根据需求选择：

```yaml
# ~/.vectahub/config.yaml
ai_execution:
  mode: auto  # headless | daemon | auto
  
  # Headless 模式配置
  headless:
    enabled: true
    default_timeout: 120000
  
  # 守护进程模式配置
  daemon:
    enabled: true
    socket_path: /tmp/vectahub-daemon.sock
    session_timeout: 1800000
    idle_timeout: 300000
    auto_start: true  # 自动启动守护进程
    auto_stop: true   # 空闲时自动停止
  
  # 自动模式策略
  auto:
    # 使用守护进程的条件
    use_daemon_when:
      min_steps: 2                    # 至少 2 个 AI 步骤
      max_time_between_steps: 300000  # 步骤间最大间隔 5 分钟
      same_adapter: true              # 相同 AI 适配器
    
    # 使用 Headless 的条件
    use_headless_when:
      max_steps: 1                    # 只有 1 个 AI 步骤
      different_adapters: true        # 不同 AI 适配器
      low_priority: true              # 低优先级任务
```

---

## 8.7 危险命令检测 (detector.ts)

### 8.1 检测器实现

```typescript
export type DangerLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface DangerResult {
  level: DangerLevel;
  reason?: string;
  pattern?: string;
}

export class DangerDetector {
  private patterns: Array<{
    regex: RegExp;
    level: DangerLevel;
    reason: string;
  }>;

  constructor() {
    this.patterns = [
      // Critical - 系统级危险
      { regex: /^sudo\s+/, level: 'critical', reason: 'Sudo privilege escalation' },
      { regex: /^chmod\s+777/, level: 'critical', reason: 'World-writable permissions' },
      { regex: /^rm\s+-rf\s+\/(?!sandbox)/, level: 'critical', reason: 'Recursive root deletion' },
      { regex: /^dd\s+.*of=\/dev\//, level: 'critical', reason: 'Direct disk write' },
      { regex: /^mkfs/, level: 'critical', reason: 'Filesystem format' },
      { regex: /^shutdown|reboot/, level: 'critical', reason: 'System shutdown/reboot' },

      // High - 文件系统危险
      { regex: />\s*\/etc\//, level: 'high', reason: 'System file overwrite' },
      { regex: /^mv\s+\/\s+/, level: 'high', reason: 'Moving root directory' },
      { regex: /^mount\s+--bind/, level: 'high', reason: 'Bind mount' },

      // Medium - 网络相关
      { regex: /^curl.*--data.*password/, level: 'medium', reason: 'Password in curl command' },
      { regex: /^wget.*--password/, level: 'medium', reason: 'Password in wget command' },

      // Low - 警告级别
      { regex: /^curl\s+https?:\/\//, level: 'low', reason: 'External network request' },
      { regex: /^nc\s+/, level: 'low', reason: 'Netcat network tool' }
    ];
  }

  analyze(command: string): DangerResult {
    for (const pattern of this.patterns) {
      if (pattern.regex.test(command)) {
        return {
          level: pattern.level,
          reason: pattern.reason,
          pattern: pattern.regex.source
        };
      }
    }

    return { level: 'none' };
  }

  isDangerous(command: string): boolean {
    return this.analyze(command).level !== 'none';
  }
}
```

---

## 9. 功能清单

### 9.1 工作流引擎功能

| 功能 | 描述 | 状态 | 说明 |
|------|------|------|------|
| **顺序执行** | 按顺序执行工作流步骤 | ✅ 已实现 | for 循环执行 |
| **for_each 步骤** | 遍历列表执行子步骤 | ✅ 已实现 | items 分割，body 递归执行 |
| **if 条件步骤** | 条件判断执行 | ✅ 已实现 | 支持 `${stepId.exitCode}==0` 和变量比较 |
| **parallel 并行步骤** | 并行执行多个步骤 | ✅ 已实现 | Promise.all 并行 |
| **步骤依赖** | dependsOn 指定步骤依赖 | ✅ 已实现 | 拓扑排序实现 |
| **输出变量传递** | 步骤输出存储到变量 | ✅ 已实现 | `${stepId}` 语法插值 |
| **状态持久化** | 执行状态保存到文件 | ✅ 已实现 | executionRecord 保存到 ~/.vectahub/executions |

### 9.2 执行状态机功能

| 功能 | 描述 | 状态 | 说明 |
|------|------|------|------|
| **状态管理** | 完整状态机实现 | ✅ 已实现 | IDLE/RUNNING/PAUSED/COMPLETED/FAILED |
| **异步执行** | executeAsync 非阻塞执行 | ✅ 已实现 | Promise + completionResolver |
| **暂停** | pause() 暂停执行 | ✅ 已实现 | 暂停循环 + killCurrentProcess |
| **恢复** | resume() 恢复执行 | ✅ 已实现 | pauseResolver() 继续执行 |
| **终止** | abort() 强制终止 | ✅ 已实现 | ABORTING 状态 + kill |
| **状态持久化** | 执行状态保存到文件 | ✅ 已实现 | execute 完成后自动保存到 storage |
| **断点续跑** | 从失败步骤恢复 | ✅ 已实现 | resumeFromFailure 从失败步骤恢复 |

### 9.3 执行器功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **CLI 命令执行** | 执行 shell 命令 | ✅ 已实现 | P0 |
| **危险命令检测** | 黑名单/白名单检测 | ✅ 已实现 | P0 |
| **超时控制** | 命令执行超时 | ✅ 已实现 | P0 |
| **进程终止** | killCurrentProcess | ✅ 已实现 | P0 |
| **沙盒隔离** | bubblewrap/unshare 隔离 | ✅ 已实现 | P0 |
| **命令签名验证** | 防止命令篡改 | ✅ 已实现 | P2 |
| **AI 委派执行** | 委派给 Gemini/Claude/Codex/Aider | ✅ 已实现 | P1 |
| **会话管理** | AI 工具会话复用 | ✅ 已实现 | P1 |
| **上下文传递** | 步骤间上下文传递 | ✅ 已实现 | P1 |
| **重试机制** | 委派失败自动重试 | ✅ 已实现 | P2 |
| **守护进程** | 持久化运行 AI 工具 | ✅ 已实现 | P1 |
| **任务队列** | 守护进程任务调度 | ✅ 已实现 | P1 |
| **健康检查** | AI 会话健康监控 | ✅ 已实现 | P1 |
| **自动启动/停止** | 守护进程生命周期管理 | ✅ 已实现 | P2 |
| **混合架构策略** | Headless/Daemon/Auto 模式 | ✅ 已实现 | P1 |

### 9.4 NL Parser 功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **意图匹配** | 规则匹配识别意图 | ✅ 已实现 | P0 |
| **参数提取** | 从输入中提取参数 | ✅ 已实现 | P0 |
| **工作流生成** | 根据模板生成步骤 | ✅ 已实现 | P0 |
| **LLM 集成** | OpenAI/Anthropic/Ollama | ✅ 已实现 | P0 |
| **上下文理解** | 多轮对话支持 | ✅ 已实现 | P1 |
| **同义词识别** | 模糊匹配支持 | ✅ 已实现 | P2 |

### 9.5 存储功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **执行记录保存** | 保存执行记录到文件 | ✅ 已实现 | P0 |
| **执行记录查询** | 查询历史执行记录 | ✅ 已实现 | P0 |
| **工作流保存** | 保存工作流定义 | ✅ 已实现 | P0 |
| **工作流列表** | 列出所有工作流 | ✅ 已实现 | P0 |
| **审计日志** | 详细审计记录 | ✅ 已实现 | P1 |

---

## 10. 业务架构

### 10.1 核心业务流程

```
用户输入 → NL Parser → Intent Resolver → Workflow Engine → Executor → Sandbox → 执行结果
```

### 10.2 业务组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **CLI** | 接收用户输入 | 自然语言命令 | 解析请求 |
| **NL Parser** | 解析自然语言 | 用户输入字符串 | IntentMatch 对象 |
| **Intent Resolver** | 匹配意图模板 | IntentMatch | Workflow 对象 |
| **Workflow Engine** | 管理执行生命周期 | Workflow | ExecutionRecord |
| **Executor** | 执行单个步骤 | Step | StepResult |
| **Sandbox** | 安全隔离执行 | CLI 命令 | 执行结果 |
| **Storage** | 持久化存储 | ExecutionRecord | 存储结果 |

### 10.3 业务规则

1. **安全规则**：危险命令必须在 CONSENSUS 模式下才能执行
2. **执行规则**：步骤失败时整个工作流失败（可配置跳过）
3. **隔离规则**：所有命令在沙盒环境中执行
4. **审计规则**：所有执行操作必须记录日志

---

## 11. 技术架构

### 11.1 技术选型

| 分类 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **语言** | TypeScript | 5.x | 类型安全 |
| **运行时** | Node.js | 21+ | 异步 IO |
| **CLI** | Commander.js | 12.x | 命令行解析 |
| **日志** | Pino | 8.x | 高性能日志 |
| **沙盒** | sandbox-exec (macOS) | 系统内置 | 原生隔离 |
| **沙盒** | bubblewrap (Linux) | 0.8+ | 用户态隔离 |

### 11.2 模块结构

```
src/
├── cli.ts                    # CLI 入口
├── nl/                       # 自然语言解析
│   ├── parser.ts             # NL Parser
│   ├── intent-matcher.ts     # 意图匹配
│   ├── llm.ts                # LLM 集成
│   └── templates/            # 意图模板
├── workflow/                 # 工作流引擎
│   ├── engine.ts             # 引擎核心
│   ├── executor.ts           # 执行器
│   ├── storage.ts            # 存储
│   └── types.ts              # 类型定义
├── sandbox/                  # 沙盒隔离
│   ├── detector.ts           # 危险命令检测
│   ├── macos.ts              # macOS 沙盒
│   ├── linux.ts              # Linux 沙盒
│   └── sandbox.ts            # 沙盒工厂
└── utils/                    # 工具函数
    ├── logger.ts             # 日志
    ├── config.ts             # 配置
    └── audit.ts              # 审计
```

### 11.3 数据流

```
用户输入 → cli.ts → nl/parser.ts → nl/intent-matcher.ts → workflow/engine.ts → workflow/executor.ts → sandbox/sandbox.ts → 执行结果 → workflow/storage.ts → 返回给用户
```

### 11.4 关键接口

| 接口 | 方法 | 描述 |
|------|------|------|
| **NLParser** | `parse(input)` | 解析自然语言输入 |
| **IntentMatcher** | `findBestMatch(input)` | 匹配最佳意图 |
| **WorkflowEngine** | `execute(workflow)` | 执行工作流 |
| **WorkflowEngine** | `pause()` | 暂停执行 |
| **WorkflowEngine** | `resume()` | 恢复执行 |
| **WorkflowEngine** | `abort()` | 终止执行 |
| **Executor** | `exec(cli, args)` | 执行 CLI 命令 |
| **Sandbox** | `execute(command)` | 在沙盒中执行 |
| **DangerDetector** | `analyze(command)` | 分析命令危险性 |
| **Storage** | `saveExecution(record)` | 保存执行记录 |
| **Storage** | `getExecution(id)` | 获取执行记录 |

---

## 12. CLI 入口 (cli.ts)

### 12.1 主命令实现

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { NLParser } from './nl/parser';
import { WorkflowEngine } from './workflow/engine';
import { Storage } from './workflow/storage';
import { config } from './utils/config';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('vectahub')
  .description('Natural language workflow engine')
  .version('1.0.0');

program
  .command('run')
  .description('Run a workflow from natural language')
  .argument('<intent...>', 'Natural language description')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)')
  .option('-s, --save', 'Save workflow after execution')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (intent, options) => {
    const parser = new NLParser();
    const engine = new WorkflowEngine();
    const storage = new Storage();

    const text = intent.join(' ');
    logger.info(`Parsing intent: "${text}"`);

    const match = parser.parse(text);
    if (!match) {
      logger.error(`Could not understand intent: "${text}"`);
      process.exit(1);
    }

    logger.success(`Intent: ${match.intent}`);
    logger.info(`Confidence: ${(match.confidence * 100).toFixed(0)}%`);
    logger.info('Workflow:');
    match.workflow.steps.forEach((step, i) => {
      logger.info(`  ${i + 1}. [${step.type}] ${step.cli || ''} ${(step.args || []).join(' ')}`);
    });

    if (!options.yes && match.workflow.mode === 'consensus') {
      const confirmed = await logger.confirm('Execute workflow?');
      if (!confirmed) {
        logger.info('Aborted');
        process.exit(0);
      }
    }

    const workflow = {
      ...match.workflow,
      id: `wf_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    logger.info('Executing...');
    const result = await engine.execute(workflow);

    if (result.status === 'completed') {
      logger.success(`Completed in ${(result.duration! / 1000).toFixed(1)}s`);
      if (options.save) {
        storage.saveWorkflow(workflow);
        logger.info('Workflow saved');
      }
    } else {
      logger.error(`Failed: ${result.logs.join(', ')}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List saved workflows')
  .action(() => {
    const storage = new Storage();
    const workflows = storage.listWorkflows();

    if (workflows.length === 0) {
      logger.info('No saved workflows');
      return;
    }

    logger.info('Saved workflows:');
    workflows.forEach(w => {
      logger.info(`  ${w.id}: ${w.name} (${w.steps.length} steps)`);
    });
  });

program
  .command('mode')
  .description('Get or set execution mode')
  .argument('[mode]', 'Mode to set (strict|relaxed|consensus)')
  .action((mode) => {
    if (!mode) {
      logger.info(`Current mode: ${config.get('mode', 'consensus')}`);
      return;
    }

    if (!['strict', 'relaxed', 'consensus'].includes(mode)) {
      logger.error(`Invalid mode: ${mode}`);
      process.exit(1);
    }

    config.set('mode', mode);
    logger.success(`Mode set to: ${mode}`);
  });

program.parse();
```

---

## 13. 使用示例

### 13.1 基本使用

```bash
# 安装
npm install -g vectahub

# 验证安装
vectahub doctor

# 运行自然语言命令
vectahub run 压缩当前目录的图片

# 保存工作流
vectahub run 压缩图片 --save

# 列出保存的工作流
vectahub list

# 设置模式
vectahub mode strict
```

### 10.2 预期输出

```bash
$ vectahub run 压缩当前目录的图片

[INFO] Parsing intent: "压缩当前目录的图片"
[SUCCESS] Intent: IMAGE_COMPRESS
[INFO] Confidence: 90%
[INFO] Workflow:
  1. [exec] find . -type f -name "*.jpg"
  2. [for_each] convert ${item} -quality 80 ${item}

⏳ Mode: CONSENSUS - confirmation required
? Execute workflow? [Y/n] y

[INFO] Executing...
[INFO] Step 1: find . -type f -name "*.jpg"
[SUCCESS] Found 5 files
[INFO] Step 2: for_each (5 iterations)
  ✓ image1.jpg
  ✓ image2.jpg
  ✓ image3.jpg
  ✓ image4.jpg
  ✓ image5.jpg

[SUCCESS] Completed in 2.3s
[INFO] Workflow saved to: ~/.vectahub/workflows/wf_1746076800000.yaml
```

---

## 14. 目录结构

```
~/.vectahub/
├── config.yaml              # 用户配置
├── workflows/              # 保存的工作流
│   ├── wf_001.yaml
│   └── wf_002.yaml
├── executions/            # 执行记录
│   └── exec_001.json
└── logs/                  # 日志
    └── vectahub.log
```

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
status: implementation_ready
```
