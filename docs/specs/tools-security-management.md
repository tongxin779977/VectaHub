# 工具与安全规则规格

## 目标

本文档覆盖 CLI 工具注册、工具命令查询、命令规则评估、安全规则管理和直接命令执行。实现依据为 `src/commands/tools.ts`、`src/commands/security.ts` 和 `src/commands/run-command.ts`。

`run-task` 的完整执行合同、执行前确认/执行后确认区分、`dry-run` 权威语义和 Agent 支持分层，以 [Run-Task 执行合同规格](./run-task-execution-contract.md) 为准。本文只补充工具探测与安全规则局部约束。

## 工具注册与查询

`tools` 命令管理 CLI tool registry。

| 命令 | 用途 | JSON |
|------|------|------|
| `tools list` | 列出已注册工具。 | 支持 |
| `tools agents` | 列出 AI Agent CLI 安装、版本、启用、权限、入口可调用和任务就绪状态。 | 支持 |
| `tools info <toolName>` | 查看工具信息。 | 否 |
| `tools commands <toolName>` | 查看工具命令列表。 | 否 |
| `tools command <toolName> <commandName>` | 查看单个命令详情。 | 否 |
| `tools test <toolName> <command>` | 检查指定工具命令是否危险。 | 否 |
| `tools known` | 查看已知可注册工具。 | 否 |
| `tools register <toolName|all>` | 注册已知工具。 | 否 |
| `tools search <keyword>` | 搜索工具和命令。 | 否 |
| `tools categories` | 列出工具分类。 | 否 |
| `tools category <name>` | 列出某分类下工具。 | 否 |

当前 `register all` 不代表所有工具完整实现；代码中会提示完整工具定义需要逐个补齐。

### Agent CLI 状态分层

`tools agents --json` 返回面向 CLI 和 VS Code 插件消费的分层状态：

- `installed` / `version` 表示是否能找到二进制及其版本信息。
- `configured_enabled` / `has_permission` 来自 VectaHub 配置，表示内部记录的启用与许可状态。
- `invocable` 表示真实入口探测通过；已知 Agent 使用 descriptor 中的入口参数，例如 Codex 使用 `codex exec --help`，unknown/fallback 才保留旧的版本探测语义。
- `ready` 表示 VectaHub 已知的任务执行入口预检通过；缺少 `readyArgs` 时按 fail-closed 处理为未就绪，并可通过 `readyIssue` 返回原因。

边界说明：

- `ready=true` 只说明 VectaHub 能在 runtime bootstrap 后通过 descriptor 定义的外层探测命令。
- `ready=true` 不等于“任务一定能成功执行”，也不保证下游 Agent 自身的二级沙箱、approval policy、远程插件同步、本地命令入口或仓库访问能力一定可用。
- 若真实任务在 Agent 内部本地命令层失败，例如 `sandbox-exec: sandbox_apply`、本地命令工具无法启动或代码读取被阻断，CLI 必须把它归类为系统类失败，而不是继续进入 verification。
- 对 `codex` 这类带内置沙箱/插件系统的 CLI，仍可能在 `spawn` 之后因为下游运行时限制失败，例如本地命令被拒绝、仓库只读或插件远程同步告警。

对 Agent 支持层级的文档表述必须与执行合同一致：

- `adapter-backed known agents`：`codex`、`gemini`、`aider`
- `descriptor-known but adapter-incomplete agents`：`claude`
- `unknown/fallback agents`：未知或自定义 CLI

UI 展示 Agent 候选时，应优先依据运行事实，即 `installed`、`invocable` 和 `ready`。  
`configured_enabled` 和 `has_permission` 可参与内部决策，但不应单独作为隐藏已可运行 Agent 的依据。若扫描已确认 Agent 可运行，插件应优先自动收敛内部配置态，而不是要求用户额外执行启用或授权动作。

CLI 或插件在真正执行前，仍可结合内部配置、安全策略和外部前置条件做最终阻断；但这种阻断应面向真实原因，不应把内部布尔位直接暴露为主 UI 逻辑。

## 命令规则引擎

| 命令 | 用途 |
|------|------|
| `tools rules --template <default|strict|relaxed>` | 查看命令规则模板。 |
| `tools eval <command...> --template <template>` | 用规则引擎评估命令。 |

规则引擎先于安全协议用于快速判定 block/allow。没有命中的命令继续进入安全协议。

## 安全规则管理

`security` 命令管理安全协议规则。

| 命令 | 用途 | JSON |
|------|------|------|
| `security status` | 查看安全规则总数、启用数、数据库版本等。 | 否 |
| `security policy` | 查看当前安全策略配置。 | 否 |
| `security list` | 列出规则，支持 `--enabled` / `--disabled`。 | 否 |
| `security add` | 新增规则。 | 否 |
| `security update <ruleId>` | 更新规则。 | 否 |
| `security delete <ruleId>` | 删除规则。 | 否 |
| `security enable <ruleId>` | 启用规则。 | 否 |
| `security disable <ruleId>` | 禁用规则。 | 否 |
| `security import <filePath>` | 从 JSON 文件导入规则。 | 否 |
| `security export <filePath>` | 导出规则，可 `--include-disabled`。 | 否 |
| `security test <command>` | 检测命令风险。 | 支持 |
| `security reset --force` | 重置默认规则。 | 否 |
| `security config` | 查看安全配置摘要。 | 否 |

## 直接命令执行

`run-command <command...>` 会先执行安全扫描，再构造单步 workflow 执行命令。

支持选项：

- `--mode strict|relaxed|consensus`
- `--json`
- `--dry-run`

行为：

- strict 模式下危险命令会被阻断。
- relaxed 模式下危险命令会输出警告并继续。
- dry-run 只输出将执行的命令和安全检测结果。
- 执行结果会保存为 source=`direct` 的执行记录。

## 安全要求

- 修改规则属于安全敏感操作，必须有审计记录。
- `security reset` 必须使用 `--force`。
- JSON 输出只能输出结构化风险结果，不混入人类说明。
- 工具 registry 中标记 dangerous 的命令不能绕过安全协议。

## 相关文档

- [安全与权限闭环规格](./security-permission-loop.md)
- [CLI 命令面规格](./cli-command-surface.md)
