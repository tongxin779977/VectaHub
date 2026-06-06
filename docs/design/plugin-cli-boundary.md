# 插件与 CLI 边界设计

## 背景

VS Code 插件提供任务面板、高级选项、文档任务和恢复入口。CLI 提供 `doctor`、`run`、`parse-doc`、`run-task`、`trace`、`recover-task` 等命令。两端必须协作，但不能复制同一业务逻辑。

## 目标

- 插件负责 UI、用户确认、状态展示和调用 CLI。
- CLI 负责执行、JSON 协议、任务运行、trace 查询和恢复命令。
- 共享包负责纯函数合同推导。
- 插件消费结构化结果，不解析人类日志。

## 非目标

- 插件不直接执行 Agent 任务核心逻辑。
- 插件不维护一份长期独立的合同推导规则。
- CLI 不负责 VS Code 视图状态和交互细节。

## 方案

```text
VS Code UI
  -> runCli([...], --json)
  -> CLI command
  -> structured result
  -> task view / output channel / status bar
```

插件可以在本地执行轻量预检、风险确认和 UI 状态更新。涉及运行态配置、任务执行、恢复、trace 查询时，应通过 CLI JSON 或共享包完成。

## 实际入口

当前插件注册了两类视图：

- `vectahubTasks.tasksView`：任务面板。
- `vectahubTasks.advancedView`：高级选项。

当前插件配置包括：

- `vectahubTasks.cliPath`
- `vectahubTasks.executionMode`
- `vectahubTasks.previewBeforeRun`
- `vectahubTasks.autoDetectCli`
- `vectahubTasks.maxConcurrentTasks`

## 验证方式

- 插件自动检测 CLI 后运行 `doctor --json`。
- 高级视图中的工具、安全、工作流动作都通过 CLI adapter 调用。
- 文档任务执行和恢复使用结构化 CLI 结果更新状态。
- `--json` 输出不得混入 trace 或人类日志。

## 相关文档

- [合同单一事实源设计](./contract-single-source.md)
- [VS Code 插件 UI](../ui/vscode-extension.md)
