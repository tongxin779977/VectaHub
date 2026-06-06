# 文档任务操作流程

本文档描述文档任务的用户操作路径。通用 UI 规则以 [VS Code 插件 UI 逻辑设计](../design/vscode-ui-logic.md) 为准。

## 目标

用户从 VS Code 插件中选择开发文档，让 VectaHub 解析任务，并通过选定 Agent CLI 执行单个或全部任务。

## 操作路径

1. 打开 VectaHub 任务面板。
2. 在“文档任务”中选择文档文件。
3. 点击“解析文档任务”。
4. 解析完成后，任务以 `id + label` 列表展示。
5. 插件展示当前可执行的 Agent 候选，并尽量自动收敛内部状态。
6. 点击单个任务执行，或点击“启动全部任务”批量执行。

## Agent 选择规则

- 用户选择的是“当前可执行的 Agent”，不是“内部配置是否完整的 Agent”。
- 已安装、可调用、任务入口 ready 的 Agent 应优先作为候选展示。
- 这里的 `ready` 是执行前预检结论，不是“任务必定成功”的承诺；下游 Agent 自身的沙箱、approval policy、插件同步或本地命令权限仍可能在启动后失败。
- 如果插件已确认 Agent 可运行，不应因为内部配置态尚未同步而把它隐藏。
- 内部配置态的修正应优先由插件自动完成，而不是要求用户先做额外启用或授权操作。
- 只有真实外部前置条件缺失时，才提示用户安装、登录或修复 CLI。

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

这些状态用于帮助用户继续下一步操作，不用于暴露内部字段或配置位。

## 批量执行

默认串行执行。只有在任务边界可判断且文件范围不冲突时，才允许更高并发。当前配置 `vectahubTasks.maxConcurrentTasks` 默认值为 `1`。

## 输出边界

- UI 展示任务状态和摘要。
- 完整输出不应常驻 UI 状态。
- 运行详情应通过 task run record、trace 或输出面板定位。
- 内部扫描状态、配置同步细节和合同缓存不应成为主 UI 文案。

## 相关文档

- [VS Code 插件 UI 逻辑设计](../design/vscode-ui-logic.md)
- [Agent Worker 合同规格](../contracts/agent-worker-contract.md)
- [文档任务状态机规格](../contracts/doc-task-state-machine.md)
