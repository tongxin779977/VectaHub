# 文档任务操作流程

## 目标

用户从 VS Code 插件中选择开发文档，让 VectaHub 解析任务，并通过选定 Agent CLI 执行单个或全部任务。

## 操作路径

1. 打开 VectaHub 任务面板。
2. 在“文档任务”中选择文档文件。
3. 点击“解析文档任务”。
4. 解析完成后，任务以 `id + label` 列表展示。
5. 选择 Agent CLI 执行器。
6. 点击单个任务执行，或点击“启动全部任务”批量执行。

## 状态展示

插件使用较粗的展示状态，内部运行记录保留更细状态：

| 展示状态 | 含义 |
|----------|------|
| pending / ready | 等待执行。 |
| preflight | 执行前检查。 |
| running | 正在执行。 |
| changed | 已产生变更。 |
| success | 执行成功。 |
| failed | 失败，需查看失败分类。 |
| cancelled | 已取消。 |
| needs-confirmation | 需要用户确认。 |

## 批量执行

默认串行执行。只有在任务边界可判断且文件范围不冲突时，才允许更高并发。当前配置 `vectahubTasks.maxConcurrentTasks` 默认值为 `1`。

## 输出边界

- UI 展示任务状态和摘要。
- 完整输出不应常驻 UI 状态。
- 运行详情应通过 task run record、trace 或输出面板定位。

## 相关文档

- [Agent Worker 合同规格](../specs/agent-worker-contract.md)
- [文档任务状态机规格](../specs/doc-task-state-machine.md)
