# VectaHub Agent 开发任务

> 此文档为 AI agent 开发使用，精确到代码行和类型映射
> 人类开发者请看 [03_implementation_roadmap.md](./03_implementation_roadmap.md)

---

## 开发规则

**必读项目规则**: [../../AGENTS.md](../../AGENTS.md)

核心规则摘要：
- **TDD 优先**：先写失败测试 → 最小代码通过 → 重构
- **代码风格**：2 空格缩进、分号必填、单引号、100 字符行宽
- **Import 顺序**：内置 → 第三方 → 内部 → 类型（内部 import 带 `.js` 后缀）
- **工厂函数**：新功能用 `createXxx()` 工厂函数，不用类
- **改动确认**：单文件改动直接做；2+ 选项、3+ 文件、删除/改接口 → 先问
- **不确定时**：说"需要确认 X"，不要猜

**测试命令**：
```bash
npm test                          # 运行所有测试
npm run typecheck                 # TypeScript 类型检查
npm run vectahub -- run "test"    # 手动测试 run 命令
```

**测试文件位置**：和源文件同目录，`*.test.ts`。例如：
- `src/utils/run.ts` → `src/utils/run.test.ts`
- `src/workflow/executor.ts` → `src/workflow/executor.test.ts`

**重要**：`vitest.config.ts` 引用了项目根目录的 `test-setup.ts` 但该文件不存在。
如果测试报错 `Cannot find module './test-setup.ts'`，在项目根目录创建：
```typescript
// test-setup.ts（项目根目录，空文件即可）
```

---

## 第一步：LLM 接入 run 命令

### 任务元数据

```yaml
step: 1
title: "LLM 接入 run 命令核心路径"
estimated_changes: "~60 lines added/modified"
files_to_edit:
  - src/utils/run.ts (main)
  - src/nl/parser.ts (export getConfidenceLevel)
  - src/utils/run.test.ts (new)
  - test-setup.ts (new, project root)
dependencies:
  - src/nl/llm.ts (createLLMConfig, createLLMEnhancedParser, LLMResponse)
  - src/nl/parser.ts (createNLParser, ParseResult)
  - src/types/index.ts (TaskList, ParseResult, Task, TaskType)
skills_to_use:
  - tdd-workflow (测试驱动开发)
  - test-generator (生成测试用例)
```

### 背景

当前 `src/utils/run.ts` 第 53-54 行使用关键词匹配解析器：

```typescript
const parser = createNLParser();
const taskListResult = parser.parseToTaskList(text);
```

LLM 解析器已在 `src/nl/llm.ts` 实现（`createLLMEnhancedParser`），但从未被 `run.ts` 调用。

### 修改范围

**文件**: `src/utils/run.ts`
**修改行**: 第 49-69 行（`else if (intent.length > 0)` 分支内的解析逻辑）
**不修改**: 第 37-48 行（文件加载）、第 71-117 行（命令编辑器和工作流构建）、第 119-153 行（执行和输出）

### 类型契约

**输入**: `LLMResponse`（来自 `src/nl/llm.ts`）
```typescript
interface LLMResponse {
  intent: string;                          // 意图名称，如 "FIND_FILES"
  confidence: number;                      // 0.0 - 1.0
  params: Record<string, unknown>;         // 提取的参数
  workflow: {
    name: string;
    steps: {
      type: 'exec' | 'for_each' | 'if' | 'parallel';
      cli?: string;
      args?: string[];
      condition?: string;
      items?: string;
      body?: unknown[];
    }[];
  };
}
```

**输出**: `ParseResult`（来自 `src/types/index.ts`，与当前 `createNLParser().parseToTaskList()` 返回值相同）
```typescript
interface ParseResult {
  status: 'SUCCESS' | 'NEEDS_CLARIFICATION';
  taskList?: TaskList;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';
  originalInput: string;
  candidates?: { intent: IntentName; description: string }[];
}
```

**LLMResponse → ParseResult 映射规则**:

