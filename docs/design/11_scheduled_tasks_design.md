# VectaHub 定时任务调度设计

> 本文档定义 VectaHub 的定时任务调度系统，支持 cron 表达式、自然语言创建、执行历史追踪

---

## 0. 实现状态

| 模块 | 状态 | 说明 |
|------|------|------|
| **Cron 解析器** | 🔲 待实现 | cron 表达式解析与验证 |
| **调度引擎** | 🔲 待实现 | 定时触发工作流执行 |
| **自然语言转 cron** | 🔲 待实现 | NL → cron 转换 |
| **执行历史** | 🔲 待实现 | 定时任务执行记录 |
| **失败重试** | 🔲 待实现 | 失败自动重试策略 |

---

## 1. 设计目标

### 1.1 核心问题

用户需要定时执行工作流，例如：
- 每天凌晨备份文件
- 每小时检查系统状态
- 每周一生成报告
- 每月 1 号清理日志

### 1.2 设计原则

- **自然语言优先**：用户用自然语言描述时间，系统自动转换为 cron
- **可靠执行**：任务不丢失、不重复、不漏执行
- **可观测性**：清晰的执行历史和状态
- **容错恢复**：系统重启后自动恢复调度
- **用户控制**：随时暂停、恢复、修改、删除

---

## 2. 核心架构

### 2.1 组件图

```
┌─────────────────────────────────────────────────────────────┐
│                    定时任务调度系统                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  NL to      │───▶│   Cron      │───▶│  Scheduler  │   │
│  │  Cron       │    │  Parser     │    │  Engine     │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│         │                                   │             │
│         ▼                                   ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Task       │◀───│  Task       │───▶│  Executor   │   │
│  │  Storage    │    │  Queue      │    │  (Workflow) │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│         │                                   │             │
│         ▼                                   ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Execution  │    │  Retry      │    │  Alert      │   │
│  │  History    │    │  Handler    │    │  Engine     │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户输入: "每天早上 9 点备份 Documents"
    │
    ▼
┌─────────────────────────────────────────────────────┐
│            NL to Cron                                │
│  1. 解析自然语言时间描述                            │
│  2. 转换为 cron 表达式: 0 9 * * *                   │
│  3. 用户确认                                        │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│            Cron Parser                               │
│  1. 验证 cron 表达式合法性                          │
│  2. 计算下次执行时间                                │
│  3. 生成 ScheduledTask                              │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│            Scheduler Engine                          │
│  1. 注册到调度器                                    │
│  2. 持久化到存储                                    │
│  3. 等待触发                                        │
└─────────────────────────────────────────────────────┘
    │
    ▼ (定时触发)
┌─────────────────────────────────────────────────────┐
│            Task Queue                                │
│  1. 入队任务                                        │
│  2. 工作流引擎出队执行                              │
│  3. 记录执行历史                                    │
└─────────────────────────────────────────────────────┘
```

---

## 3. 核心类型定义

### 3.1 定时任务定义

```typescript
export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'error';
export type ScheduleFrequency = 'once' | 'recurring';

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;

  // 调度配置
  schedule: ScheduleConfig;

  // 关联的工作流
  workflowId: string;
  workflowSnapshot?: Workflow;  // 工作流快照 (防止工作流被修改影响定时任务)

  // 执行配置
  executionConfig: ExecutionConfig;

  // 状态
  status: ScheduleStatus;
  nextRunAt?: Date;
  lastRunAt?: Date;
  lastResult?: ScheduledExecutionResult;

  // 统计
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  avgDuration?: number;

  // 时间戳
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface ScheduleConfig {
  type: 'cron' | 'interval' | 'once';
  
  // cron 表达式
  cronExpression?: string;        // e.g., "0 9 * * *"
  timezone?: string;              // e.g., "Asia/Shanghai"
  
  // 间隔 (用于 interval 类型)
  intervalMs?: number;            // e.g., 3600000 (1 hour)
  
  // 单次执行 (用于 once 类型)
  executeAt?: Date;
  
  // 高级选项
  skipMissedRuns?: boolean;       // 错过执行是否跳过 (默认 true)
  maxBacklog?: number;            // 最大积压任务数 (默认 1)
}

export interface ExecutionConfig {
  mode: 'strict' | 'relaxed' | 'consensus';  // 执行模式
  timeout?: number;               // 超时时间 (ms)
  retryPolicy?: RetryPolicy;      // 重试策略
  onFailure?: 'stop' | 'continue' | 'alert'; // 失败处理
  notifyOnSuccess?: boolean;      // 成功时通知
  notifyOnFailure?: boolean;      // 失败时通知
}

export interface RetryPolicy {
  maxRetries: number;             // 最大重试次数
  backoffMs: number;              // 初始退避时间
  maxBackoffMs: number;           // 最大退避时间
  backoffMultiplier: number;      // 退避倍数 (exponential backoff)
  retryOnTimeout?: boolean;       // 超时时是否重试
}

export interface ScheduledExecutionResult {
  executionId: string;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  error?: string;
  output?: unknown;
}
```

