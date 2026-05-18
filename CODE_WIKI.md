# VectaHub Code Wiki

> Natural Language Workflow Engine — 将任务描述转换为本地执行指令

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [核心架构](#核心架构)
- [主要模块职责](#主要模块职责)
- [关键类与函数](#关键类与函数)
- [依赖关系](#依赖关系)
- [项目运行方式](#项目运行方式)
- [开发指南](#开发指南)

---

## 项目概述

VectaHub 是一个命令行工具，旨在将自然语言描述转换为可执行的本地自动化流程。它基于 LLM Tool Calling 和强类型防腐层架构，提供安全、准确的工作流执行能力。

### 核心特性

- **自然语言转换**: 基于 LLM Tool Calling 的意图识别，生成结构化任务列表
- **多种任务类型**: 涵盖文件查找、Git 操作、包管理、文件读写等
- **交互模式 (Chat)**: 提供支持分层记忆（L1/L2/L3）的对话界面
- **工作流编排**: 支持在 YAML 中定义条件、循环与并行步骤
- **安全机制**: 提供 Strict/Relaxed/Consensus 三种执行模式，内置危险命令检测
- **强类型防腐层**: Schema 驱动的类型安全映射，防映射漂移测试保护

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript 5.6 |
| 运行时 | Node.js >= 21.0.0 |
| CLI 框架 | Commander.js |
| 测试框架 | Vitest |
| 构建工具 | tsup |
| 日志 | Pino |
| 配置 | YAML |

---

## 项目结构

```
vectahub/
├── src/
│   ├── cli.ts                    # CLI 入口（引导文件）
│   ├── cli-bootstrap.ts          # CLI 启动引导
│   ├── cli-main.ts               # CLI 主程序
│   ├── index.ts                  # 包入口（导出公共 API）
│   ├── types/                    # 共享类型定义
│   ├── workflow/                 # 工作流引擎核心
│   ├── nl/                       # 自然语言处理
│   ├── sandbox/                  # 沙箱隔离环境
│   ├── security-protocol/        # 安全协议与防护
│   ├── commands/                 # CLI 子命令实现
│   ├── skills/                   # 技能系统
│   ├── execution/                # 执行引擎与记录管理
│   ├── infrastructure/           # 基础设施（审计、配置、日志、追踪、路径、事件、安全、数据、并发、加载器）
│   ├── agent-runtime/            # Agent 运行时适配器
│   ├── cli-tools/                # 外部 CLI 工具集成
│   ├── chat/                     # 交互式对话实现
│   ├── daemon/                   # 守护进程
│   ├── debugger/                 # 调试器
│   ├── monitoring/               # 监控系统
│   ├── project/                  # 项目上下文检测
│   ├── setup/                    # 设置与首次运行向导
│   └── utils/                    # 工具函数
├── packages/
│   ├── vectahub-vscode-extension/ # VSCode 扩展
│   └── doc-task-contract-core/    # 文档任务契约核心
├── config/                       # 配置文件
├── docs/                         # 文档目录
├── benchmarks/                   # 性能基准测试
└── scripts/                      # 构建脚本
```

---

## 核心架构

VectaHub 采用基于 LLM Tool Calling 和强类型防腐层的架构，确保安全和准确性：

```
用户输入
    │
    ▼
┌─────────────────────────────────────┐
│  大模型意图提取 (LLM Intent Extraction) │
│  - 调用 LLM 进行意图识别              │
│  - 提取参数并生成结构化输出           │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Semantic Guardrails (语义护栏)      │
│  - 验证意图合法性                     │
│  - 检测危险命令和敏感操作             │
│  - 应用安全策略                       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  确定性 Workflow Mapping            │
│  - Schema 驱动的类型安全映射          │
│  - 防映射漂移测试保护                 │
│  - 生成可预测的工作流定义             │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  执行器 (Executor)                   │
│  - 步骤编排与执行                    │
│  - 沙箱隔离环境                      │
│  - 审计日志记录                      │
└─────────────────────────────────────┘
```

### 分层记忆系统

| 层级 | 名称 | 存储时长 | 用途 |
|------|------|----------|------|
| **L1** | 会话记忆 | 当前会话 | 对话上下文保持 |
| **L2** | 工作流记忆 | 执行期间 | 步骤间状态传递 |
| **L3** | 长期记忆 | 持久化 | 历史执行记录、知识沉淀 |

---

## 主要模块职责

### 1. workflow/ - 工作流引擎核心

负责工作流的定义、执行和管理。

**主要组件：**
- `engine.ts` - 工作流引擎，管理工作流生命周期
- `executor.ts` - 步骤执行器，执行具体命令
- `storage.ts` - 工作流存储管理
- `state-manager.ts` - 执行状态管理
- `context-manager.ts` - 执行上下文管理
- `interpolation.ts` - 变量插值处理
- `dag.ts` - 有向无环图，处理步骤依赖关系
- `handlers/` - 各类步骤处理器（exec、if、parallel、for_each）

**核心职责：**
- 创建和管理工作流定义
- 解析步骤依赖关系并拓扑排序
- 执行工作流步骤并记录结果
- 支持暂停、恢复、中止操作
- 管理执行上下文和变量插值

### 2. nl/ - 自然语言处理

负责将自然语言输入转换为可执行的工作流。

**主要组件：**
- `orchestrator.ts` - NL 编排器，协调整个处理流程
- `llm.ts` - LLM 客户端，与大模型交互
- `intent-matcher.ts` - 意图匹配器
- `param-extractor.ts` - 参数提取器
- `tool-calling.ts` - 工具调用构建
- `core/pipeline.ts` - NL 处理管道
- `core/intent-splitter.ts` - 多意图拆分
- `capabilities/router.ts` - 能力路由器

**核心职责：**
- 解析用户自然语言输入
- 调用 LLM 进行意图识别
- 提取任务参数
- 生成工作流定义
- 支持多意图拆分处理

### 3. sandbox/ - 沙箱隔离环境

提供命令执行的安全隔离环境。

**主要组件：**
- `sandbox.ts` - 沙箱管理器
- `detector.ts` - 危险命令检测器
- `semantic-detector.ts` - 语义级危险检测
- `memory-monitor.ts` - 内存监控
- `worktree-manager.ts` - 工作树管理
- `constants.ts` - 沙箱常量配置

**核心职责：**
- 检测危险命令（rm -rf、sudo 等）
- 提供多种隔离策略（sandbox-exec、unshare、bubblewrap、directory）
- 管理沙箱工作空间
- 监控资源使用
- 命令签名验证

### 4. security-protocol/ - 安全协议与防护

提供多层次的安全防护机制。

**主要组件：**
- `engine.ts` - 安全引擎，风险评估
- `manager.ts` - 安全管理器
- `guard.ts` - 安全守卫
- `rbac.ts` - 基于角色的访问控制
- `redactor.ts` - 敏感信息脱敏
- `default-rules.ts` - 默认安全规则
- `evaluators/` - 各类评估器

**核心职责：**
- 评估命令风险等级
- 执行 RBAC 权限控制
- 脱敏敏感信息
- 应用安全策略
- 记录安全审计日志

### 5. commands/ - CLI 子命令实现

实现所有 CLI 命令。

**主要命令：**
- `run.ts` - 执行工作流命令
- `chat.ts` - 交互式对话命令
- `run-command.ts` - 直接执行命令
- `run-task.ts` - 执行文档任务
- `doctor.ts` - 系统诊断
- `security.ts` - 安全管理
- `trace.ts` - 追踪管理
- `history.ts` - 历史记录
- `validate.ts` - 工作流验证

**核心职责：**
- 解析命令行参数
- 调用核心模块执行任务
- 格式化输出结果
- 处理错误和异常

### 6. skills/ - 技能系统

提供可扩展的技能模块。

**主要组件：**
- `registry.ts` - 技能注册表
- `executor.ts` - 技能执行器
- `intent-skill.ts` - 意图技能
- `command-skill.ts` - 命令技能
- `workflow-skill.ts` - 工作流技能
- `pipeline-skill.ts` - 管道技能
- `iterative-refinement/` - 迭代优化
- `llm-dialog-control/` - LLM 对话控制
- `ai-modules/` - AI 模块

**核心职责：**
- 注册和管理技能
- 执行技能逻辑
- 支持迭代优化
- 管理 LLM 对话

### 7. execution/ - 执行引擎与记录管理

管理执行记录和生命周期。

**主要组件：**
- `record-manager.ts` - 记录管理器
- `lifecycle.ts` - 生命周期管理
- `output-store.ts` - 输出存储
- `queue-manager.ts` - 队列管理
- `archiver.ts` - 归档管理
- `id-generator.ts` - ID 生成器

**核心职责：**
- 生成执行 ID
- 管理执行记录
- 存储执行输出
- 管理执行队列
- 归档历史记录

### 8. infrastructure/ - 基础设施

提供底层基础设施支持。

**主要组件：**
- `audit/` - 审计系统
- `config/` - 配置管理
- `errors/` - 错误处理
- `logger/` - 日志系统
- `trace/` - 追踪系统
- `trace-audit/` - 追踪审计
- `paths/` - 路径工具
- `event/` - 事件管理器
- `security/` - 安全基础设施（敏感数据脱敏、配置安全）
- `data/` - 数据管理（清理服务、操作日志）
- `concurrency/` - 并发基础设施（工作池）
- `loaders/` - 模块加载器（懒加载）

**核心职责：**
- 记录审计日志
- 管理配置
- 处理错误
- 提供日志服务
- 实现分布式追踪
- 提供路径、安全、数据、并发等基础设施工具

### 9. agent-runtime/ - Agent 运行时适配器

集成外部 AI Agent。

**主要组件：**
- `factory.ts` - 工厂模式创建适配器
- `registry.ts` - 适配器注册表
- `adapters/` - 各 Agent 适配器（aider、claude、codex、gemini）

**核心职责：**
- 适配不同 AI Agent
- 管理 Agent 生命周期
- 转换请求和响应格式

### 10. cli-tools/ - 外部 CLI 工具集成

集成外部命令行工具。

**主要组件：**
- `registry.ts` - 工具注册表
- `discovery/` - 工具发现
- `registration/` - 工具注册
- `tools/` - 具体工具实现（git、npm、docker、gh、curl）
- `command-rules/` - 命令规则

**核心职责：**
- 发现可用 CLI 工具
- 注册工具元数据
- 提供工具执行能力
- 管理命令规则

### 11. chat/ - 交互式对话实现

提供交互式对话界面。

**主要组件：**
- `repl.ts` - REPL 交互界面
- `context-builder.ts` - 上下文构建器
- `command-manager.ts` - 命令管理器
- `command-bridge.ts` - 命令桥接
- `ui-renderer.ts` - UI 渲染器

**核心职责：**
- 提供交互式对话界面
- 管理对话上下文
- 处理用户输入
- 渲染输出结果

### 12. utils/ - 工具函数

提供通用工具函数。

**主要组件：**
- `paths.ts` - 路径工具
- `logger.ts` - 日志工具
- `audit.ts` - 审计工具
- `config.ts` - 配置工具
- `errors.ts` - 错误处理
- `shell.ts` - Shell 工具
- `redact.ts` - 脱敏工具
- `safe-command-builder.ts` - 安全命令构建器

**核心职责：**
- 提供路径处理
- 日志记录
- 审计记录
- 配置管理
- 错误处理
- Shell 命令执行

---

## 关键类与函数

### WorkflowEngine

工作流引擎，管理工作流的完整生命周期。

```typescript
interface WorkflowEngine {
  createWorkflow(name: string, steps: Step[], options?: CreateWorkflowOptions): Promise<Workflow>;
  execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord>;
  pause(): boolean;
  resume(): boolean;
  abort(): boolean;
  getStatus(): ExecutionRecord | undefined;
}
```

**位置：** `src/workflow/engine.ts`

### SandboxManager

沙箱管理器，提供安全的命令执行环境。

```typescript
class SandboxManager {
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  detectDanger(command: string): CommandDetection;
  validateSignature(command: string): SignatureValidation;
}
```

**位置：** `src/sandbox/sandbox.ts`

### Executor

步骤执行器，执行具体的工作流步骤。

```typescript
interface Executor {
  exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult>;
  execute(step: Step, options?: ExecutorOptions, context?: ExecutionContext): Promise<ExecutionResult>;
  validateStep(step: Step): { valid: boolean; errors: string[] };
}
```

**位置：** `src/workflow/executor.ts`

### NLProcessor

自然语言处理器，将自然语言转换为工作流。

```typescript
interface NLProcessor {
  parse(context: NLContext): Promise<NLResult>;
}
```

**位置：** `src/nl/core/pipeline.ts`

### LLMClient

LLM 客户端，与大模型 API 交互。

```typescript
class LLMClient {
  complete(traceId: string, input: string, context: unknown, options?: LLMOptions): Promise<LLMResponse>;
}
```

**位置：** `src/nl/llm.ts`

### SecurityGuard

安全守卫，评估命令风险。

```typescript
interface SecurityGuard {
  assess(intention: CommandIntention, context: SecurityContext): Promise<SecurityDecision>;
}
```

**位置：** `src/security-protocol/guard.ts`

### ContextManager

上下文管理器，管理执行上下文。

```typescript
interface ContextManager {
  createContext(workflowId: string, executionId: string, sessionId: string, variables: Record<string, unknown>, cwd: string, options?: ContextOptions): void;
  setStepOutput(executionId: string, stepId: string, output: unknown[], metadata?: StepOutputMetadata): void;
  toExecutorContext(executionId: string): ExecutorContext;
  deleteContext(executionId: string): void;
}
```

**位置：** `src/workflow/context-manager.ts`

### RecordManager

记录管理器，管理执行记录。

```typescript
interface RecordManager {
  create(metadata: ExecutionMetadata): ExecutionRecord;
  update(id: string, updates: Partial<ExecutionRecord>): void;
  get(id: string): ExecutionRecord | undefined;
  search(filter: ExecutionFilter): ExecutionSearchResult[];
}
```

**位置：** `src/execution/record-manager.ts`

### IntentMatcher

意图匹配器，匹配用户意图。

```typescript
interface IntentMatcher {
  match(input: string, sessionId?: string): IntentMatch;
  matchMultiIntent(input: string, sessionId?: string): MultiIntentResult;
}
```

**位置：** `src/nl/intent-matcher.ts`

### createIntentSplitter

意图拆分器，拆分多意图输入。

```typescript
function createIntentSplitter(): {
  split(input: string): Promise<SplitResult>;
}
```

**位置：** `src/nl/core/intent-splitter.ts`

---

## 依赖关系

### 生产依赖

| 依赖包 | 版本 | 用途 |
|--------|------|------|
| commander | ^14.0.3 | CLI 框架 |
| json-logic-js | ^2.0.5 | JSON 逻辑表达式 |
| lodash | ^4.18.1 | 工具函数库 |
| pino | ^10.3.1 | 日志库 |
| pino-pretty | ^13.1.3 | 日志格式化 |
| shell-quote | ^1.8.3 | Shell 命令解析 |
| yaml | ^2.8.3 | YAML 解析 |

### 开发依赖

| 依赖包 | 版本 | 用途 |
|--------|------|------|
| @eslint/js | ^10.0.1 | ESLint 配置 |
| @types/json-logic-js | ^2.0.8 | 类型定义 |
| @types/node | ^22.0.0 | Node.js 类型定义 |
| globals | ^17.6.0 | 全局变量定义 |
| tsup | ^8.5.1 | 构建工具 |
| tsx | ^4.19.0 | TypeScript 执行器 |
| typescript | ^5.6.0 | TypeScript 编译器 |
| typescript-eslint | ^8.59.2 | TypeScript ESLint |
| vitest | ^4.1.5 | 测试框架 |

### 模块依赖关系

```
commands/
    ├── workflow/          # 工作流执行
    ├── nl/                # 自然语言处理
    ├── sandbox/           # 沙箱执行
    ├── security-protocol/ # 安全检查
    └── execution/         # 记录管理

workflow/
    ├── sandbox/           # 沙箱隔离
    ├── execution/         # 记录管理
    └── infrastructure/    # 审计日志

nl/
    ├── workflow/          # 工作流生成
    ├── sandbox/           # 语义检测
    └── skills/            # 技能调用

sandbox/
    ├── command-rules/     # 命令规则
    └── infrastructure/    # 审计日志

security-protocol/
    ├── sandbox/           # 沙箱检测
    └── command-rules/     # 命令规则
```

---

## 项目运行方式

### 环境要求

- Node.js >= 21.0.0
- macOS 或 Linux

### 安装

```bash
npm install -g vectahub
```

### 快速开始

```bash
# 自动生成并执行
vectahub run "查看 Git 状态"

# 仅预览不执行
vectahub run --dry-run "删除 node_modules"

# 直接执行明确指令（含安全扫描）
vectahub run-command -- npm test

# 进入交互式对话界面
vectahub chat
```

### 主要命令

| 命令 | 说明 |
|------|------|
| `vectahub run <intent>` | 从自然语言或文件运行工作流 |
| `vectahub run-command <cmd>` | 直接执行命令（带安全扫描） |
| `vectahub chat` | 进入交互式对话界面 |
| `vectahub doctor` | 系统诊断 |
| `vectahub security` | 安全管理 |
| `vectahub trace` | 追踪管理 |
| `vectahub history` | 查看历史记录 |
| `vectahub validate <file>` | 验证工作流文件 |

### 配置

配置文件位于 `~/.vectahub/config.yaml`，主要配置项：

```yaml
# AI 提供商配置
ai_providers:
  vectahub_llm:
    enabled: true
    provider: openai
    apiKey: your-api-key
    model: gpt-4

# 安全配置
security:
  mode: relaxed  # strict | relaxed | consensus
  sandbox_enabled: true

# 日志配置
logging:
  level: info
  format: json
```

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `VECTAHUB_HOME` | 自定义数据路径 |
| `VECTAHUB_LLM_TEMPERATURE` | LLM 温度参数 |
| `VECTAHUB_AUDIT_DISABLED` | 禁用审计日志 |

---

## 开发指南

### 构建项目

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式
npm run dev
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行测试（单次）
npm run test:run

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

### 项目约定

1. **代码风格**: 使用 ESLint 进行代码检查
2. **类型安全**: 严格 TypeScript 类型检查
3. **测试覆盖**: 核心模块测试覆盖率 >= 80%
4. **提交规范**: 使用 Conventional Commits
5. **文档**: 重要变更需更新文档

### 添加新命令

1. 在 `src/commands/` 创建新文件
2. 实现 Commander.js 命令
3. 在 `src/cli-main.ts` 注册命令
4. 添加测试文件
5. 更新文档

### 添加新技能

1. 在 `src/skills/` 创建新目录
2. 实现技能接口
3. 在 `src/skills/registry.ts` 注册技能
4. 添加测试文件
5. 更新文档

---

## 附录

### 相关文档

- [README.md](./README.md) - 项目说明
- [docs/architecture.md](./docs/architecture.md) - 架构文档
- [docs/usage.md](./docs/usage.md) - 使用指南
- [docs/development.md](./docs/development.md) - 开发指南
- [docs/testing.md](./docs/testing.md) - 测试指南
- [docs/troubleshooting.md](./docs/troubleshooting.md) - 故障排除

### 许可证

MIT

---

*文档生成时间: 2026-05-16*
*基于 VectaHub v1.0.11*