`Task` 类型来自 `src/types/index.ts`：
```typescript
interface Task {
  id: string;
  type: TaskType;                    // 'CODE_TRANSFORM' | 'CODE_CREATE' | ...
  description: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  commands: { cli: string; args: string[] }[];
  dependencies: string[];
  estimatedDuration?: number;
}
```

**注意**: Task **没有** `intent` 字段，用 `type` 表示任务类型。

```
LLMResponse.workflow.steps → TaskList.tasks
  每个 workflow step → 一个 task
    step.cli → task.commands[0].cli
    step.args → task.commands[0].args
    step.type → task.type (需要 LLM intent → TaskType 映射)
LLMResponse.intent → taskList.intent
LLMResponse.confidence → taskList.confidence

LLM intent → TaskType 映射:
  FILE_FIND, QUERY_INFO              → 'QUERY_EXEC'
  GIT_WORKFLOW                       → 'GIT_OPERATION'
  INSTALL_PACKAGE                    → 'PACKAGE_INSTALL'
  RUN_SCRIPT                         → 'BUILD_VERIFY'
  SYSTEM_INFO                        → 'QUERY_EXEC'
  CREATE_FILE, CODE_TRANSFORM        → 'CODE_CREATE'
  其他/未知                          → 'DEBUG_EXEC'

confidence 分级:
  >= 0.9 → 'HIGH'
  >= 0.7 → 'MEDIUM'
  >= 0.5 → 'LOW'
  < 0.5  → 'UNCERTAIN'

confidence >= 0.7 且 workflow.steps.length > 0 → status: 'SUCCESS'
其他 → 降级为关键词匹配
```

### 具体改动指令

**步骤 1**: 在 `src/utils/run.ts` 顶部增加 import

在现有 import 后添加：
```typescript
import { createLLMConfig, createLLMEnhancedParser, type LLMResponse } from '../nl/llm.js';
import type { TaskList, Task, TaskType } from '../types/index.js';
```

**步骤 2**: 在 `run.ts` 中定义辅助函数和转换函数

在文件顶部（`const HIGH_CONFIDENCE_THRESHOLD = 0.7;` 之后，`const logger` 之前）添加：

```typescript
function getConfidenceLevelText(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN' {
  if (confidence >= 0.9) return 'HIGH';
  if (confidence >= 0.7) return 'MEDIUM';
  if (confidence >= 0.5) return 'LOW';
  return 'UNCERTAIN';
}

function mapIntentToTaskType(intent: string): TaskType {
  switch (intent) {
    case 'FILE_FIND':
    case 'QUERY_INFO':
    case 'SYSTEM_INFO':
      return 'QUERY_EXEC';
    case 'GIT_WORKFLOW':
      return 'GIT_OPERATION';
    case 'INSTALL_PACKAGE':
      return 'PACKAGE_INSTALL';
    case 'RUN_SCRIPT':
      return 'BUILD_VERIFY';
    case 'CREATE_FILE':
      return 'CODE_CREATE';
    default:
      return 'DEBUG_EXEC';
  }
}

function convertLLMResultToTaskList(llmResult: LLMResponse, originalInput: string): ParseResult {
  const tasks: Task[] = llmResult.workflow.steps.map((step, index) => ({
    id: `task_${index + 1}`,
    type: mapIntentToTaskType(llmResult.intent),
    description: `${step.cli} ${(step.args || []).join(' ')}`,
    status: 'PENDING',
    commands: step.cli ? [{ cli: step.cli, args: step.args || [] }] : [{ cli: 'echo', args: [step.type || 'unknown'] }],
    dependencies: [],
  }));

  const confidenceLevel = getConfidenceLevelText(llmResult.confidence);

  const taskList: TaskList = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    originalInput,
    intent: llmResult.intent as any,
    confidence: llmResult.confidence,
    entities: {} as any,
    tasks,
    warnings: [],
  };

  return {
    status: 'SUCCESS',
    taskList,
    confidenceLevel,
    originalInput,
  };
}
```

