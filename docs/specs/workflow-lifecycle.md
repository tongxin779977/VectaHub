# 工作流生命周期规格

## 目标

本文档覆盖普通 workflow 的保存、执行、历史、详情、重跑、恢复、版本和归档。文档任务的 Agent 执行链路见 [Agent Worker 合同规格](./agent-worker-contract.md)。

## 创建和执行

工作流可以来自：

- 自然语言输入：`vectahub run "..."`。
- YAML/JSON 文件：`vectahub run --file <file>`。
- 系统工作流：`vectahub run -f sys:<name>` 或代码中定义的系统工作流 key。

`run` 支持：

- `--dry-run`：只展示计划，不执行命令。
- `--json`：输出结构化结果。
- `--mode strict|relaxed|consensus`：执行模式。
- `--save`：执行后保存 workflow。
- `--variable <key=value>`：传递初始变量。

## 保存和列表

保存后的 workflow 写入 `VECTAHUB_HOME/workflows/`，文件格式为 YAML 或 JSON。

相关命令：

```bash
vectahub list
vectahub list versions <workflowId>
vectahub rollback <workflowId> <version>
vectahub rollback <workflowId> <version> --output <file>
```

## 执行历史

执行历史通过 `history` 查询：

```bash
vectahub history
vectahub history --status FAILED
vectahub history --workflow <workflowId>
vectahub history --query <text>
vectahub history --verbose
```

历史记录按时间倒序展示。搜索由 record manager 在执行记录中匹配 execution id、workflow id、workflow name、错误、触发者和 metadata。

## 执行详情

```bash
vectahub detail <executionId>
vectahub detail <executionId> --step <index>
```

详情展示 workflow、状态、时间、耗时、触发来源和步骤。单步详情会展示命令、状态、退出码、输出摘要和错误。

## 重跑和恢复

```bash
vectahub rerun <executionId>
vectahub rerun <executionId> --mode strict
vectahub resume <executionId>
vectahub resume <executionId> --from-step <index>
```

`rerun` 根据历史执行记录找到 workflow 并重新执行。`resume` 只适用于存在失败步骤或整体状态为 `PAUSED` 的执行，默认从第一个失败步骤恢复。

## 归档

```bash
vectahub archive --before 2026-01-01
vectahub archive --list
vectahub archive --restore <archiveId>
vectahub archive --delete <archiveId>
```

归档用于压缩旧执行记录，恢复和删除操作会修改归档/执行记录数据。调用前应确认目标 archive id。

## 输出分离

执行记录中的大 stdout 会写入 `VECTAHUB_HOME/outputs/<executionId>/<stepId>.stdout`，记录中保留 `outputRef` 和 `outputSummary`。读取详情时，系统会尝试按引用还原输出。

## 失败边界

- workflow 文件加载失败时 `run` 返回错误。
- `resume` 找不到失败或暂停步骤时不会执行。
- `rerun` 找不到 workflow 时不会执行。
- 输出文件缺失时回退到 summary，不应导致整个记录不可读。