### 3.2 自然语言时间模式

```typescript
export interface NLTimePattern {
  pattern: RegExp;
  description: string;
  toCron: (match: RegExpMatchArray) => string;
  examples: string[];
}

// 内置时间模式
export const NL_TIME_PATTERNS: NLTimePattern[] = [
  {
    pattern: /每天\s*(\d{1,2})\s*点/,
    description: '每天指定时间',
    toCron: (match) => `0 ${match[1]} * * *`,
    examples: ['每天 9 点', '每天 23 点'],
  },
  {
    pattern: /每\s*(\d+)\s*(分钟|小时)/,
    description: '每 N 分钟/小时',
    toCron: (match) => {
      const num = parseInt(match[1]);
      if (match[2] === '分钟') {
        return `*/${num} * * * *`;
      } else {
        return `0 */${num} * * *`;
      }
    },
    examples: ['每 30 分钟', '每 2 小时'],
  },
  {
    pattern: /每周\s*([一二三四五六日天])\s*(\d{1,2})\s*点/,
    description: '每周指定星期和时间',
    toCron: (match) => {
      const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      const day = dayMap[match[1]];
      const hour = match[2];
      return `0 ${hour} * * ${day}`;
    },
    examples: ['每周一 9 点', '每周三 14 点'],
  },
  {
    pattern: /每月\s*(\d{1,2})\s*号\s*(\d{1,2})\s*点/,
    description: '每月指定日期和时间',
    toCron: (match) => `0 ${match[2]} ${match[1]} * *`,
    examples: ['每月 1 号 0 点', '每月 15 号 10 点'],
  },
  {
    pattern: /每\s*(周一|周二|周三|周四|周五|周六|周日|星期天)/,
    description: '每周指定星期 (默认 0 点)',
    toCron: (match) => {
      const dayMap = { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 0, '星期天': 0 };
      return `0 0 * * ${dayMap[match[1]]}`;
    },
    examples: ['每周一', '每周五'],
  },
];
```

---

## 4. CronParser 实现

### 4.1 核心接口

```typescript
export class CronParser {
  /**
   * 解析 cron 表达式
   */
  parse(expression: string): CronExpression;

  /**
   * 验证 cron 表达式是否合法
   */
  isValid(expression: string): boolean;

  /**
   * 计算下次执行时间
   */
  next(expression: string, after?: Date): Date;

  /**
   * 计算接下来 N 次执行时间
   */
  nextN(expression: string, count: number, after?: Date): Date[];

  /**
   * 将自然语言转换为 cron 表达式
   */
  nlToCron(naturalLanguage: string): {
    cron: string;
    confidence: number;
    description: string;
  };

  /**
   * 将 cron 表达式转换为可读描述
   */
  toHumanReadable(expression: string, timezone?: string): string;
}

export interface CronExpression {
  minute: string;     // 0-59, *, */N, N-M, N,M
  hour: string;       // 0-23, *, */N, N-M, N,M
  dayOfMonth: string; // 1-31, *, */N, N-M, N,M, ?
  month: string;      // 1-12, *, */N, N-M, N,M
  dayOfWeek: string;  // 0-7 (0 and 7 are Sunday), *, */N, N-M, N,M, ?

  next(after?: Date): Date;
  nextN(count: number, after?: Date): Date[];
  isValid(): boolean;
  toString(): string;
}
```

### 4.2 Cron 解析逻辑