注意：这里新建 `getConfidenceLevelText` 和 `mapIntentToTaskType`，不 import parser.ts 的函数，避免循环依赖。

**步骤 3**: 替换第 49-69 行的解析逻辑

替换前（第 50-69 行）：
```typescript
        const text = intent.join(' ');
        logger.info(`解析意图: "${text}"`);

        const parser = createNLParser();
        const taskListResult = parser.parseToTaskList(text);

        if (taskListResult.status !== 'SUCCESS' || !taskListResult.taskList) {
          logger.error('❌ 无法解析意图，请尝试更明确的输入！');
          if (taskListResult.candidates?.length) {
            logger.info('💡 可能的意图: ' + taskListResult.candidates.map(c => c.intent).join(', '));
          } else {
            logger.info('\n📋 可用的意图示例:');
            logger.info('  - "查找当前目录下的文件"');
            logger.info('  - "显示磁盘使用情况"');
            logger.info('  - "构建项目"');
            logger.info('  - "运行测试"');
            logger.info('  - "查看 git 状态"');
          }
          process.exit(1);
        }
```

替换后：
```typescript
        const text = intent.join(' ');
        logger.info(`解析意图: "${text}"`);

        const llmConfig = createLLMConfig();
        let taskListResult: ParseResult;

        if (llmConfig) {
          logger.info('使用 LLM 解析意图');
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
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.warn(`LLM 解析失败 (${errorMsg})，降级为关键词匹配`);
            taskListResult = createNLParser().parseToTaskList(text);
          }
        } else {
          logger.info('LLM 未配置，使用关键词匹配');
          taskListResult = createNLParser().parseToTaskList(text);
        }

        if (taskListResult.status !== 'SUCCESS' || !taskListResult.taskList) {
          logger.error('❌ 无法解析意图，请尝试更明确的输入！');
          if (taskListResult.candidates?.length) {
            logger.info('💡 可能的意图: ' + taskListResult.candidates.map(c => c.intent).join(', '));
          } else {
            logger.info('\n📋 可用的意图示例:');
            logger.info('  - "查找当前目录下的文件"');
            logger.info('  - "显示磁盘使用情况"');
            logger.info('  - "构建项目"');
            logger.info('  - "运行测试"');
            logger.info('  - "查看 git 状态"');
          }
          process.exit(1);
        }
```

### 错误处理要求

| 场景 | 处理方式 | 日志级别 |
|------|----------|----------|
| LLM API 超时 | catch → 降级为关键词匹配 | warn |
| LLM 返回 429 (rate limit) | catch → 降级为关键词匹配 | warn |
| LLM 返回 JSON 解析失败 | LLMClient 内部已处理，抛出 Error → catch → 降级 | warn |
| LLM confidence < 0.7 | 降级为关键词匹配 | warn |
| LLM workflow.steps 为空 | 降级为关键词匹配 | warn |
| 无 LLM 配置 | 直接使用关键词匹配 | info |

### TDD 测试规格

按照 AGENTS.md 的 TDD 规则，**先写测试再改代码**。

**文件**: `src/utils/run.test.ts`（新建）

**必须覆盖的测试用例**：

| # | 用例名 | Mock | 期望 |
|---|--------|------|------|
| 1 | uses LLM when available and confidence >= 0.7 | `createLLMConfig` → valid, `llmParser.parse` → `{ confidence: 0.95, workflow: { steps: [{ cli: 'find', args: ['.'] }] } }` | LLM 解析被调用，生成 find 命令 |
| 2 | falls back when LLM not configured | `createLLMConfig` → null | `createNLParser().parseToTaskList` 被调用 |
| 3 | falls back when LLM confidence < 0.7 | `llmParser.parse` → `{ confidence: 0.5 }` | 降级为关键词匹配 |
| 4 | falls back when LLM throws error | `llmParser.parse` → throws new Error('API error') | 降级为关键词匹配 |
| 5 | falls back when LLM returns empty steps | `llmParser.parse` → `{ confidence: 0.8, workflow: { steps: [] } }` | 降级为关键词匹配 |

