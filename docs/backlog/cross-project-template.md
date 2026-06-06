# Cross-Project Backlog Template

> Document Status: Reusable Template Guidance
> Authority: Rules for adapting this backlog structure to another project.
> Protocol: [protocol.md](./protocol.md)

## Cross-Project Reuse Rules

要把本文用于其他项目，应保留以下结构：

- 事实依据表。
- 证据等级。
- 使用规则。
- 多 subagent 协作规则。
- 工程标准。
- 状态模型。
- 优先级规则。
- 任务字段规范。
- 自动化执行协议。

迁移时必须替换：

- `source_docs` 和 `required_contracts`。
- 源码路径证据。
- verification 命令。
- 产品主链路名称。
- P4 secondary 能力列表。

不得直接复用：

- 本项目特有命令名，除非目标项目确实存在。
- 本项目特有 Agent runtime，除非目标项目已经实现。
- 本项目的安全结论，除非目标项目有等价安全合同和测试。
