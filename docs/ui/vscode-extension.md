# VS Code 插件 UI

## 入口

插件在 Activity Bar 中注册 `VectaHub` 容器，包含两个视图：

- `任务面板`
- `高级选项`

插件激活后会初始化输出面板、状态栏、CLI adapter，并在开启自动检测时查找 CLI。CLI ready 后会运行 `doctor --json` 做初始诊断。

## 任务面板

任务面板按类别展示项目动作：

| 区域 | 作用 |
|------|------|
| 一键开发 | 展示 `dev`、`start`、`serve` 等长驻任务，并支持停止运行中任务。 |
| 质量检查 | 展示 `test`、`build`、`lint`、`typecheck`、`check`、`validate`、`format` 等任务。 |
| Git/CI | 展示仓库、CI 或诊断队列相关动作。 |
| 文档任务 | 选择文档、解析任务、单任务执行、批量执行、选择 Agent CLI。 |
| 其他脚本 | 折叠展示其他项目脚本。 |
| 最近失败 | 折叠展示近期失败任务。 |

## 高级选项

高级选项包含：

| 区域 | 动作 |
|------|------|
| 工作流 | 打开当前工作流、预览当前工作流。 |
| 工具管理 | 查看已注册工具。 |
| 安全检测 | 测试选中文本或命令。 |
| 设置与引导 | 打开插件设置、安装 CLI、配置 LLM、运行 Doctor。 |

## 配置项

插件当前暴露这些设置：

| 设置 | 默认值 | 用途 |
|------|--------|------|
| `vectahubTasks.cliPath` | `vectahub` | CLI 可执行文件路径。 |
| `vectahubTasks.executionMode` | `strict` | 默认执行模式：`strict`、`relaxed`、`consensus`。 |
| `vectahubTasks.previewBeforeRun` | `true` | 执行前是否强制预览。 |
| `vectahubTasks.autoDetectCli` | `true` | 插件激活后是否自动检测 CLI。 |
| `vectahubTasks.maxConcurrentTasks` | `1` | 批量执行文档任务最大并发数，默认串行。 |

## UI 边界

- UI 只展示状态和摘要，不展示完整大日志。
- UI 需要执行核心任务时应调用 CLI 或共享合同，不复制执行逻辑。
- 未实现的复杂 trace 时间线和恢复向导不能写成已完成能力。

## 相关文档

- [文档任务操作流程](./task-run-workflow.md)
- [恢复操作流程](./recovery-workflow.md)
- [权限确认](./permission-prompts.md)
