# UI 文档索引

> Document Status: Current UI Reference Index
> Authority: VS Code 和 UI 交互流程说明入口。CLI 字段级合同以 `docs/contracts/` 为准。
> Last Verified: 2026-05-31

## 文档列表

| 文档 | 职责 |
|------|------|
| [VS Code Extension](./vscode-extension.md) | VS Code 插件整体行为和集成说明。 |
| [Task Run Workflow](./task-run-workflow.md) | 任务运行流程、状态展示和用户交互。 |
| [Project Task Workflows](./project-task-workflows.md) | 项目任务视图和任务操作流程。 |
| [Permission Prompts](./permission-prompts.md) | 权限确认、风险提示和阻断交互。 |
| [Recovery Workflow](./recovery-workflow.md) | 失败恢复、重试和人工处理流程。 |
| [Trace View](./trace-view.md) | trace 展示、定位和执行链路查看。 |

## 边界

UI 不应复制 CLI 的执行真相。VS Code 和其他 UI 入口应消费 CLI JSON、共享合同或明确的机器接口。

如果 UI 文档描述了未实现能力，必须标注为目标设计或迁移合同。