**Mock 模板**：
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../nl/llm.js', () => ({
  createLLMConfig: vi.fn(),
  createLLMEnhancedParser: vi.fn(),
}));

vi.mock('../nl/parser.js', () => ({
  createNLParser: vi.fn(() => ({
    parseToTaskList: vi.fn(() => ({
      status: 'SUCCESS',
      taskList: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: 'test',
        intent: 'SYSTEM_INFO' as any,
        confidence: 0.8,
        entities: {} as any,
        tasks: [{
          id: 'task_1',
          type: 'QUERY_EXEC' as const,
          description: 'echo test',
          status: 'PENDING',
          commands: [{ cli: 'echo', args: ['test'] }],
          dependencies: [],
        }],
        warnings: [],
      },
      confidenceLevel: 'MEDIUM' as const,
      originalInput: 'test',
    })),
  })),
}));
```

### 验证步骤

代码改完后，**必须**执行以下验证：

```bash
# 1. 如果 test-setup.ts 不存在，先创建
touch test-setup.ts

# 2. 类型检查（必须通过）
npm run typecheck

# 3. 测试
npm test -- src/utils/run.test.ts

# 4. 手动测试（有 LLM 配置时）
VECTAHUB_LLM_PROVIDER=openai OPENAI_API_KEY=your-key npx tsx src/cli.ts run "查看 git 状态"

# 5. 手动测试（无 LLM 配置时，应降级）
npx tsx src/cli.ts run "查看 git 状态"
```

**成功标准**：
- `npm run typecheck` 无错误
- `npm test` 5 个测试用例全部通过
- 有 LLM 时 `vectahub run "查找 .ts 文件"` 返回真实 `find` 命令
- 无 LLM 时不报错，降级为关键词匹配

### 注意事项

1. **不要修改**第 71-117 行（命令编辑器和工作流构建逻辑）
2. **不要修改**第 119-153 行（执行逻辑）
3. `convertLLMResultToTaskList`、`getConfidenceLevelText`、`mapIntentToTaskType` 定义在 `run.ts` 内部，不需要导出
4. LLM 返回的 `intent` 可能不在 `INTENT_LIST` 中，使用 `as any` 绕过类型检查
5. `Task` 类型**没有** `intent` 字段，用 `type`（TaskType）
6. `entities` 字段需要 `as any`，因为 LLM 不返回 entities
7. `first-run-wizard` 写入的配置文件路径由 `createLLMConfig()` 处理，读环境变量，不需要 agent 关心文件路径

---

## 第二步：OpenCLI 编排层

### 任务元数据

```yaml
step: 2
title: "OpenCLI 编排层扩展"
estimated_changes: "~200 lines"
files_to_edit:
  - src/workflow/executor.ts (opencli step outputVar support, ~20 lines)
  - src/cli-tools/discovery/opencli.ts (new, ~60 lines)
  - src/nl/templates/index.ts (add opencli intent templates, ~110 lines)
  - src/workflow/executor.test.ts (update opencli tests)
dependencies:
  - src/workflow/executor.ts (现有 opencli 实现, 第 207-247 行)
  - src/cli-tools/discovery/known-tools.ts (已知工具列表格式)
  - src/cli-tools/registry.ts (工具注册)
skills_to_use:
  - tdd-workflow
  - test-generator
```

### 背景

`src/workflow/executor.ts` 第 207-247 行已有 `opencli` 步骤类型的基础实现：
- 已调用 `spawn('opencli', [site, command, ...args])`
- 已收集 stdout 并存入 `context.previousOutputs[step.id]`（第 237 行）
- **缺少**：`outputVar` 自定义变量名支持
- **缺少**：工具发现机制
- **缺少**：意图模板（当前模板没有 opencli 相关意图）

### 2.1 扩展 opencli 步骤执行器 — outputVar 支持

**文件**: `src/workflow/executor.ts`
**修改行**: 第 236-237 行

当前代码：
```typescript
      const outputs = result.stdout ? [result.stdout] : [];
      context.previousOutputs[step.id] = outputs;
