# 配置手册

本文说明 VectaHub 用户需要知道的配置入口、数据目录和环境变量。底层存储合同见 [配置与数据存储规格](./contracts/config-data-storage.md)。

## 数据根目录

VectaHub 使用以下优先级解析自己的数据根目录：

```text
VECTAHUB_HOME > $HOME/.vectahub
```

如果没有设置 `VECTAHUB_HOME`，默认使用用户主目录下的 `.vectahub`。

示例：

```bash
VECTAHUB_HOME=/tmp/vectahub-dev vectahub history
```

## 主要数据目录

在 `VECTAHUB_HOME` 下，当前主要目录包括：

| 路径 | 用途 |
|------|------|
| `workflows/` | 保存 workflow YAML/JSON。 |
| `executions/` | 保存执行记录。 |
| `outputs/<executionId>/` | 保存分离后的 stdout/stderr。 |
| `logs/traces/` | 保存 trace JSONL。 |
| `projects/<hash>/diagnostic-queue.json` | 项目级诊断队列。 |
| `diagnostic-queue.json` | 全局诊断队列回退路径。 |
| `archives/` | 执行记录归档。 |
| `agent-homes/<agentId>/<projectHash>/` | 第三方 Agent CLI 的可写运行态隔离目录。 |

不要手动编辑这些文件，除非正在排查问题并已备份相关目录。

## 配置查看

查看当前配置：

```bash
vectahub config show
```

查看工具配置：

```bash
vectahub config tools
vectahub tools agents --json
```

同步已探测到的 Agent CLI 权限状态：

```bash
vectahub tools agents --json --sync-config
```

`--sync-config` 当前只自动收敛 `hasPermission`，不会自动改写 `enabled`。

## Agent CLI 配置边界

`VECTAHUB_HOME` 只定义 VectaHub 自己的数据根目录，不是第三方 Agent CLI 的配置真源。

对 `codex`、`gemini`、`claude`、`aider` 等外部 Agent CLI，需要区分：

| 概念 | 含义 |
|------|------|
| 用户默认配置源 | 由对应 Agent CLI 自己决定，包含 provider、model、auth 和用户偏好。 |
| 可写运行态目录 | VectaHub 托管的隔离目录，只用于 sqlite、日志、缓存、会话等执行期副作用。 |

VectaHub 不应因为创建隔离运行目录而隐式切换 Agent provider、账号、模型或认证来源。

## Trace 环境变量

插件或上层调用方可以通过 trace 环境变量把上下文传给 CLI。相关协议见 [Trace 执行规格](./contracts/trace-execution.md)。

用户通常不需要手动设置 trace 环境变量。如果 `trace list` 或 `trace show` 没有结果，优先确认执行路径是否真的写入了 trace。

## 安全要求

配置、执行记录、trace 和输出摘要不得包含明文 API key、token、private key 或完整环境变量。

导出数据时默认不应包含敏感信息。只有在明确知道风险时才使用：

```bash
vectahub export --include-secrets
```

## 常见配置问题

| 现象 | 优先检查 |
|------|----------|
| 看不到历史记录 | `VECTAHUB_HOME` 是否指向另一个目录。 |
| 插件和终端结果不同 | 插件进程环境变量和终端环境变量是否一致。 |
| Agent CLI 可用性异常 | `vectahub tools agents --json` 的配置态和探测结果。 |
| 写入失败 | `VECTAHUB_HOME` 目录权限。 |

