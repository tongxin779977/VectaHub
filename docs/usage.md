# CLI 使用手册

本文面向 VectaHub CLI 用户，说明常见命令和推荐使用路径。命令面的完整实现规格见 [CLI 命令面规格](./specs/cli-command-surface.md)。

> Document Status: Current Reference
> Authority: User-facing command guide. For exact field-level or migration-level behavior, read the linked specs and current command source.
> Recommended Read Order: [Capability Map](./capabilities.md) -> [Capability Reference](./capabilities-reference.md) -> 本文

## 基础命令

查看版本：

```bash
vectahub --version
vectahub version
vectahub version --json
```

从自然语言生成并执行工作流：

```bash
vectahub run "查看 Git 状态"
```

默认会直接执行临时 workflow，不会自动保存到工作流库。需要复用时再显式加 `--save`：

```bash
vectahub run --save "查看 Git 状态"
```

从 YAML 或 JSON 文件执行工作流：

```bash
vectahub run --file ./workflow.yaml
```

直接执行明确命令并经过安全扫描：

```bash
vectahub run-command -- npm test
```

进入交互式聊天：

```bash
vectahub chat
```

运行诊断：

```bash
vectahub doctor
vectahub doctor --json
```

## 预览模式

优先用 `--dry-run` 查看计划，确认后再执行真实命令。

```bash
vectahub run --dry-run "删除 node_modules"
vectahub run-command --dry-run -- rm -rf node_modules
```

`run-task` 还有更早的合同预览分支：

```bash
vectahub run-task --task-id T1 --task-label "补测试" --doc ./docs/task.md --contract-preview --json
```

`--contract-preview` 只生成任务边界合同摘要，不要求 `--tool`，不加载 LLM，不执行 Agent。

## JSON 输出

面向脚本、插件或自动化时使用 `--json`。支持 JSON 的命令必须保持 stdout 为纯 JSON，普通日志、trace 和调试信息不能混入 stdout。

```bash
vectahub run --json "查看 Git 状态"
vectahub run-command --json -- npm test
vectahub tools agents --json
vectahub trace list --json
```

如果 JSON 消费方解析失败，优先确认是否混入了非 JSON 输出，再参考 [排障手册](./troubleshooting.md)。

## 工作流执行记录

查看保存的工作流：

```bash
vectahub list
vectahub list versions <workflowId>
```

查看执行历史和详情：

```bash
vectahub history
vectahub history --status FAILED
vectahub detail <executionId>
vectahub detail <executionId> --step <index>
```

重跑或恢复执行：

```bash
vectahub rerun <executionId>
vectahub resume <executionId>
vectahub resume <executionId> --from-step <index>
```

## 文档任务和 Agent 执行

解析开发文档：

```bash
vectahub parse-doc ./docs/task.md --json
```

执行单个文档任务：

```bash
vectahub run-task --tool codex --task-id T1 --task-label "补测试" --doc ./docs/task.md --json
```

查询文档任务运行记录：

```bash
vectahub doc-task-runs list --json
vectahub doc-task-runs latest --json
vectahub doc-task-runs show <runId> --json
```

恢复失败任务：

```bash
vectahub recover-task --doc ./docs/task.md --trace-id <traceId> --json
```

`run-task` 的完成边界、失败分类和确认语义以 [Run-Task 执行合同](./specs/run-task-execution-contract.md) 为准。

## 工具和安全

查看已知工具：

```bash
vectahub tools list
vectahub tools agents --json
```

查看和测试安全规则：

```bash
vectahub security status
vectahub security list
vectahub security test "rm -rf /" --json
```

直接命令执行会先经过安全扫描。高风险命令可能需要确认，critical 风险默认应被阻断。

## 配置、调度和导入导出

查看配置：

```bash
vectahub config show
vectahub config tools
```

管理模板和调度：

```bash
vectahub templates list
vectahub schedule list
```

导出或导入数据：

```bash
vectahub export --output ./backup
vectahub import ./backup --dry-run
```

配置和数据目录说明见 [配置手册](./configuration.md)。
