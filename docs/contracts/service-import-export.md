# 服务与导入导出规格

## 目标

本文档覆盖本地 socket 服务、AI daemon、数据导入导出和模式切换。实现依据为 `src/commands/serve.ts`、`src/commands/daemon.ts`、`src/commands/export.ts` 和 `src/commands/mode.ts`。

## 本地服务

```bash
vectahub serve
vectahub serve --daemon
```

当前服务使用本地 socket：

```text
<tmpdir>/vectahub.sock
```

启动后可用 client 子命令交互：

```bash
vectahub client submit "<input>"
vectahub client status <task-id>
vectahub client list
vectahub client mode [STRICT|RELAXED|CONSENSUS]
vectahub client config
vectahub client shutdown
```

服务启动、关闭和错误会写审计事件。

## AI Daemon

```bash
vectahub daemon --socket <path> start
vectahub daemon --socket <path> stop
vectahub daemon --socket <path> status
```

行为：

- `start` 启动 AI daemon。
- `stop` 通过 daemon client 发送 shutdown。
- `status` 显示状态、运行时间、活跃会话、队列任务和已处理任务。

## 模式切换

```bash
vectahub mode
vectahub mode strict
vectahub mode relaxed
vectahub mode consensus
```

`mode` 读取或更新 sandbox mode。有效值为 `strict`、`relaxed`、`consensus`。

## 数据导出

```bash
vectahub export --output <dir>
vectahub export --output <dir> --include-secrets
vectahub export --output <dir> --no-workflows
vectahub export --output <dir> --no-executions
vectahub export --output <dir> --no-config
vectahub export --output <dir> --no-sessions
vectahub export --output <dir> --format csv --status COMPLETED --limit 100
```

导出范围可包含：

- config
- workflows
- executions
- sessions

默认会对配置中的常见 secret 字段脱敏。只有显式 `--include-secrets` 时才应包含 secrets。

导出会先创建临时目录，再在非 Windows 平台尝试打包为 `tar.gz`。打包失败时保留目录。

## 数据导入

```bash
vectahub import <path>
vectahub import <path> --dry-run
vectahub import <path> --overwrite
```

dry-run 只展示将导入内容和目标目录。实际导入可能解压 `.tar.gz` 到临时目录，再合并或覆盖目标数据。

## 风险和边界

- `client` 命令依赖本地服务正在运行。
- `daemon stop` 依赖 socket 可连接。
- 导入导出可能读写大量用户数据，执行前应明确输入、输出和覆盖策略。
- 导出 secrets 必须谨慎，默认应脱敏。

## 相关文档

- [配置与数据存储规格](./config-data-storage.md)
- [CLI 命令面规格](./cli-command-surface.md)
