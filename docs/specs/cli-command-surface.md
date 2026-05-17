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
| `chat` | 交互式聊天会话。 | 以命令实现为准。 | 未声明 |
| `setup` | 运行优先级安装流程。 | 无 | 否 |
| `config show/reset/tools` | 查看、重置配置，列出 CLI 工具。 | 子命令 | 否 |
| `completion <shell>` | 生成 shell 补全脚本。 | `bash`、`zsh`、`fish` | 否 |

## 工作流和执行记录命令

`run [intent...]` 默认直接执行临时 workflow，不自动写入工作流库；只有显式提供 `--save` 时才持久化 workflow 定义。

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

### `tools agents`

当前实现支持：

- `vectahub tools agents`
- `vectahub tools agents --json`
- `vectahub tools agents --json --sync-config`

语义：

- 默认返回 Agent CLI 的配置态与运行探测结果。
- `--json` 输出供插件或其他机器调用消费。
- `--sync-config` 会在本次扫描后，把探测得到的 `hasPermission` 结果写回 VectaHub 配置。
- `--sync-config` 当前只自动收敛 `has_permission`，不会自动改写 `enabled`，避免覆盖用户显式禁用。

### `run-task` 预览与合同语义

`run-task` 的完整执行合同、完成边界、`dry-run` 权威语义、`needs_confirmation` 双来源和 Agent 支持分层，以 [Run-Task 执行合同规格](./run-task-execution-contract.md) 为准。

本节只记录 CLI 命令面的入口事实与当前实现可观测行为，不重复定义完整链路。

当前实现以 `src/commands/run-task.ts` 为准：

- `run-task --contract-preview` 会先构建 `agentTaskContract` 摘要，然后立即返回。
- `--contract-preview` 不要求 `--tool`，不会加载 LLM，不会发现工具 help，不会执行 Agent。
- `run-task --dry-run` 要求提供 `--tool`，返回的是一条本地预览命令，命令消息体包含任务编号、任务描述、允许修改范围、禁止修改范围和建议验证命令。
- `--dry-run` 也会先构建 `agentTaskContract` 摘要，但在该分支中不会加载 LLM、不会做 tool help discovery、不会执行 Agent。
- 两个分支的 `--json` 输出都保留 `ok`、`command`、`output`、`outputTruncated` 和 `agentTaskContract` 字段；`--contract-preview` 的 `command` 与 `output` 为空字符串。
- 正常执行分支的 `--json` 在兼容旧字段的前提下，可追加返回 `failureKind`、`unclosedExecution`、`completionSignal`、`recoveryDecision`。
- 这些新增字段都是可选字段；旧调用方只能依赖已有 `ok`、`error`、`gitChanges`、`verification` 语义，新调用方可优先消费新增结构化字段。
- 正常执行路径才会继续进入命令生成、安全检查、Agent preflight、Agent 执行、git 变更收集和验证命令执行。
- Agent 支持分层当前应按执行合同文档理解：
  - `adapter-backed known agents`：`codex`、`gemini`、`aider`
  - `descriptor-known but adapter-incomplete agents`：`claude`
  - `unknown/fallback agents`：其他未知或自定义 CLI
- 正常执行路径默认应继承用户当前 Agent CLI 的配置语义，而不是因为 VectaHub 的运行态隔离自动切换 provider、auth 或 model。
- 如果某个已知 Agent 需要独立可写 home，`run-task` 必须先完成 runtime bootstrap：创建可写运行目录，并从用户默认配置源同步最小必要配置，然后再执行 preflight 和 spawn。
- 未知或自定义 Agent CLI 在没有明确 descriptor 规则前，不应擅自改写其 home 或配置根；默认保持直接继承用户环境。
- `run-task` 的 preflight 只覆盖 VectaHub 已知的外层 CLI 入口，不覆盖下游 Agent 自身的二级沙箱、approval policy、远程插件同步或本地命令执行权限。
- 因此即使 `tools agents --json` 报告某个 Agent 为 `ready`，真实任务仍可能在 `spawn` 之后因下游运行时限制失败；这类失败不应被误解为 provider/bootstrap 语义漂移。
- 如果 Agent 已启动，但输出明确表明“本地命令工具无法启动”“无法读取代码”“未能执行代码修改”或出现 `sandbox-exec: sandbox_apply` 这类下游环境阻塞信号，`run-task` 必须直接按系统类失败收口，不得继续进入 verification。
- 这种“Agent 已启动但未真正落地改动”的软失败，即使子进程退出码为 `0`、`agentExecutionOutcome=implemented`，也不能被视为成功执行。
- 验证阶段与 Agent 执行阶段分离；即使 Agent 已启动成功，项目本地验证命令仍可能因环境缺失失败，例如 `vue-tsc` 不存在导致 `npm run type-check` 返回系统类错误。
- 只有在 Agent 真正完成执行且未命中上述软失败短路条件时，才允许进入 verification。
- 正常执行路径的 `--json` 输出会通过 `commandGenerationPath` 标记 `adapter` 或 `llm-fallback`，并通过 `fallbackUsed` 标记是否实际使用 fallback 命令；安全拦截等失败结果也保留这些字段用于诊断。
- 审计日志写入失败采用告警降级，不改变命令返回结构；可能看到 `Failed to write audit log: ...` 的 stderr/console 告警。

#### 当前实现行为与已确认缺口

- `run-task --json` 当前不会流式输出 Agent 中间日志；在最终收口前，stdout 保持静默，结束时一次性输出 JSON。
- 当前实现收口信号为组合契约：优先 `close`；若已 `exit` 但 `close` 迟迟不到，则在有界流刷新宽限后收口。该设计用于覆盖“已写盘但后处理长期不 close”的真实场景。
- 因此“仓库已发生改动”和“CLI 已完成返回”必须视为两个独立事实。前者不能单独证明任务成功，后者也不能抹掉前者已经产生的副作用。
- 如果最终以 `timeout` 收口，且 `gitChanges.changedFileCount > 0`、`verification` 缺失，必须按“未收口执行”解释：JSON 返回 `ok=false`，保留 `gitChanges` 与摘要，且禁止写成“未执行”。
- 如果最终以 `timeout` 收口，且 `gitChanges` 不存在、`verification` 缺失，JSON 应追加 `failureKind='timeout'`、`unclosedExecution=false`，并给出 `recoveryDecision.kind='retry_direct'`。
- 如果最终以 `timeout` 收口，且 `gitChanges.changedFileCount > 0`、`verification` 缺失，JSON 应追加 `failureKind='timeout'`、`unclosedExecution=true`，并给出 `recoveryDecision.kind='suggest_fix'`。
- `completionSignal` 当前可取值为 `close`、`exit-stream-drain`、`exit-flush-grace`、`timeout`，用于解释 CLI 是如何完成收口的，不改变原有成功/失败语义。
- 仍保留 hardening backlog：持续优化 `exit` 后流刷新策略与空闲判定阈值，降低误判超时概率。

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
