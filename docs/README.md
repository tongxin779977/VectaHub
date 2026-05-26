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
| [archive.md](./archive.md) | 当前主文档、重叠文档、历史文档和清理候选说明。 |

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

## 这轮重组改了什么

- 顶层入口不再把 VectaHub 描述成泛化控制面，而是强调它是重执行能力的 CLI 内核。
- 能力文档现在是主要导航层。
- 旧设计文档和迁移文档仍然保留，但不再是主入口。
- 清理策略比较保守：先降级重叠文档的角色，再讨论删除。

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

- [design/](./design/)
- [Agent CLI 注册与 Runtime 架构设计](./design/agent-cli-runtime-architecture.md)
- [编排、委托与任务拆解架构设计](./design/orchestration-and-delegation-architecture.md)
- [安全、Trace、执行记录与恢复架构设计](./design/safety-trace-recovery-architecture.md)
- [本地服务与集成层架构设计](./design/local-service-integration-architecture.md)
- [工作流引擎架构设计](./design/workflow-engine-architecture.md)
- [文档处理架构设计](./design/document-processing-architecture.md)
- [specs/](./specs/)
- [default-context-migration-summary.md](./default-context-migration-summary.md)
- [engineering-quality-audit.md](./engineering-quality-audit.md)

## 当前清理状态

这个仓库里仍然有不少重叠材料，主要集中在：

- orchestration 和 control-plane 的措辞冲突，
- agent execution 和 run-task specs 的内容重叠，
- command surface 和 usage guidance 的内容重叠，
- architecture 和 design 文档的边界重叠。

当前清理策略是：

1. 先定义主文档入口，
2. 再把重叠文档降级成参考角色，
3. 再收敛重复解释，
4. 最后才讨论删除或归档移动。
