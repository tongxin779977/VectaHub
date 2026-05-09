# VectaHub 工作流引擎详细设计

> 版本: 1.1.1 | 最后更新: 2026-05-10

本文档描述 VectaHub 工作流引擎的实现细节。

## 1. 核心接口

```typescript
// src/workflow/engine.ts
export interface WorkflowEngine {
  createWorkflow(name: string, steps: Step[]): Promise<Workflow>;
  addStep(workflowId: string, step: Step): Promise<void>;
  removeStep(workflowId: string, stepId: string): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  getSystemWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord>;
  executeAsync(workflow: Workflow, options?: ExecuteOptions): void;
  pause(): boolean;
  resume(): boolean;
  abort(): boolean;
  getStatus(): ExecutionRecord | undefined;
  waitForCompletion(): Promise<ExecutionRecord>;
  loadWorkflows(): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | undefined>;
  resumeFromFailure(executionId: string, stepIndex?: number): Promise<ExecutionRecord>;
}
```

## 2. 执行选项

```typescript
export interface ExecuteOptions {
  dryRun?: boolean;
  timeout?: number;
  mode?: 'strict' | 'relaxed' | 'consensus';
  retry?: RetryOptions;
  onProgress?: (info: ProgressInfo) => void;
  initialVariables?: Record<string, unknown>;
}

export interface ProgressInfo {
  currentStep: number;
  totalSteps: number;
  stepId: string;
  stepType: string;
  status: 'starting' | 'completed' | 'failed';
}
```

## 3. 执行器接口

```typescript
// src/workflow/executor.ts
export interface Executor {
  exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult>;
  execute(step: Step, options?: ExecutorOptions, context?: ExecutionContext): Promise<ExecutionResult>;
  executeWorkflow(steps: Step[], options?: ExecutorOptions, context?: ExecutionContext): Promise<ExecutionResult[]>;
  validateStep(step: Step): { valid: boolean; errors: string[] };
  killCurrentProcess(): void;
  getCurrentProcess(): ChildProcess | null;
  interpolateString(template: string, context: ExecutionContext): string;
  registerStepHandler(type: string, handler: StepHandler): void;
}
```

## 4. 执行流程

### 4.1 工作流执行主循环

```
execute(workflow, options)
  └── executeWorkflowInternal(workflow, steps, options)
        └── runExecutionLoop(stateManager, executor, storage, options)
              ├── 1. 凭证预检 (Pre-flight Check)
              │     └── PolicyManager.runPreFlightCheck()
              ├── 2. 按序执行步骤
              │     └── for each step: executor.execute(step)
              │           ├── for_each: 遍历 items，执行 body
              │           ├── if: 条件判断，执行对应分支
              │           ├── parallel: 并行执行 body
              │           └── exec/opencli: 直接执行命令
              └── 3. 记录结果到 storage
```

### 4.2 凭证预检

在执行工作流前，Executor 调用 PolicyManager 检查工具凭证：

```typescript
// src/workflow/executor.ts:executeWorkflow
const preFlightResult = await policyManager.runPreFlightCheck(steps, exec, options);
if (!preFlightResult.success) {
  return [{ stepId: 'pre-flight', status: 'FAILED', error: preFlightResult.error }];
}
```

预检失败时立即终止工作流，返回错误。

### 4.3 失败恢复

```typescript
// src/workflow/engine.ts:resumeFromFailure
async resumeFromFailure(executionId: string, stepIndex = -1): Promise<ExecutionRecord> {
  const previousExecution = await storage.get(executionId);
  // 从失败的步骤继续执行
  const failedStepIndex = previousExecution.steps.findIndex(s => s.status === 'FAILED');
  const remainingSteps = workflow.steps.slice(failedStepIndex + 1);
  // 保留之前步骤的输出作为上下文变量
}
```

## 5. 存储接口

```typescript
// src/workflow/storage.ts
export interface Storage {
  save(record: ExecutionRecord): Promise<void>;
  get(id: string): Promise<ExecutionRecord | undefined>;
  list(): Promise<ExecutionRecord[]>;
  delete(id: string): Promise<void>;

  saveWorkflow(workflow: Workflow, format?: 'json' | 'yaml'): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  deleteWorkflow(id: string): Promise<void>;

  loadWorkflowFromFile(filepath: string): Promise<Workflow | null>;
  getOutputStore(): OutputStore | undefined;
}
```

存储路径：`$VECTAHUB_HOME/executions/` 和 `$VECTAHUB_HOME/workflows/`

大输出文件分离存储在 `$VECTAHUB_HOME/outputs/`。

## 6. 生命周期管理

```typescript
// src/execution/lifecycle.ts
export interface LifecycleManager {
  rerun(executionId: string, options?: RerunOptions): Promise<ExecutionRecord>;
  resume(executionId: string, options?: ResumeOptions): Promise<ExecutionRecord>;
  resumeFromStep(executionId: string, stepIndex: number, options?: ExecuteOptions): Promise<ExecutionRecord>;
}
```

## 7. 步骤类型

| 类型 | 说明 | 关键字段 |
|------|------|----------|
| `exec` | 执行 CLI 命令 | `cli`, `args` |
| `for_each` | 遍历执行 | `items`, `body` |
| `if` | 条件分支 | `condition`, `body` |
| `parallel` | 并行执行 | `body` |
| `opencli` | 打开 CLI 界面 | `site`, `command` |

```yaml
version: 1.1.1
lastUpdated: 2026-05-10
```
