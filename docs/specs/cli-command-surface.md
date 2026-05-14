# CLI 命令面规格

## 目标

本文档记录当前 CLI 命令面，作为实现、插件调用和测试覆盖的索引。命令细节以 `src/cli-main.ts` 和 `src/commands/` 当前代码为准。

## 全局行为

- CLI 名称：`vectahub`。
- 版本命令：`vectahub --version`、`vectahub version`、`vectahub version --json`。
- 全局选项：`--verbose`、`--debug`、`--non-interactive`。
- 使用 `--json` 的命令必须避免输出人类日志污染 stdout。
- `--dry-run` 调用会设置 `VECTAHUB_AUDIT_DISABLED=1`，避免 dry-run 写审计副作用。

## 核心命令

| 命令 | 用途 | 主要选项 | JSON |
|------|------|----------|------|
| `run [intent...]` | 从自然语言或文件执行工作流。 | `--file`、`--mode`、`--save`、`--yes`、`--no-edit`、`--dry-run`、`--variable` | 支持 |
| `doctor` | 系统诊断。 | 以命令实现为准。 | 支持 |
| `chat` | 交互式聊天会话。 | 以命令实现为准。 | 未在入口声明 |
| `setup` | 运行优先级安装流程。 | 无 | 否 |
| `config show/reset/tools` | 查看、重置配置，列出 CLI 工具。 | 子命令 | 否 |
| `completion <shell>` | 生成 shell 补全脚本。 | `bash`、`zsh`、`fish` | 否 |

## 工作流和执行记录命令

| 命令 | 用途 | 主要选项 |
|------|------|----------|
| `list` | 列出保存的工作流。 | 无 |
| `list versions <workflowId>` | 列出工作流版本历史。 | 无 |
| `rollback <workflowId> <version>` | 输出或保存指定版本 YAML。 | `--output` |
| `history` | 查看执行历史。 | `--status`、`--query`、`--limit`、`--verbose`、`--workflow` |
| `detail <executionId>` | 查看执行详情。 | `--step` |
| `rerun <executionId>` | 重跑历史执行对应工作流。 | `--mode` |
| `resume <executionId>` | 从失败或暂停步骤恢复。 | `--from-step`、`--mode` |
| `archive` | 执行记录归档、恢复和删除。 | `--before`、`--list`、`--restore`、`--delete` |

## Agent 文档任务命令

| 命令 | 用途 | JSON |
|------|------|------|
| `parse-doc` | 解析开发文档，提取结构化任务列表。 | 支持 |
| `run-task` | 执行文档任务，调用 Agent CLI。 | 支持 |
| `doc-task-runs` | 查询文档任务运行记录。 | 支持 |
| `recover-task` | 恢复失败文档任务。 | 支持 |
| `trace list/show` | 查看链路追踪数据。 | 支持 |

## 工具、安全和诊断命令

| 命令 | 用途 |
|------|------|
| `run-command` | 直接运行 CLI 命令并进行安全扫描。 |
| `security` | 安全协议管理，包含状态、策略、规则增删改查等子命令。 |
| `audit` | 审计日志命令。 |
| `tools` | CLI 工具管理。 |
| `queue list/remove/clear` | 诊断队列查看、删除和清空。 |
| `vscode` | VS Code IDE 集成诊断命令。 |

工具和安全规则细节见 [工具与安全规则规格](./tools-security-management.md)。

## 生成、服务和运维命令

| 命令 | 用途 |
|------|------|
| `generate` | 生成工作流。 |
| `schedule` | 调度工作流。 |
| `templates` | 模板管理。 |
| `serve` / `client` | 启动或连接 VectaHub 服务。 |
| `daemon` | 守护进程管理。 |
| `monitor` | 监控工作流。 |
| `debug` | 调试工作流。 |
| `export` / `import` | 数据导入导出。 |
| `verify` | 验证工作流。 |
| `dev` | 隐藏开发命令集合：`status`、`module`、`validate`、`test`、`build`。 |

生成、模板、调度、服务和导入导出细节见：

- [生成、模板与调度规格](./templates-generation-scheduling.md)
- [服务与导入导出规格](./service-import-export.md)

## 维护要求

- 新增命令必须补充本文件。
- 新增机器调用路径必须说明 JSON 输出形态。
- 修改命令副作用时必须同步 [配置与数据存储规格](./config-data-storage.md)。
- 修改工作流执行行为时必须同步 [工作流生命周期规格](./workflow-lifecycle.md)。
