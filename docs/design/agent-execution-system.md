# Agent 执行系统设计

## 背景

VectaHub 的目标不是替代 Agent，而是把 Agent 放进可控执行链路。实际代码中已经存在 CLI 命令、VS Code 插件、文档任务运行记录、trace、恢复命令和共享合同包。

## 目标

- 将 Agent 定位为 Worker，只执行边界清楚的小任务。
- VectaHub 负责合同、状态、trace、安全、验证和恢复。
- 插件和 CLI 对任务成功、失败、恢复使用同一套结构化状态。
- Agent 成功后仍必须进入验证阶段。

## 非目标

- 不让 Agent 直接决定系统状态。
- 不把完整文档、完整 trace、完整输出长期塞给 Agent。
- 不在当前设计中引入数据库、多租户权限或服务端控制面。
- 不把历史 Go/REST/gRPC 蓝图作为当前实现目标。

## 方案

核心链路：

```text
Document / Natural Language
  -> Parse Task
  -> Build AgentTaskContract
  -> Security Preflight
  -> Run Agent
  -> Collect Changes
  -> Run Verification
  -> Persist TaskRun
  -> Recovery / Resume
```

每个阶段只输出结构化摘要。大输出、敏感输出和完整文档内容不能成为跨层协议。

## 取舍

| 方案 | 结论 | 原因 |
|------|------|------|
| Agent 自由读取整份文档 | 放弃 | 任务边界不清，失败后无法归因。 |
| VectaHub 只做 CLI 包装 | 放弃 | 无法解决状态、验证和恢复问题。 |
| VectaHub 掌控状态，Agent 执行任务 | 采用 | 能把风险控制、trace 和验证闭环放到系统层。 |

## 验证方式

- `run-task` 返回结构化结果和合同摘要。
- task run record 能保存状态、失败分类、traceId 和验证摘要。
- 插件任务状态不依赖 Agent 自述。
- 恢复入口能基于最近失败记录和 hash guard 做确定性判断。

## 相关文档

- [Agent Worker 合同规格](../specs/agent-worker-contract.md)
- [文档任务状态机规格](../specs/doc-task-state-machine.md)
- [恢复模型设计](./recovery-model.md)
