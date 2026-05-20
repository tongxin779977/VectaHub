# VectaHub 架构总览

> Document Status: Baseline Architecture (Finalized v1.0)
> Authority: High-level architecture. Implementation follows Google Engineering Standards.

## 定位

VectaHub 是 AI 辅助开发场景下的执行编排层。

它负责把自然语言、文档任务、工作流和外部 Agent CLI 转换为可治理的工程执行过程。底层 Agent 只负责执行边界清楚的小任务；VectaHub 负责合同、状态、追踪、安全、验证和恢复。

```text
User / VS Code / CLI
        |
        v
VectaHub Orchestrator (Infrastructure Context / DI)
        |
        +-- Task Contract
        +-- Trace (OpenTelemetry Compatible)
        +-- Security Policy
        +-- Verification
        +-- Recovery
        |
        v
Agent / CLI / Workflow Worker
```

## 非目标

VectaHub 不做以下事情：

- 不把 Agent 输出当作系统真实状态。
- 不让 Agent 默认读取整份大文档后自由发挥。
- 不把高风险命令交给 Agent 静默执行。
- 不要求插件解析人类日志来判断执行结果。
- 不在当前阶段引入数据库、多租户 RBAC 或完整服务端控制面。

## 当前系统边界

当前仓库以 TypeScript CLI、VS Code 插件和共享合同包为主：

```text
src/cli.ts                    CLI 入口
src/index.ts                  包入口
src/types/                    共享类型
src/nl/                       自然语言解析与意图处理
src/workflow/                 工作流引擎
src/sandbox/                  沙箱和危险检测
src/cli-tools/                外部工具集成
src/skills/                   技能与执行能力
src/command-rules/            命令黑白名单
src/infrastructure/           基础设施核心 (DI/IO/Logger/Trace/Event/Audit)
src/utils/                    CLI 命令业务逻辑实现
packages/doc-task-contract-core/          文档任务合同纯函数包
packages/vectahub-vscode-extension/       VS Code 插件
```

### 基础设施层 (Infrastructure Context)

系统通过 `InfrastructureContext` 实现依赖注入（DI），彻底解耦了文件系统、环境变量、进程控制和日志系统。这种设计支持：
- **生产环境**：使用 `EnvironmentService`（Node.js 原生 API）和 `LoggerService`（Pino 结构化日志）。
- **测试环境**：使用 `MockEnvironmentService` 和 `MockLoggerService`，实现 100% 内存化隔离，无 IO 副作用。

### 结构化追踪 (Trace)

追踪系统对齐 **OpenTelemetry** 标准，引入 `SpanKind` 语义（INTERNAL, CLIENT, SERVER 等）。所有执行过程均通过结构化 Span 记录，支持导出为标准遥测格式。

### CLI 纪律

所有 CLI 输出遵循以下红线：
- **Stdout (fd 1)**：仅用于输出纯净的业务数据或结构化 JSON。
- **Stderr (fd 2)**：用于输出所有人类可读的日志、警告和错误。
这确保了 VectaHub 可以被无缝嵌入到管道（Pipes）或作为子进程调用。

## 核心模块

| 模块 | 职责 |
|------|------|
| CLI | 接收用户输入，输出人类文本或稳定 JSON。 |
| NL / Intent | 把自然语言或文档任务转换为可执行意图。 |
| Workflow | 管理步骤、依赖、上下文和执行记录。 |
| Agent Task Contract | 通过 `@vectahub/doc-task-contract-core` 和 CLI 为 Agent 生成边界清楚的任务合同。 |
| Agent Runtime Catalog | 提供已注册 Agent CLI 的结构化运行时事实。 |
| VectaHub Capability Catalog | 提供 VectaHub 自身命令、能力和副作用边界。 |
| Trace | 贯通插件、CLI、Agent、验证命令和恢复链路。 |
| Security | 评估命令风险、拦截高危行为、执行脱敏。 |
| Verification | 在 Agent 执行后运行合同中的验证命令。 |
| Recovery | 根据失败分类、hash 和 trace 提供恢复路径。 |

## 执行原则

### Preview First

自然语言和文档任务必须先能预览。`dry-run` 必须零副作用：

- 不执行命令。
- 不安装依赖。
- 不扫描外部 CLI。
- 不写执行记录。
- 不修改配置。

对 `run-task` 而言，当前代码中的预览边界更具体：

- `run-task --dry-run` 会先构建任务边界合同摘要，再返回一条本地预览命令。
- 该分支在返回前不会创建 LLM client，不会发现外部工具 help，也不会执行 Agent；对非 Agent fallback 路径，只允许读取本地 Provider/Model/Temperature 元数据来完成合同哈希。
- `run-task --contract-preview` 比 `--dry-run` 更早返回，只暴露合同摘要，不要求 `--tool`。
- 预览模式返回的重点是结构化边界，不是完整文档回显；长文档内容不应原样泄漏到预览命令文本。

### Contract First

Agent 任务必须通过 `AgentTaskContract` 执行。合同至少包括：

- `taskId`
- `label`
- `instructionHash`
- `docExcerpt`
- `allowedFiles`
- `forbiddenFiles`
- `validationCommands`
- `timeoutMs`

### State Owned By VectaHub

系统状态由 VectaHub 自己记录。Agent 的文本输出只能作为输入材料，不能作为成功、失败、恢复或漂移判断的真相源。

### Structured Protocol

面向插件、脚本和未来 SDK 的接口必须使用结构化 JSON。机器调用方不得依赖人类日志格式。

### Capability-Aware LLM

LLM 调用前必须由 VectaHub 注入能力上下文。LLM 只能基于 `Agent Runtime Catalog` 和 `VectaHub Capability Catalog` 选择能力、解释意图或生成任务语义；不得把 Agent CLI 调用协议当作自由文本推理结果。

已注册 Agent CLI 的命令渲染由 registry-backed renderer 负责。LLM 可参与选择 Agent、解释用户目标、补全任务语义或辅助 onboarding，但不能覆盖 registry 中的 `promptTransport`、`cwdTransport`、`executionMode`、preflight 或 approval policy。

### Safety By Default

高风险命令必须确认，敏感信息必须在落盘前脱敏。安全评估失败时默认进入保守模式。

审计失败策略按入口显式区分：默认基础设施审计服务是 fail-open，用于避免后台审计问题放大为全局不可用；CLI 主入口的命令审计和审计初始化是 fail-closed，写入失败会直接阻断命令返回。

## 演进方向

长期方向是让 CLI、插件和未来 SDK 共享同一套合同和执行语义。Go 重构、REST/gRPC 和数据库索引等历史蓝图已从当前事实层移除，后续若重启必须重新写设计文档。

在 Agent CLI 支持层，目标方向是：

- 用统一动态 registry 管理 Agent 定义和能力
- 让 `run-task`、chat 和插件选择器共用同一套 Agent 解析逻辑
- 对不能原生 headless 的 Agent 提供 mediated interactive 支持，而不是直接排除
- 让 LLM 通过 `LLM Context Pack` 熟悉已注册 Agent、VectaHub 命令面和当前项目执行边界