```

替换为：
```typescript
      const outputs = result.stdout ? [result.stdout] : [];
      const storageKey = step.outputVar || step.id;
      context.previousOutputs[storageKey] = outputs;
```

**意图**：用户可以通过 `outputVar` 指定变量名，而不使用默认的步骤 ID。

### 2.2 opencli 工具发现

**文件**: `src/cli-tools/discovery/opencli.ts`（新建）

**参考**：`src/cli-tools/discovery/known-tools.ts` 的格式

**实现**：
```typescript
import type { KnownTool } from './types.js';

export const OPENCLI_TOOL: KnownTool = {
  id: 'opencli',
  name: 'opencli',
  version: '>=1.0.0',
  versionRequirement: '>=1.0.0',
  description: 'OpenCLI - Turn websites into deterministic CLI commands',
  checkCommand: 'opencli --version',
  checkOutputRegex: /opencli/,
  packageManager: 'npm',
  versionCommands: ['opencli --version'],
  categories: ['automation'],
  confidence: 0.90,
};

export function isOpencliInstalled(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('opencli --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
```

**注意**：不需要自动运行 `opencli list` 解析站点列表（这太复杂），只需检测 opencli 是否安装。站点发现由 LLM 生成工作流时处理。

### 2.3 扩展意图模板

**文件**: `src/nl/templates/index.ts`

**参考现有模板格式**（看同文件中其他模板的写法）

**新增意图**（按 `createIntentTemplate()` 格式）:
- `FETCH_HOT_NEWS` — keywords: ['热榜', 'hot', 'trending', '排行榜']
- `SOCIAL_MEDIA_SEARCH` — keywords: ['搜索', 'search', '查找', 'find']
- `DATA_SCRAPING` — keywords: ['爬取', 'scrape', '抓取', '采集']
- `CONTENT_SUMMARY` — keywords: ['摘要', 'summary', '汇总', '总结']

### 验证步骤

```bash
npm run typecheck
npm test -- src/workflow/executor.test.ts
```

---

## 第三步：企业安全场景

### 任务元数据

```yaml
step: 3
title: "企业安全场景"
estimated_changes: "持续迭代，第一步约 300 lines"
files_to_edit:
  - src/workflow/scheduler.ts (new, ~120 lines)
  - src/infrastructure/audit/ (enhance, ~80 lines)
  - src/security-protocol/rbac.ts (new, ~100 lines)
dependencies:
  - src/workflow/engine.ts (工作流引擎)
  - src/infrastructure/audit/index.ts (审计日志)
  - src/security-protocol/manager.ts (安全协议)
skills_to_use:
  - tdd-workflow
  - test-generator
```

### 具体任务

#### 3.1 定时任务

**文件**: `src/workflow/scheduler.ts`（新建）

**实现**:
- 使用 `setTimeout` 循环实现 cron-like 调度（不引入 node-cron 依赖）
- 配置文件 `~/.vectahub/schedules.json`
- 支持 `vectahub schedule add/remove/list` CLI 命令

#### 3.2 增强审计日志

**文件**: `src/infrastructure/audit/`

**增强**:
- 添加 session/user 字段
- 添加 `query(filters)` 方法支持按时间/用户/命令过滤
- 添加 `export(format: 'json' | 'csv')` 方法

#### 3.3 RBAC 权限管理

**文件**: `src/security-protocol/rbac.ts`（新建）

**实现**:
- 角色定义：developer/ci-runner/admin
- 每个角色配置：allowed_tools、blocked_commands、max_timeout、sandbox_mode
- 配置文件 `~/.vectahub/rbac.json`

### 验证步骤

```bash
npm run typecheck
npm test -- src/workflow/scheduler.test.ts
npm test -- src/security-protocol/rbac.test.ts
```

---

```yaml
version: 6.0.0
lastUpdated: 2026-05-02
status: active_development_tasks
```
