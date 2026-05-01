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
export type StepType = 'exec' | 'for_each' | 'if' | 'parallel';
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

## 8. 危险命令检测 (detector.ts)

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

## 9. CLI 入口 (cli.ts)

### 9.1 主命令实现

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

## 10. 使用示例

### 10.1 基本使用

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

## 11. 目录结构

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
