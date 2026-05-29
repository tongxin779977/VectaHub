# 配置与数据存储规格

## 数据根目录

VectaHub 使用 `getVectaHubHome()` 解析数据根目录：

```text
VECTAHUB_HOME > $HOME/.vectahub
```

所有用户数据、执行记录、输出、trace、队列和归档都应落在该目录或其项目 hash 子目录下。

## 第三方 Agent CLI 配置与运行态边界

`VECTAHUB_HOME` 只定义 VectaHub 自己的数据根目录，不应被解释为第三方 Agent CLI 的权威配置来源。

对 `codex`、`gemini`、`claude`、`aider` 等外部 Agent CLI，必须区分两个概念：

- 用户默认配置源：由对应 Agent CLI 自己的默认 home、环境变量或配置文件决定，是 provider、model、auth 和用户偏好的单一事实源。
- 可写运行态目录：仅用于隔离 sqlite、日志、缓存、会话或其他执行期副作用，不应改变用户默认配置语义。

实现要求：

- VectaHub 不得因为创建隔离运行目录而隐式切换 Agent provider、账号、模型或认证来源。
- 如果某个 Agent CLI 需要独立可写 home，系统必须先从用户默认配置源同步最小必要配置，再启动该 Agent。
- 如果某个 Agent CLI 采用条件 bootstrap，只有在检测到最小必要配置源时才允许改写该 Agent 的 home 环境变量；否则必须继续直接继承用户环境。
- “最小必要配置”至少应覆盖会影响 provider、auth、模型或路由选择的文件；不能只创建空目录。
- 如果无法解析用户默认配置源，或无法完成最小必要同步，应按配置类失败处理，而不是静默回退到其他 provider。

建议的 VectaHub 托管运行态目录：

```text
agent-homes/<agentId>/<projectHash>/
```

该目录属于 VectaHub 托管的运行态副作用空间，不是第三方 Agent CLI 的长期用户配置真源。

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
| `agent-homes/<agentId>/<projectHash>/` | 第三方 Agent CLI 的可写运行态隔离目录。 |

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
- 第三方 Agent CLI 的最小必要配置同步不得把 secrets 打印到 stdout/stderr、trace 或 outputSummary。

## 维护要求

- 新增持久化文件必须写入本规格。
- 新增项目级数据必须说明 hash、清理策略和全局回退策略。
- 修改执行记录格式时必须同步 [工作流生命周期规格](./workflow-lifecycle.md) 和相关测试。
