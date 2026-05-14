# Trace 查看

## 目标

Trace 用于回答任务执行在哪个阶段失败、CLI 与插件如何关联、恢复是否基于原始失败记录。

## 当前 CLI 能力

CLI 提供：

```bash
vectahub trace list
vectahub trace list --json
vectahub trace show <traceId>
vectahub trace show <traceId> --json
```

`trace list` 展示最近 trace 摘要，包括 span 数、失败数、耗时和最近时间。`trace show` 展示指定 trace 的 span 列表。

## UI 现状

当前插件已在执行和恢复链路中传递 trace context，并把运行记录关联到 trace。复杂 trace 图形化视图仍是设计目标，不应描述为已完成。

## 展示原则

- UI 展示 traceId、失败摘要和定位入口。
- 大量 span 或完整日志不应直接塞进任务树。
- JSON 输出保持给机器调用；人类查看可以使用输出面板或 CLI 文本输出。

## 相关文档

- [Trace 执行规格](../specs/trace-execution.md)
- [恢复操作流程](./recovery-workflow.md)