```typescript
export class CronParser {
  private timezone: string;

  constructor(timezone: string = 'Asia/Shanghai') {
    this.timezone = timezone;
  }

  parse(expression: string): CronExpression {
    const parts = expression.trim().split(/\s+/);
    
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // 验证每个字段
    this.validateField(minute, 0, 59, 'minute');
    this.validateField(hour, 0, 23, 'hour');
    this.validateField(dayOfMonth, 1, 31, 'dayOfMonth');
    this.validateField(month, 1, 12, 'month');
    this.validateField(dayOfWeek, 0, 7, 'dayOfWeek');

    return {
      minute,
      hour,
      dayOfMonth,
      month,
      dayOfWeek,
      next: (after?: Date) => this.calculateNext(parts, after),
      nextN: (count: number, after?: Date) => this.calculateNextN(count, parts, after),
      isValid: () => true,
      toString: () => expression,
    };
  }

  nlToCron(naturalLanguage: string): { cron: string; confidence: number; description: string } {
    const input = naturalLanguage.toLowerCase().trim();

    for (const pattern of NL_TIME_PATTERNS) {
      const match = input.match(pattern.pattern);
      if (match) {
        const cron = pattern.toCron(match);
        return {
          cron,
          confidence: 0.9,
          description: pattern.description,
        };
      }
    }

    // 如果未匹配，返回低置信度或抛出错误
    throw new Error(`Unable to parse time expression: "${naturalLanguage}"`);
  }

  toHumanReadable(expression: string, timezone?: string): string {
    const parts = expression.split(/\s+/);
    const tz = timezone || this.timezone;

    // 简单的人类可读转换
    if (parts[0] === '0' && parts[1] !== '*' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      return `每天 ${parts[1]}:00`;
    }
    if (parts[0] === '0' && parts[1] === '0' && parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return `每周${dayNames[parseInt(parts[4])]}`;
    }
    if (parts[0].startsWith('*/') && parts[1] === '*' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      return `每 ${parts[0].slice(2)} 分钟`;
    }

    return expression;
  }

  private validateField(value: string, min: number, max: number, fieldName: string): void {
    if (value === '*') return;
    if (value.startsWith('*/')) {
      const num = parseInt(value.slice(2));
      if (isNaN(num) || num < 1 || num > max) {
        throw new Error(`Invalid ${fieldName}: ${value}`);
      }
      return;
    }
    // 支持 N-M, N,M 等格式
    // ... 完整验证逻辑
  }

  private calculateNext(parts: string[], after?: Date): Date {
    // 使用 cron-parser 库或自实现
    // 计算下一个匹配的时间点
    // ...
  }

  private calculateNextN(count: number, parts: string[], after?: Date): Date[] {
    const dates: Date[] = [];
    let current = after || new Date();
    
    for (let i = 0; i < count; i++) {
      const next = this.calculateNext(parts, current);
      dates.push(next);
      current = next;
    }
    
    return dates;
  }
}
```

---

## 5. SchedulerEngine 实现

### 5.1 核心接口

```typescript
export class SchedulerEngine {
  private tasks: Map<string, ScheduledTask>;
  private timer: NodeJS.Timeout | null;
  private storage: TaskStorage;
  private workflowEngine: WorkflowEngine;

  /**
   * 启动调度器
   */
  async start(): Promise<void>;

  /**
   * 停止调度器
   */
  async stop(): Promise<void>;

  /**
   * 添加定时任务
   */
  async addTask(task: ScheduledTask): Promise<string>;

  /**
   * 更新定时任务
   */
  async updateTask(taskId: string, updates: Partial<ScheduledTask>): Promise<void>;

  /**
   * 删除定时任务
   */
  async removeTask(taskId: string): Promise<void>;

  /**
   * 暂停定时任务
   */
  async pauseTask(taskId: string): Promise<void>;

  /**
   * 恢复定时任务
   */
  async resumeTask(taskId: string): Promise<void>;

  /**
   * 立即执行一次
   */
  async runNow(taskId: string): Promise<string>;

  /**
   * 获取任务状态
   */
  getTask(taskId: string): ScheduledTask | undefined;

  /**
   * 列出所有任务
   */
  listTasks(filter?: { status?: ScheduleStatus }): ScheduledTask[];

  /**
   * 获取执行历史
   */
  async getExecutionHistory(taskId: string, limit?: number): Promise<ScheduledExecutionResult[]>;
}
```

