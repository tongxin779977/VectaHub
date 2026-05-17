# 工具与安全规则规格

> Document Status: Current Implementation / Migration Contract
> Authority: Owns `tools`, `security`, and `run-command` command semantics. Agent runtime target fields must be checked against implementation traceability.
> Traceability: See `./implementation-traceability.md` before treating Agent registry or onboarding behavior as implemented.

## 目标

本文档覆盖 CLI 工具注册、工具命令查询、命令规则评估、安全规则管理和直接命令执行。实现依据为 `src/commands/tools.ts`、`src/commands/security.ts` 和 `src/commands/run-command.ts`。

`run-task` 的完整执行合同、执行前确认/执行后确认区分、`dry-run` 权威语义、Agent execution mode 和 LLM 调用协议边界，以 [Run-Task 执行合同规格](./run-task-execution-contract.md) 为准。本文只补充工具探测、能力上下文与安全规则局部约束。

## 工具注册与查询

`tools` 命令暴露通用工具查询面。当前 `tools agents` 仍是迁移期入口：它组合内建 Agent descriptor、`external_cli` 配置和运行探测结果。目标状态下，`tools agents` 子命令应消费统一动态 Agent registry。对 Agent CLI 而言，长期方向是单一 runtime registry，而不是“静态白名单 + 静态 descriptor + 配置布尔位”并存。

| 命令 | 用途 | JSON | 状态 |
|------|------|------|------|
| `tools list` | 列出已注册工具。 | 支持 | Current Implementation |
| `tools agents` | 列出内建 Agent descriptor、配置项和运行探测结果。 | 支持 | Current Implementation / Migration Contract |
| `tools agents show <agentName>` | 查看单个 Agent 的 runtime definition、issues 和 execution mode。 | 目标支持 | Target Design |
| `tools agents onboard <agentName>` | 主动探测并注册新的 Agent CLI。 | 目标支持 | Target Design |
| `tools agents reprobe <agentName>` | 重新探测并刷新已有 Agent 的能力与状态。 | 目标支持 | Target Design |
| `tools agents disable <agentName>` | 将 Agent 标记为 disabled。 | 目标支持 | Target Design |
| `tools agents remove <agentName>` | 从 runtime registry 中移除 Agent。 | 目标支持 | Target Design |
| `tools info <toolName>` | 查看工具信息。 | 否 | Current Implementation |
| `tools commands <toolName>` | 查看工具命令列表。 | 否 | Current Implementation |
| `tools command <toolName> <commandName>` | 查看单个命令详情。 | 否 | Current Implementation |
| `tools test <toolName> <command>` | 检查指定工具命令是否危险。 | 否 | Current Implementation |
| `tools search <keyword>` | 搜索工具和命令。 | 否 | Current Implementation |
| `tools categories` | 列出工具分类。 | 否 | Current Implementation |
| `tools category <name>` | 列出某分类下工具。 | 否 | Current Implementation |

`tools known` / `tools register <toolName|all>` 不应继续作为 Agent CLI 的权威接入方式。若出于迁移兼容保留，它们也只能转发到同一条 registry-backed onboarding 管道，不能写入独立 descriptor 或生成独立 adapter。

当前实现中的 `tools agents` 仍从内建 Agent descriptor、`external_cli` 配置和 `scanSingleTool()` 探测结果组合输出；统一动态 registry、完整 onboarding/reprobe 子命令和 `executionMode` 等目标字段仍属于迁移目标。

### Agent CLI Onboarding 触发面

本节描述目标接入合同。新 Agent CLI 的接入必须收敛到同一条 onboarding / reprobe 管道。允许的触发入口包括：

- `tools agents onboard <agentName>`：显式注册并探测指定 Agent CLI。
- `tools agents reprobe <agentName>`：刷新已有 Agent runtime record。
- `run-task` / chat / 插件选择器引用未知 Agent 时：自动触发同一条 onboarding 管道，再继续原始用户流程。

这些入口只能复用同一个 probe -> infer -> validate -> persist 流程。它们是不同的触发面，不是不同的注册机制。

### Agent CLI 状态分层

目标状态下，`tools agents --json` 应返回面向 CLI 和 VS Code 插件消费的统一 Agent runtime 状态：

- `installed` / `version` 表示是否能找到二进制及其版本信息。
- `invocable` 表示最小入口探测通过。
- `ready` 表示该 Agent 满足当前 execution mode 的最小执行前置条件。
- `executionMode` 表示 `native_headless`、`mediated_interactive` 或 `manual_only`。
- `status` 表示 `draft`、`validated`、`broken` 或 `disabled`。
- `issues[]` 表示当前阻断点或探测异常。
- `confidence` 表示 onboarding / reprobe 对该 runtime definition 的置信度。
- `source` 表示记录来自 seed migration、explicit onboarding 或 automatic onboarding，但不改变其统一 registry 身份。
- `command` / `argvShape` 表示 registry 中的调用骨架摘要，不暴露 secrets 或完整 prompt。
- `promptTransport` 表示 prompt 传递方式，例如 `arg`、`stdin`、`file` 或 `positional`。
- `cwdTransport` 表示工作目录注入方式，例如 `flag`、`env`、`inherit` 或 `unsupported`。
- `structuredOutputSupport` 表示下游 Agent CLI 是否原生支持结构化输出；不影响 VectaHub 自己输出 JSON。
- `capabilities[]` 表示该 Agent 适合承担的任务类型，例如 `codegen`、`refactor`、`debug`、`review`、`test`。
- `constraints[]` 表示 LLM、CLI 和插件在选择该 Agent 时必须知道的限制。
- `llmSummary` 表示面向 LLM Context Pack 的短摘要；必须由 runtime record 派生，不得手写漂移。

