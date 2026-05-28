# VectaHub 文档

VectaHub 当前应被理解为一个**单用户、本地优先的 CLI 自动化内核**，重点在文档处理、结构化执行、可扩展 Agent CLI 注册和编排能力。

这套文档正在围绕“当前真实能力面”重组。

## 从这里开始

如果你想用最短路径理解这个项目，建议按下面顺序阅读：

1. [仓库首页 README](../README.md)
2. [能力地图](./capabilities.md)
3. [能力明细](./capabilities-reference.md)
4. [CLI 使用手册](./usage.md)
5. [架构总览](./architecture.md)

## 按读者类型阅读

### 面向 CLI 用户

- [CLI 使用手册](./usage.md)
- [配置手册](./configuration.md)
- [Workflow 规格](./workflow-spec.md)
- [排障手册](./troubleshooting.md)

### 面向维护者

- [架构总览](./architecture.md)
- [能力明细](./capabilities-reference.md)
- [开发者指南](./development.md)
- [测试指南](./testing.md)
- [核心合同](./contracts.md)

### 面向文档任务和 Agent 执行链路

- [Agent 执行系统](./agent-execution.md)
- [Run-Task 执行合同](./specs/run-task-execution-contract.md)
- [Agent Worker 合同](./specs/agent-worker-contract.md)
- [恢复闭环](./specs/recovery-loop.md)
- [验证闭环](./specs/verification-loop.md)

## 核心文档

| 文档 | 角色 |
|------|------|
| [capabilities.md](./capabilities.md) | 面向产品和读者的能力地图。 |
| [capabilities-reference.md](./capabilities-reference.md) | 当前功能细节、边界和状态说明。 |
| [usage.md](./usage.md) | 面向操作者的命令使用手册。 |
| [architecture.md](./architecture.md) | 当前系统结构和仓库重点。 |
| [contracts.md](./contracts.md) | specs 的合同入口索引。 |

## 当前能力重心

当前产品形态建议按下面优先级理解：

1. 文档处理和文档任务执行
2. 基础交互式 CLI 回复
3. 工作流执行
4. 可扩展 Agent CLI 注册
5. 编排、委托与任务拆解
6. 安全、trace、验证与恢复
7. 本地服务与集成层

## 当前文档规则

- 面向用户的说明，应该先从能力讲起，而不是从迁移理论讲起。
- specs 仍然重要，但不应该成为新读者看到的第一批文档。
- 一个功能可能只存在于代码里、只存在于 specs 里，或者两边都有，文档里必须写清楚。
- `Current Implementation`、`Partial Implementation`、`Target Design` 不能混写。



## 次级参考区域

### 产品和执行参考

- [Agent 执行系统](./agent-execution.md)
- [Workflow 规格](./workflow-spec.md)
- [配置手册](./configuration.md)
- [排障手册](./troubleshooting.md)

### 维护参考

- [开发者指南](./development.md)
- [测试指南](./testing.md)
- [发布指南](./release.md)
- [Agent 操作规范](./agent-operating-guide.md)

### 设计与迁移参考

#### 架构设计

- [design/](./design/)
- [Agent CLI 注册与 Runtime 架构设计](./design/agent-cli-runtime-architecture.md)
- [编排、委托与任务拆解架构设计](./design/orchestration-and-delegation-architecture.md)
- [安全、Trace、执行记录与恢复架构设计](./design/safety-trace-recovery-architecture.md)
- [本地服务与集成层架构设计](./design/local-service-integration-architecture.md)
- [工作流引擎架构设计](./design/workflow-engine-architecture.md)
- [文档处理架构设计](./design/document-processing-architecture.md)

#### 模块增强功能设计

- [Agent Runtime 增强功能设计](./design/agent-runtime-enhancements.md) — 超时重试、缓存、配置验证、事件通知、并发控制、工具函数
- [NL Engine 增强功能设计](./design/nl-engine-enhancements.md) — 请求队列、配置热重载、工作流检测缓存、匹配优化、翻译记忆、能力发现
- [Sandbox 增强功能设计](./design/sandbox-enhancements.md) — 资源追踪、配置验证、生命周期钩子、验证引擎、池管理、告警监控
- [Skills 增强功能设计](./design/skills-enhancements.md) — 版本管理、自动发现、执行沙箱、生命周期管理、集中化管理
- [CLI Entry 增强功能设计](./design/cli-entry-enhancements.md) — 命令缓存、异步加载、错误处理、帮助生成、版本检查、配置验证
- [Chat REPL 增强功能设计](./design/chat-repl-enhancements.md) — 命令缓存、解析缓存、Shell 超时、NL 意图缓存、会话持久化
- [Monitoring 增强功能设计](./design/monitoring-enhancements.md) — 告警管理、健康检查、指标采集、监控重构
- [Security Protocol 增强功能设计](./design/security-protocol-enhancements.md) — 管理器重构、配置存储、规则存储、命令检测、模式匹配、共享评估器
- [Execution 增强功能设计](./design/execution-enhancements.md) — 双类型断言修复、生命周期状态机、记录管理、队列管理、输出存储、归档器
- [Command Rules 增强功能设计](./design/command-rules-enhancements.md) — Schema 验证、Happy Path 测试、JSDoc 文档
- [CLI Tools 增强功能设计](./design/cli-tools-enhancements.md) — 接口去重、Node 前缀修复、测试覆盖、配置验证
- [Commands 增强功能设计](./design/commands-enhancements.md) — 类型断言修复、运行时验证、copyOptionalFields、测试辅助工具
- [Infrastructure 增强功能设计](./design/infrastructure-enhancements.md) — 审计系统、配置管理、错误处理、日志系统、依赖注入、事件总线、配置安全

#### 规格与参考

- [specs/](./specs/)
