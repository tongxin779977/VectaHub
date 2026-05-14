# 配置与数据存储规格

## 数据根目录

VectaHub 使用 `getVectaHubHome()` 解析数据根目录：

```text
VECTAHUB_HOME > $HOME/.vectahub
```

所有用户数据、执行记录、输出、trace、队列和归档都应落在该目录或其项目 hash 子目录下。

## 主要目录

| 路径 | 用途 |
|------|------|
| `workflows/` | 保存 workflow YAML/JSON。 |
| `executions/` | 保存执行记录。当前存在 JSON 文件和按日期 JSONL 两类记录路径。 |
| `outputs/<executionId>/` | 保存分离 stdout/stderr。 |
| `logs/traces/` | 保存 trace JSONL。 |
| `projects/<hash>/diagnostic-queue.json` | 项目级诊断队列。 |
| `diagnostic-queue.json` | 全局诊断队列回退路径。 |
| `archives/` | 执行记录归档。 |

## 执行记录

当前代码存在两类执行记录写入方式：

- `workflow/storage.ts`：按 `<executionId>.json` 保存。
- `execution/record-manager.ts`：按日期 `YYYYMMDD.jsonl` 追加保存。

实现新功能时必须确认消费方使用哪一种记录接口，避免写入后查询不到。

## 输出存储

`OutputStore` 会为每个 execution 建目录：

```text
outputs/<executionId>/<stepId>.stdout
outputs/<executionId>/<stepId>.stderr
```

保存执行记录时，大输出会被替换为：

- `outputRef`
- `outputSummary`

读取时如果输出文件存在，则还原 stdout/stderr；如果缺失，则保留 summary。

## 诊断队列

CLI `queue` 命令支持：

```bash
vectahub queue list --json
vectahub queue remove <id> --json
vectahub queue clear --json --force
```

插件优先读取项目级队列：

```text
projects/<djb2Hash(projectRoot)>/diagnostic-queue.json
```

没有项目级队列时回退到全局 `diagnostic-queue.json`。

## Trace 数据

Trace 存放在：

```text
logs/traces/*.jsonl
```

CLI `trace list` 默认读取最近 trace 概览，`trace show <traceId>` 展示指定 trace 的 spans。Trace 写入失败不能破坏主流程。

## 安全要求

- 不得把 API key、token、private key、完整 env 写入执行记录、trace 或输出摘要。
- Agent 输出必须在写入持久化摘要前经过脱敏策略。
- `--dry-run` 不应写审计、执行记录或外部副作用数据。

## 维护要求

- 新增持久化文件必须写入本规格。
- 新增项目级数据必须说明 hash、清理策略和全局回退策略。
- 修改执行记录格式时必须同步 [工作流生命周期规格](./workflow-lifecycle.md) 和相关测试。
