# 恢复操作流程

## 目标

当文档任务失败后，用户可以基于最近运行记录触发恢复。恢复必须先判断是否安全，不能直接重跑。

## 当前入口

插件注册了 `vectahubTasks.recoverDocTask` 命令。该命令从最近失败的运行记录构造恢复输入，并在可直接重试时调用 CLI `recover-task --json`。

## 恢复决策

恢复决策包括：

| 决策 | UI 行为 |
|------|---------|
| `blocked` | 弹出阻断说明和建议动作，不执行 CLI 重试。 |
| `suggest_fix` | 展示恢复建议，不自动执行修复任务。 |
| `retry_direct` | 需要时弹窗确认，确认后调用 CLI 恢复。 |

## 恢复前检查

恢复前需要确认：

- 最近运行记录存在。
- 当前状态属于可恢复失败状态。
- 当前任务说明和历史记录没有发生不可接受漂移。
- authoritative instruction hash 可用，或按安全策略保守阻断。
- 已选择 Agent CLI 执行器。

## Trace 关联

恢复会创建新的 trace，并把 source run、source trace、failure kind 等摘要写入恢复记录。恢复 trace 用于定位二次执行过程，不能覆盖原始 trace。

## 未完成能力

复杂的可视化恢复时间线不是当前已实现 UI。当前主要通过任务状态、弹窗、输出面板和运行记录表达恢复结果。

## 相关文档

- [恢复模型设计](../design/recovery-model.md)
- [恢复闭环规格](../specs/recovery-loop.md)