### 5.2 调度循环

```typescript
export class SchedulerEngine {
  private checkInterval: number = 10000; // 每 10 秒检查一次

  async start(): Promise<void> {
    // 加载持久化的任务
    const tasks = await this.storage.loadAllTasks();
    for (const task of tasks) {
      if (task.status === 'active') {
        this.tasks.set(task.id, task);
      }
    }

    // 启动检查循环
    this.timer = setInterval(() => this.checkAndExecute(), this.checkInterval);
    
    console.log(`Scheduler started with ${this.tasks.size} active tasks`);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    // 保存所有任务状态
    await this.saveAllTasks();
    
    console.log('Scheduler stopped');
  }

  private async checkAndExecute(): Promise<void> {
    const now = new Date();

    for (const [taskId, task] of this.tasks) {
      if (task.status !== 'active') continue;
      if (!task.nextRunAt || task.nextRunAt > now) continue;

      // 跳过错过的执行 (如果配置了 skipMissedRuns)
      if (task.schedule.skipMissedRuns && task.nextRunAt < now) {
        console.warn(`Task ${task.name} missed scheduled time, skipping`);
        this.updateNextRunTime(task);
        continue;
      }

      // 触发执行
      try {
        await this.executeTask(task);
      } catch (error) {
        console.error(`Failed to execute task ${task.name}:`, error);
        await this.handleExecutionFailure(task, error);
      }

      // 更新下次执行时间
      this.updateNextRunTime(task);
      
      // 持久化
      await this.storage.saveTask(task);
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    const executionId = `sched_exec_${Date.now()}_${task.id}`;
    const startedAt = new Date();

    console.log(`Executing scheduled task: ${task.name} (${executionId})`);

    try {
      // 使用工作流快照或最新工作流
      const workflow = task.workflowSnapshot || 
        await this.workflowEngine.loadWorkflow(task.workflowId);

      const result = await this.workflowEngine.execute(workflow, {
        mode: task.executionConfig.mode,
        timeout: task.executionConfig.timeout,
        isScheduled: true,
        scheduledTaskId: task.id,
      });

      // 记录执行结果
      task.lastRunAt = new Date();
      task.lastResult = {
        executionId,
        status: result.status === 'completed' ? 'success' : 'failed',
        startedAt,
        endedAt: new Date(),
        duration: result.duration,
        error: result.error,
        output: result.output,
      };

      task.totalRuns++;
      if (result.status === 'completed') {
        task.successRuns++;
        if (task.executionConfig.notifyOnSuccess) {
          await this.sendNotification(task, 'success', result);
        }
      } else {
        task.failedRuns++;
        if (task.executionConfig.notifyOnFailure) {
          await this.sendNotification(task, 'failure', result);
        }

        // 重试逻辑
        if (task.executionConfig.retryPolicy) {
          await this.handleRetry(task, executionId);
        }
      }

      // 计算平均执行时间
      if (task.lastResult?.duration) {
        task.avgDuration = task.avgDuration
          ? (task.avgDuration * (task.totalRuns - 1) + task.lastResult.duration) / task.totalRuns
          : task.lastResult.duration;
      }

    } catch (error) {
      task.lastResult = {
        executionId,
        status: 'failed',
        startedAt,
        endedAt: new Date(),
        error: error.message,
      };
      task.failedRuns++;
      throw error;
    }
  }

  private updateNextRunTime(task: ScheduledTask): void {
    if (task.schedule.type === 'once') {
      task.nextRunAt = undefined;
      task.status = 'completed';
      return;
    }

    if (task.schedule.type === 'cron' && task.schedule.cronExpression) {
      const parser = new CronParser(task.schedule.timezone);
      task.nextRunAt = parser.next(task.schedule.cronExpression, new Date());
    }

    if (task.schedule.type === 'interval' && task.schedule.intervalMs) {
      task.nextRunAt = new Date(Date.now() + task.schedule.intervalMs);
    }
  }

  private async handleRetry(task: ScheduledTask, executionId: string): Promise<void> {
    const retryPolicy = task.executionConfig.retryPolicy!;
    
    // 实现指数退避重试
    // ...
  }

  private async sendNotification(
    task: ScheduledTask,
    event: 'success' | 'failure',
    result: unknown
  ): Promise<void> {
    // 发送通知 (console / email / webhook / slack)
    // ...
  }
}
```

