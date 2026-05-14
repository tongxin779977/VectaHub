# 权限确认与风险提示

## 目标

高风险命令不能静默执行。插件需要在执行前展示确认弹窗，让用户明确选择继续或取消。

## 当前行为

插件侧 `confirmHighRiskCommand` 会对 `high` 和 `critical` 风险显示 VS Code modal 警告框，内容包括：

- 任务名。
- 触发规则。
- 风险原因。
- 建议说明。

用户可选择：

- `确认执行`
- `取消`

## 风险等级

风险等级来自结构化评估：

```ts
type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';
```

## UI 要求

- 风险提示必须是阻塞式确认。
- 弹窗只展示摘要，不展示敏感原文。
- 取消后任务不能继续执行高风险命令。
- `critical` 的默认策略应更保守；是否允许继续由安全规格和实现共同约束。

## 相关文档

- [安全与权限闭环规格](../specs/security-permission-loop.md)
- [插件/CLI 边界设计](../design/plugin-cli-boundary.md)
