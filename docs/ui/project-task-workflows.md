# 项目任务 UI 工作流

## 目标

本文档覆盖 VS Code 插件中非文档任务的 UI：一键开发、质量检查、Git/CI、诊断队列、长驻任务和一键验证。

## 任务发现

插件通过当前活动编辑器或第一个 workspace folder 定位项目根目录，然后：

- 如果存在 `.git`，添加 `Git 状态 (Status)`。
- 如果存在 `package.json`，按包管理器和 scripts 推导项目任务。
- 总是添加 `环境检查 (Doctor)`。

任务类型包括：

```text
git-status
install
test
build
lint
typecheck
dev
start
serve
preview
watch
format
coverage
storybook
check
validate
doctor
other
```

## 一键开发

`dev`、`start`、`serve`、`preview`、`watch` 被视为长驻任务。用户点击后：

- 若未运行，则启动并显示通知。
- 若已运行，则可查看输出、重启或停止。
- 停止操作通过长驻任务管理器处理。

## 质量检查

质量检查区域展示 `test`、`build`、`lint`、`typecheck`、`check`、`validate`、`format`、`coverage`、`storybook` 等任务。

`一键验证全部` 会根据当前可用任务构建验证链，顺序执行。没有可执行验证任务时显示提示；失败或取消会写入最近任务记录。

## Git/CI 和诊断队列

诊断队列支持：

- 批量处理待处理任务。
- 删除单个队列任务。
- 清空队列。

批量处理会先读取队列，确认待处理数量，再调用：

```bash
vectahub run -f sys:process-diagnostic-queue --mode relaxed --json
```

处理完成后，插件根据 CLI summary 或队列快照统计已处理、失败、剩余和待确认数量。

## 队列读取失败

队列读取失败时，插件会提供重试。如果重试仍失败且 CLI ready，会尝试通过 `vectahub run --json` 请求诊断原因，并把分析写入输出面板。

## 最近失败

插件维护最近任务记录，用于展示失败任务和一键验证/队列处理的结果摘要。该记录是 UI 辅助状态，不替代 CLI 执行记录或文档任务 run record。

## UI 边界

- 项目任务 UI 负责发现和触发任务，不替代 CLI 安全策略。
- 长驻任务输出应进入输出面板，不应塞入任务树。
- 队列删除和清空是破坏性操作，必须确认。

## 相关文档

- [VS Code 插件 UI](./vscode-extension.md)
- [配置与数据存储规格](../specs/config-data-storage.md)