---

## 6. 任务存储

### 6.1 存储接口

```typescript
export interface TaskStorage {
  /**
   * 保存任务
   */
  saveTask(task: ScheduledTask): Promise<void>;

  /**
   * 加载任务
   */
  loadTask(taskId: string): Promise<ScheduledTask | null>;

  /**
   * 加载所有任务
   */
  loadAllTasks(): Promise<ScheduledTask[]>;

  /**
   * 删除任务
   */
  deleteTask(taskId: string): Promise<void>;

  /**
   * 保存执行历史
   */
  saveExecutionHistory(taskId: string, result: ScheduledExecutionResult): Promise<void>;

  /**
   * 获取执行历史
   */
  getExecutionHistory(taskId: string, limit?: number): Promise<ScheduledExecutionResult[]>;
}

// JSON 文件存储实现
export class FileTaskStorage implements TaskStorage {
  private tasksPath: string;
  private historyPath: string;

  constructor(basePath: string = '~/.vectahub/scheduled-tasks') {
    this.tasksPath = path.join(expandHome(basePath), 'tasks.json');
    this.historyPath = path.join(expandHome(basePath), 'history');
  }

  async saveTask(task: ScheduledTask): Promise<void> {
    const tasks = await this.loadAllTasks();
    const index = tasks.findIndex(t => t.id === task.id);
    
    if (index >= 0) {
      tasks[index] = task;
    } else {
      tasks.push(task);
    }

    await fs.writeFile(this.tasksPath, JSON.stringify(tasks, null, 2));
  }

  async loadAllTasks(): Promise<ScheduledTask[]> {
    if (!await fs.exists(this.tasksPath)) {
      return [];
    }

    const data = await fs.readFile(this.tasksPath, 'utf-8');
    return JSON.parse(data);
  }

  async saveExecutionHistory(
    taskId: string,
    result: ScheduledExecutionResult
  ): Promise<void> {
    const historyFile = path.join(this.historyPath, `${taskId}.json`);
    
    let history: ScheduledExecutionResult[] = [];
    if (await fs.exists(historyFile)) {
      history = JSON.parse(await fs.readFile(historyFile, 'utf-8'));
    }

    history.unshift(result);
    
    // 保留最近 100 条记录
    if (history.length > 100) {
      history = history.slice(0, 100);
    }

    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
  }
}
```

---

## 7. CLI 命令设计

### 7.1 命令列表

```bash
# 创建定时任务 (自然语言)
vectahub schedule create "每天早上 9 点备份 Documents" --workflow backup-workflow

# 创建定时任务 (cron 表达式)
vectahub schedule create --cron "0 9 * * *" --workflow backup-workflow --name "daily-backup"

# 列出所有定时任务
vectahub schedule list [--status active|paused|error]

# 查看任务详情
vectahub schedule show <task-id>

# 暂停任务
vectahub schedule pause <task-id>

# 恢复任务
vectahub schedule resume <task-id>

# 删除任务
vectahub schedule delete <task-id>

# 立即执行一次
vectahub schedule run <task-id>

# 更新任务
vectahub schedule update <task-id> --cron "0 10 * * *" --workflow new-workflow

# 查看执行历史
vectahub schedule history <task-id> [--limit N]

# 查看接下来 N 次执行时间
vectahub schedule next <task-id> [--count 5]

# 自然语言转 cron
vectahub schedule parse "每天 9 点"

# 查看调度器状态
vectahub schedule status
```

### 7.2 命令输出示例

```bash
$ vectahub schedule list

📅 Scheduled Tasks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ID       | Name           | Schedule      | Status | Next Run
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
task_001 | Daily Backup   | 0 9 * * *     | ✅     | 2026-05-03 09:00
task_002 | Weekly Report  | 0 0 * * 1     | ✅     | 2026-05-05 00:00
task_003 | Hourly Check   | 0 */1 * * *   | ⏸️     | -
task_004 | Monthly Clean  | 0 0 1 * *     | ✅     | 2026-06-01 00:00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 4 (3 active, 1 paused)
```