建议 JSON 形态：

```json
{
  "ok": true,
  "agents": [
    {
      "id": "cline",
      "displayName": "Cline CLI",
      "installed": true,
      "version": "1.0.0",
      "invocable": true,
      "ready": true,
      "executionMode": "mediated_interactive",
      "status": "validated",
      "promptTransport": "stdin",
      "cwdTransport": "inherit",
      "structuredOutputSupport": false,
      "capabilities": ["codegen", "refactor", "debug"],
      "constraints": ["requires approval broker", "no native JSON output"],
      "issues": [],
      "confidence": 0.82,
      "source": "automatic_onboarding",
      "llmSummary": "Cline is available as a mediated interactive coding agent. Use VectaHub approval brokerage and do not expect native JSON output."
    }
  ]
}
```

兼容说明：

- 迁移期可以继续返回旧字段，例如 `name`、`configured_enabled`、`has_permission`，但它们不能作为主决策来源。
- 新调用方接入前必须 feature-detect 当前 JSON 是否已经提供目标字段；字段存在时应优先消费 `id`、`status`、`executionMode`、`ready`、`issues` 和 `capabilities`。
- `llmSummary` 是派生摘要，不是新的事实源；字段冲突时必须以同一条 Agent runtime record 的结构化字段为准。

边界说明：

- `ready=true` 只说明该 Agent 已满足当前 execution mode 的最小可执行要求。
- `executionMode=native_headless` 表示可直接进入 `run-task` 自动执行链。
- `executionMode=mediated_interactive` 表示需要经由 PTY + approval broker 的中介执行层。
- `executionMode=manual_only` 表示当前只能被发现和登记，不能进入自动执行链。
- 若真实任务在 Agent 内部本地命令层失败，例如 sandbox、只读仓库、本地命令禁用或远程插件同步阻断，CLI 仍必须把它归类为系统类失败，而不是继续进入 verification。

对 Agent 支持层级的文档表述必须与 execution mode 一致：

- `native_headless`
- `mediated_interactive`
- `manual_only`

UI 展示 Agent 候选时，应优先依据运行事实，即 `installed`、`invocable` 和 `ready`。  
插件和 CLI 不应再以静态已知 Agent 名单或本地布尔位作为主决策依据。候选展示、自动执行可用性和阻断原因都应以 registry-backed runtime state 为准。

CLI 或插件在真正执行前，仍可结合安全策略和外部前置条件做最终阻断；但这种阻断应面向真实原因，例如 execution mode、approval mediation policy、runtime bootstrap failure 或高风险确认，而不是暴露实现细节。

自动触发 onboarding 时也必须遵守同一套安全边界：

- 只探测用户明确引用的 Agent CLI，不做全局无界扫描。
- 只写入统一 registry，不生成运行时代码文件。
- 置信度不足时进入 targeted questions 或 `manual_only`，而不是伪造 `native_headless` 能力。

### LLM 能力上下文

`tools agents --json` 是 `Agent Runtime Catalog` 的主要数据来源之一。LLM 不能直接读取人类日志、完整 help 输出或插件本地状态来判断 Agent 能力。

面向 LLM 的 Agent 摘要必须满足：

- 只包含已注册或本次明确引用并完成 onboarding 的 Agent。
- 只包含选择和解释所需的短字段，不包含 secrets、token、完整配置、完整 stdout/stderr 或完整 prompt。
- 必须包含 `executionMode`、`ready`、`capabilities`、`constraints` 和阻断原因。
- 对 `manual_only` Agent，必须明确说明不能自动执行。
- 对 `mediated_interactive` Agent，必须明确说明需要 PTY runner 和 approval broker。
- 对 `native_headless` Agent，仍必须保留安全策略和 preflight 约束，不得暗示无条件自动执行。

VectaHub 还应提供 `VectaHub Capability Catalog`，用于让 LLM 理解项目自身命令能力。该 catalog 应描述：

- 命令或能力名称。
- 适用意图。
- 必需参数和可选参数。
- 是否支持 `--json`。
- 是否支持 `--dry-run`、`--contract-preview` 或其他预览能力。
- 副作用等级。
- 需要确认的场景。
- 机器可读输出合同。

LLM Context Pack 应从 `Agent Runtime Catalog` 和 `VectaHub Capability Catalog` 派生。LLM 可用它选择 Agent、选择 VectaHub 能力、解释阻断原因或提出 onboarding 问题，但不得用它覆盖 registry、renderer、安全策略或恢复合同。

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
