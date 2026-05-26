# 文档清理与归档说明

## 目的

本文说明这套文档将如何在不丢失实现细节、合同细节和迁移信息的前提下进行清理。

当前策略比较保守：

1. 先定义主文档，
2. 再按角色标记重叠文档，
3. 再收敛重复解释，
4. 最后才提删除或归档移动。

## 主文档

下面这些文档现在是主入口：

- [../README.md](../README.md)
- [README.md](./README.md)
- [capabilities.md](./capabilities.md)
- [capabilities-reference.md](./capabilities-reference.md)
- [usage.md](./usage.md)
- [architecture.md](./architecture.md)

## 当前文档角色模型

每份文档都应该按下面这些角色之一来理解：

| Role | Meaning |
|------|------|
| Primary Entry | 用户或维护者最优先阅读的入口文档。 |
| Current Reference | 当前仍与代码现实较好对应的指南或参考文档。 |
| Contract Source | 定义字段级行为或迁移边界的 spec / 合同文档。 |
| Design Reference | 用于解释设计思路的文档，但默认不能当作当前实现声明。 |
| Historical / Audit Reference | 对背景或评审有用，但不是当前产品入口。 |

## 当前要消减的重叠区域

目前最大的重叠主要在这些地方：

| Overlap area | Primary destination |
|------|------|
| Product positioning | `README.md`, `docs/README.md`, `docs/capabilities.md` |
| Feature inventory | `docs/capabilities-reference.md` |
| Operator command guidance | `docs/usage.md` |
| Current system shape | `docs/architecture.md` |
| Field-level execution and protocol detail | `docs/specs/` |
| Design intent and migration reasoning | `docs/design/` 和部分迁移文档 |

## 仍然重要的文档

### 合同与 spec 真相源

下面这些文档仍然重要，不应该轻易删除：

- [specs/agent-worker-contract.md](./specs/agent-worker-contract.md)
- [specs/run-task-execution-contract.md](./specs/run-task-execution-contract.md)
- [specs/cli-command-surface.md](./specs/cli-command-surface.md)
- [specs/config-data-storage.md](./specs/config-data-storage.md)
- [specs/workflow-lifecycle.md](./specs/workflow-lifecycle.md)
- [specs/security-permission-loop.md](./specs/security-permission-loop.md)
- [specs/verification-loop.md](./specs/verification-loop.md)
- [specs/recovery-loop.md](./specs/recovery-loop.md)
- [specs/trace-execution.md](./specs/trace-execution.md)

### 设计与迁移参考

下面这些文档仍然有价值，但对大多数读者来说，它们不再应该是第一站：

- [design/agent-execution-system.md](./design/agent-execution-system.md)
- [design/agent-cli-adapter-architecture.md](./design/agent-cli-adapter-architecture.md)
- [default-context-migration-summary.md](./default-context-migration-summary.md)
- [engineering-quality-audit.md](./engineering-quality-audit.md)

## 清理原则

当前清理原则是：

- 只要 spec 仍在描述真实合同或活跃迁移边界，就保留，
- 只要设计文档仍能解释当前架构选择，就保留，
- 避免把同一能力说明复制到多个入口文档里，
- 避免把设计目标写成已经完成的功能，
- 在有用内容被吸收或明确被替代之前，不轻易删除文档。

## 候选清理类别

下面这些文档类别更适合未来做合并，而不是现在立刻删除：

- 多个顶层文档里重复出现的产品定位描述，
- 与 `usage.md` 或 `specs/cli-command-surface.md` 冲突的命令摘要，
- 夸大当前多 agent 成熟度的重复编排描述，
- 与当前单用户 CLI 定位不一致的 `control plane` 语言。

## 这轮重组不做什么

这轮清理不会：

- 默认删除 spec 文档，
- 立刻重写所有 design 文档，
- 假装所有旧措辞已经统一，
- 把 `current implementation` 和 `target design` 混成一套叙事。

## 下一步清理动作

等新的入口文档和能力文档稳定后，下一步最安全的动作是出一份逐文件重叠矩阵，把具体文档标成：

- keep as primary，
- keep as current reference，
- keep as design reference，
- merge later，
- delete candidate。