```bash
$ vectahub schedule show task_001

📋 Task Details
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:           Daily Backup
ID:             task_001
Status:         ✅ Active
Schedule:       0 9 * * * (每天 9:00)
Timezone:       Asia/Shanghai
Workflow:       backup-workflow
Mode:           strict

Statistics:
  Total Runs:       45
  Success:          44 (97.8%)
  Failed:           1 (2.2%)
  Avg Duration:     3m 24s

Last Execution:
  Time:             2026-05-02 09:00:12
  Status:           ✅ Success
  Duration:         3m 18s

Next 5 Runs:
  1. 2026-05-03 09:00:00
  2. 2026-05-04 09:00:00
  3. 2026-05-05 09:00:00
  4. 2026-05-06 09:00:00
  5. 2026-05-07 09:00:00

Retry Policy:
  Max Retries:      3
  Backoff:          1m, 2m, 4m
  On Timeout:       Yes
```

```bash
$ vectahub schedule parse "每天 9 点"

🔄 NL to Cron Conversion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Input:          每天 9 点
Cron:           0 9 * * *
Description:    每天 09:00
Confidence:     90%

Next 3 Executions:
  1. 2026-05-03 09:00:00
  2. 2026-05-04 09:00:00
  3. 2026-05-05 09:00:00
```

---

## 8. 配置文件设计

### 8.1 全局配置

```yaml
# ~/.vectahub/config.yaml

schedule:
  # 默认时区
  timezone: Asia/Shanghai
  
  # 检查间隔 (ms)
  checkInterval: 10000
  
  # 执行历史保留条数
  historyRetention: 100
  
  # 错过执行的处理
  skipMissedRuns: true
  
  # 默认重试策略
  defaultRetryPolicy:
    maxRetries: 3
    backoffMs: 60000      # 1 分钟
    maxBackoffMs: 300000  # 5 分钟
    backoffMultiplier: 2
  
  # 通知配置
  notifications:
    onFailure:
      - type: console
    onSuccess:
      - type: console
```

---

## 9. 场景示例

### 9.1 场景 1: 每日备份

```bash
# 创建定时任务
$ vectahub schedule create "每天凌晨 2 点备份 Documents 到外接硬盘" --workflow backup-workflow

✅ Scheduled Task Created
  Name: daily-doc-backup
  Schedule: 0 2 * * * (每天 02:00)
  Next Run: 2026-05-03 02:00:00
  Workflow: backup-workflow

# 查看状态
$ vectahub schedule status

📅 Scheduler Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Running:        Yes
Active Tasks:   1
Next Execution: 2026-05-03 02:00:00 (daily-doc-backup)
Uptime:         2h 34m
```

### 9.2 场景 2: 失败重试

```
执行失败:
  Task: hourly-system-check
  Error: Connection timeout
  
  Retrying (attempt 1/3)...
  Backoff: 1m
  
  Retrying (attempt 2/3)...
  Backoff: 2m
  
  Retrying (attempt 3/3)...
  Backoff: 4m
  
  ❌ All retries failed
  Notifying user...
```

### 9.3 场景 3: 错过执行处理

```
系统重启后恢复:
  Loading scheduled tasks...
  Found 3 active tasks
  
  Checking missed runs:
  - daily-backup: missed at 02:00 (current: 08:00)
    skipMissedRuns: true → skipping
    Next run: tomorrow 02:00
    
  - hourly-check: missed at 03:00, 04:00, 05:00, 06:00, 07:00
    skipMissedRuns: true → skipping
    Next run: 09:00
    
  - weekly-report: not missed
    Next run: Monday 00:00
  
  ✅ Scheduler resumed, 0 tasks recovered
```

---

## 10. 数据库设计

### 10.1 Schema

