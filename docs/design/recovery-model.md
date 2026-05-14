# 恢复模型设计

## 背景

文档任务失败后，用户需要知道能否重试、是否需要人工处理、是否因为需求变化而不能恢复。实际插件已注册 `vectahubTasks.recoverDocTask`，CLI 侧有 `recover-task` 命令，恢复链路基于最近运行记录、失败分类、trace 和 instruction hash。

## 目标

- 恢复前先做确定性判断。
- 能区分直接重试、建议修复、阻断和取消。
- 需求变化时阻止错误恢复。
- 恢复过程产生新的 trace，并关联原始 trace。

## 非目标

- 不自动生成修复方案并静默执行。
- 不绕过高风险命令确认。
- 不在 hash 不可用时假装需求未变。

## 方案

恢复输入来自最近失败的 task run record：

```text
latest run record
  + current instruction hash
  + failure kind
  + traceId
  + selected Agent CLI
  + selected doc path
  -> recovery decision
```

插件先本地决策：

- `blocked`：弹出阻断说明。
- `suggest_fix`：展示建议，不自动执行。
- `retry_direct`：需要时弹窗确认，然后调用 CLI `recover-task --json`。

## 取舍

| 方案 | 结论 | 原因 |
|------|------|------|
| 失败后直接重跑 | 放弃 | 可能在需求变化或冲突状态下误执行。 |
| 全部交给 Agent 判断 | 放弃 | 状态来源不可靠。 |
| VectaHub 根据记录和 hash 做恢复决策 | 采用 | 可审计、可阻断、可解释。 |

## 风险

- authoritative hash 不可用会增加人工路径，但比误恢复安全。
- 旧记录字段不足时不能可靠恢复。
- 插件 UI 当前主要通过弹窗和任务状态表达恢复结果，复杂时间线仍是后续设计目标。

## 验证方式

- 失败状态不可恢复时不调用 CLI。
- `retry_direct` 在需要确认时必须弹窗。
- 恢复调用带上 source run、task id、trace、failure kind 和 hash 参数。
- 恢复成功后写入新的运行记录和恢复记录。

## 相关文档

- [恢复闭环规格](../specs/recovery-loop.md)
- [恢复操作文档](../ui/recovery-workflow.md)
