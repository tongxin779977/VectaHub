# 合同单一事实源设计

## 背景

文档任务合同涉及文档片段、允许修改文件、禁止修改文件、验证命令、并发判定和 instruction hash。若 CLI 和插件各自维护规则，长期会产生漂移。

当前仓库已有共享包：

```text
packages/doc-task-contract-core/
```

包名为 `@vectahub/doc-task-contract-core`，已暴露 `computeInstructionHash`、`buildGlobalConfigDigest`、`deriveDocExcerptFromText`、`deriveAgentTaskBoundary`、`deriveValidationCommands`、`decideAgentTaskConcurrency` 等纯函数。

## 目标

- 合同推导规则收敛到共享包。
- 插件不复制 CLI 的合同纯函数规则。
- `instructionHash` 的计算因子保持对称。
- authoritative digest/hash 不可用时保守降级。

## 非目标

- 不在文档中重新定义一份与代码分离的完整算法。
- 不要求 UI 直接展示全部合同字段。
- 不把 guessed digest 当作权威来源。

## 方案

当前以共享包作为合同纯函数事实源：

```text
@vectahub/doc-task-contract-core
  -> doc excerpt
  -> file boundary
  -> validation commands
  -> instruction hash
  -> concurrency decision
```

CLI 和插件均消费共享包。需要访问 CLI 配置或运行态信息时，由 CLI 提供结构化预览命令，插件消费 JSON 结果。

## 当前实现状态

已完成 A1/A2 收敛：

- 新增 `@vectahub/doc-task-contract-core` 共享纯函数模块。
- CLI `src/commands/agent-task-contract.ts` 保持原导出签名，并消费共享模块。
- 插件 `docTaskContract.ts` 和 `docTaskRunStore.ts` 消费同一共享模块。
- authoritative digest unavailable 时保持保守降级：恢复 hash guard 阻断，状态刷新不做 drift reset。
- 公开 JSON 协议未改变。

已验证：

```bash
npm test --workspace packages/vectahub-vscode-extension -- --run
npm run typecheck
```

## 取舍

| 方案 | 结论 | 原因 |
|------|------|------|
| CLI 和插件各自实现 | 放弃 | 新规则容易双端漂移。 |
| 所有逻辑只放 CLI | 部分采用 | 能统一运行态，但插件预检会增加子进程成本。 |
| 纯函数放共享包，运行态由 CLI 输出 | 采用 | 兼顾一致性、可测试性和插件性能。 |

## 风险

- 共享包只能承载无副作用纯函数，不能读取用户配置或工作区状态。
- CLI 仍需为运行态 digest 提供权威来源。
- 旧记录缺少完整 hash 因子时必须失效或保守阻断。

## 验证方式

- 共享包测试覆盖 excerpt、文件边界、验证命令和 hash。
- CLI 与插件对同一文档任务得到一致合同摘要。
- hash unavailable 时不触发误 reset。

## 相关文档

- [Agent Worker 合同规格](../specs/agent-worker-contract.md)
- [插件/CLI 边界设计](./plugin-cli-boundary.md)
