# VectaHub 文档

VectaHub 当前应被理解为一个**单用户、本地优先的 NL Workflow Orchestrator**，重点在自然语言编排、文档任务执行、结构化 workflow、安全治理、可扩展 Agent CLI 注册和恢复能力。

这套文档围绕“当前真实能力面”组织：根目录负责读者入口，`contracts/` 负责字段级约束，`standards/` 负责可复用治理规则，`design/` 负责当前主线设计，`ui/` 负责 VS Code 和 UI 交互。

## 从这里开始

如果你想用最短路径理解这个项目，建议按下面顺序阅读：

1. [仓库首页 README](../README.md)
2. [NL Workflow Orchestrator 产品入口](./nl-workflow-orchestrator.md)
3. [能力地图](./capabilities.md)
4. [能力明细](./capabilities-reference.md)
5. [CLI 使用手册](./usage.md)
6. [架构总览](./architecture.md)

## 按读者类型阅读

### 面向 CLI 用户

- [CLI 使用手册](./usage.md)
- [配置手册](./configuration.md)
- [Workflow 规格](./workflow-spec.md)
- [排障手册](./troubleshooting.md)

### 面向维护者

- [NL Workflow Orchestrator 产品入口](./nl-workflow-orchestrator.md)
- [架构总览](./architecture.md)
- [能力明细](./capabilities-reference.md)
- [开发者指南](./development.md)
- [开发队列](./development-backlog.md)
- [开发队列详情](./backlog/)
- [测试指南](./testing.md)
- [核心合同](./contracts/)
- [标准体系](./standards/)

### 面向文档任务和 Agent 执行链路

- [NL Workflow Orchestrator 产品设计](./design/nl-workflow-orchestrator-product-design.md)
- [Hybrid AI NL Engine 设计](./design/hybrid-ai-nl-engine.md)
- [Agent 执行系统](./agent-execution.md)
- [Run-Task 执行合同](./contracts/run-task-execution-contract.md)
- [Agent Worker 合同](./contracts/agent-worker-contract.md)
- [编排计划合同](./contracts/orchestration-plan.md)
- [Workflow Draft 合同](./contracts/workflow-draft.md)
- [恢复闭环](./contracts/recovery-loop.md)
- [验证闭环](./contracts/verification-loop.md)

## 核心文档

| 文档 | 角色 |
|------|------|
| [nl-workflow-orchestrator.md](./nl-workflow-orchestrator.md) | NL Workflow Orchestrator 产品定位入口。 |
| [capabilities.md](./capabilities.md) | 面向产品和读者的能力地图。 |
| [capabilities-reference.md](./capabilities-reference.md) | 当前功能细节、边界和状态说明。 |
| [usage.md](./usage.md) | 面向操作者的命令使用手册。 |
| [architecture.md](./architecture.md) | 当前系统结构和仓库重点。 |
| [development-backlog.md](./development-backlog.md) | NL Workflow Orchestrator 开发队列入口和任务索引。 |
| [backlog/](./backlog/) | 拆分后的开发队列协议、任务文件、自动化提示词和跨项目模板。 |
| [contracts/](./contracts/) | 合同入口索引，指向 `docs/contracts/` 下的权威规格。 |
| [standards/](./standards/) | 可复用标准体系，包含评分、智能化、文档治理和验证门禁。 |

## 当前能力重心

当前产品形态建议按下面优先级理解：

1. 自然语言编排和 workflow draft
2. 文档处理和文档任务执行
3. 工作流执行
4. 安全、trace、验证与恢复
5. 可扩展 Agent CLI 注册
6. 编排、委托与任务拆解
7. 基础交互式 CLI 回复
8. 本地服务与集成层

## 当前文档规则

- 面向用户的说明，应该先从能力讲起，而不是从迁移理论讲起。
- contracts 仍然重要，但不应该成为新读者看到的第一批文档。
- 一个功能可能只存在于代码里、只存在于 contracts 里，或者两边都有，文档里必须写清楚。
- `Current Implementation`、`Partial Implementation`、`Target Design` 不能混写。

## 文档区域职责

| 区域 | 职责 |
|------|------|
| [standards/](./standards/) | 可复用标准体系：质量评分、智能化原则、文档治理、验证门禁。 |
| [contracts/](./contracts/) | 权威合同规格：CLI、run-task、trace、recovery、security、workflow、storage、performance 等字段级规则。 |
| [design/](./design/) | 目标设计、迁移设计和架构方案，不承载最终字段级合同。 |
| [ui/](./ui/) | VS Code 和 UI 交互流程说明。 |
| 根级文档 | 入口、用户手册、架构总览、能力地图、开发、测试、发布和排障。 |



## 次级参考区域

### 产品和执行参考

- [NL Workflow Orchestrator 产品入口](./nl-workflow-orchestrator.md)
- [Agent 执行系统](./agent-execution.md)
- [Workflow 规格](./workflow-spec.md)
- [配置手册](./configuration.md)
- [排障手册](./troubleshooting.md)

### 维护参考

- [开发者指南](./development.md)
- [开发队列](./development-backlog.md)
- [开发队列详情](./backlog/)
- [测试指南](./testing.md)
- [发布指南](./release.md)
- [Agent 操作规范](./agent-operating-guide.md)

### 设计与迁移参考

#### 架构设计

- [design/](./design/)
- [NL Workflow Orchestrator 产品设计](./design/nl-workflow-orchestrator-product-design.md)
- [Hybrid AI NL Engine 设计](./design/hybrid-ai-nl-engine.md)
- [模块范围整理建议](./design/module-scope-cleanup.md)
- [Agent CLI 注册与 Runtime 架构设计](./design/agent-cli-runtime-architecture.md)
- [编排、委托与任务拆解架构设计](./design/orchestration-and-delegation-architecture.md)
- [安全、Trace、执行记录与恢复架构设计](./design/safety-trace-recovery-architecture.md)
- [工作流引擎架构设计](./design/workflow-engine-architecture.md)
- [文档处理架构设计](./design/document-processing-architecture.md)

#### 规格与参考

- [contracts/](./contracts/)
- [编排计划合同](./contracts/orchestration-plan.md)
- [Workflow Draft 合同](./contracts/workflow-draft.md)
- [standards/](./standards/)
- [语义验收标准](./standards/semantic-acceptance.md)