```sql
-- 定时任务表
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  
  schedule_type TEXT NOT NULL,           -- cron | interval | once
  cron_expression TEXT,
  timezone TEXT DEFAULT 'Asia/Shanghai',
  interval_ms INTEGER,
  execute_at DATETIME,
  
  skip_missed_runs BOOLEAN DEFAULT true,
  max_backlog INTEGER DEFAULT 1,
  
  workflow_id TEXT NOT NULL,
  workflow_snapshot TEXT,                -- JSON
  
  execution_mode TEXT NOT NULL DEFAULT 'consensus',
  timeout INTEGER,
  retry_policy TEXT,                     -- JSON
  on_failure TEXT NOT NULL DEFAULT 'alert',
  notify_on_success BOOLEAN DEFAULT false,
  notify_on_failure BOOLEAN DEFAULT true,
  
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | completed | error
  next_run_at DATETIME,
  last_run_at DATETIME,
  last_result TEXT,                      -- JSON
  
  total_runs INTEGER DEFAULT 0,
  success_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  avg_duration REAL,
  
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

-- 执行历史表
CREATE TABLE scheduled_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  
  status TEXT NOT NULL,                  -- success | failed | timeout | skipped
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  duration REAL,
  error TEXT,
  output TEXT,                           -- JSON
  
  retry_attempt INTEGER DEFAULT 0,
  is_retry BOOLEAN DEFAULT false,
  
  created_at DATETIME NOT NULL,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
);

-- 索引
CREATE INDEX idx_scheduled_tasks_status ON scheduled_tasks(status);
CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at);
CREATE INDEX idx_scheduled_executions_task ON scheduled_executions(task_id);
CREATE INDEX idx_scheduled_executions_status ON scheduled_executions(status);
```

---

## 11. 测试用例

### 11.1 单元测试

```typescript
describe('CronParser', () => {
  it('should parse simple cron expression', () => {
    const parser = new CronParser();
    const cron = parser.parse('0 9 * * *');
    
    expect(cron.minute).toBe('0');
    expect(cron.hour).toBe('9');
    expect(cron.isValid()).toBe(true);
  });

  it('should convert NL to cron', () => {
    const parser = new CronParser();
    const result = parser.nlToCron('每天 9 点');
    
    expect(result.cron).toBe('0 9 * * *');
    expect(result.confidence).toBe(0.9);
  });

  it('should calculate next execution time', () => {
    const parser = new CronParser('Asia/Shanghai');
    const now = new Date('2026-05-02T08:00:00+08:00');
    const next = parser.next('0 9 * * *', now);
    
    expect(next.toISOString()).toBe('2026-05-02T01:00:00.000Z'); // UTC
  });
});

describe('SchedulerEngine', () => {
  it('should execute task at scheduled time', async () => {
    const engine = new SchedulerEngine();
    await engine.start();

    const task: ScheduledTask = {
      id: 'test_001',
      name: 'Test Task',
      schedule: {
        type: 'once',
        executeAt: new Date(Date.now() + 1000),
      },
      workflowId: 'wf_001',
      executionConfig: { mode: 'strict' },
      status: 'active',
      totalRuns: 0,
      successRuns: 0,
      failedRuns: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await engine.addTask(task);
    
    // Wait for execution
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const updatedTask = engine.getTask('test_001');
    expect(updatedTask?.totalRuns).toBe(1);
    expect(updatedTask?.status).toBe('completed');
  });
});
```

---

## 12. 模块归属

| 模块 | 负责 Agent | 说明 |
|------|-----------|------|
| CronParser | Agent G (Utils) | cron 表达式解析 |
| NL to Cron | Agent B (NL Parser) | 自然语言转 cron |
| SchedulerEngine | Agent C (Workflow Engine) | 调度引擎 |
| TaskStorage | Agent F (Storage) | 任务持久化 |
| CLI 命令 | Agent A (CLI) | schedule 命令 |
| 重试处理 | Agent C (Workflow Engine) | 失败重试策略 |

---

## 13. 功能清单

| 功能 | 状态 | 优先级 |
|------|------|--------|
| Cron 表达式解析 | 🔲 待实现 | P0 |
| NL 转 cron | 🔲 待实现 | P0 |
| 调度引擎 | 🔲 待实现 | P0 |
| 任务持久化 | 🔲 待实现 | P0 |
| 执行历史 | 🔲 待实现 | P0 |
| 失败重试 | 🔲 待实现 | P1 |
| 错过执行处理 | 🔲 待实现 | P1 |
| 时区支持 | 🔲 待实现 | P1 |
| 通知系统 | 🔲 待实现 | P1 |
| 工作流快照 | 🔲 待实现 | P2 |
| 批量操作 | 🔲 待实现 | P2 |
| Web 界面 | 🔲 待实现 | P3 |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-02
status: design_complete
relatedTo:
  - docs/design/06_workflow_engine_design.md
  - docs/design/07_module_design.md
  - docs/design/01_system_architecture.md
```
