# VectaHub 文档索引

VectaHub 是一个单用户、本地优先的 CLI 自动化内核，核心能力是自然语言编排、文档任务执行、结构化 workflow、安全治理、Agent CLI runtime、trace、验证和恢复。

本文档索引只负责导航。能力细节以对应合同、标准、源码和测试为准。

## 推荐阅读路径

1. [仓库首页](../README.md)
2. [CLI 使用手册](./usage.md)
3. [能力地图](./capabilities.md)
4. [能力明细](./capabilities-reference.md)
5. [架构总览](./architecture.md)
6. [仓库可见性与提交权限](./repository-permissions.md)

## 面向用户

- [CLI 使用手册](./usage.md)
- [配置手册](./configuration.md)
- [Workflow 规格](./workflow-spec.md)
- [排障手册](./troubleshooting.md)

## 面向维护者

- [架构总览](./architecture.md)
- [开发者指南](./development.md)
- [测试指南](./testing.md)
- [发布指南](./release.md)
- [仓库可见性与提交权限](./repository-permissions.md)
- [Agent 操作规范](./agent-operating-guide.md)

## 能力与产品边界

- [NL Workflow Orchestrator 产品入口](./nl-workflow-orchestrator.md)
- [能力地图](./capabilities.md)
- [能力明细](./capabilities-reference.md)
- [开发队列入口](./development-backlog.md)
- [开发队列详情](./backlog/)

## 合同、标准和设计

| 区域 | 职责 |
|------|------|
| [contracts/](./contracts/) | 字段、状态机、协议、存储、trace、恢复、安全和生命周期合同。 |
| [standards/](./standards/) | 文档治理、验证门禁、质量评分、智能系统和语义验收标准。 |
| [design/](./design/) | 架构设计、迁移方案、目标设计和产品决策记录。 |
| [ui/](./ui/) | VS Code extension 和 UI 工作流说明。 |

## 文档状态规则

- `Current Implementation`：已有源码入口和验证路径。
- `Partial Implementation`：已有部分实现，但覆盖、合同闭环或 UI/运行时集成不完整。
- `Target Design`：目标方案，不能写成当前可用能力。
- `Migration Contract`：迁移期间必须遵守的过渡合同。
- `Historical Reference`：历史参考，不应作为当前行为依据。

新增或重写文档时，优先复用这些状态词，并避免在用户入口文档里宣传未落地能力。

## 提交安全

本仓库是公开仓库。不要提交 secrets、私有任务文档、真实用户数据、未脱敏日志、完整 trace、`.vectahub/`、Agent home 或本地构建产物。

详细规则见 [仓库可见性与提交权限](./repository-permissions.md)。
