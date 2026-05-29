# Agent CLI Runtime 与提示词上下文收敛设计

> Document Status: Target Design / Migration Contract
> Authority: Design direction for Agent CLI runtime, generic rendering, prompt context, and migration sequencing.
> Traceability: See `../contracts/implementation-traceability.md` before treating registry, renderer, or LLM context behavior as implemented.

## 背景

`run-task` 的完整执行合同、`dry-run` 权威语义、完成边界、Agent execution mode 和 LLM 调用协议边界，以 [Run-Task 执行合同规格](../contracts/run-task-execution-contract.md) 为准。本文只描述 Agent CLI runtime、调用渲染和提示词上下文的设计方向与迁移方案。

当前 `run-task` 已具备合同构建、trace、安全检查、Agent 执行、验证和恢复链路，但外部 Agent CLI 接入仍存在三个结构性问题：

1. Agent CLI 运行时事实还没有完全收敛到单一动态 registry。
2. 部分路径仍保留“读取 `--help` + LLM 生成命令”的迁移期行为。
3. LLM 还没有稳定消费 `Agent Runtime Catalog` 和 `VectaHub Capability Catalog`，因此不能可靠理解已注册 Agent 与 VectaHub 自身能力。

这会带来以下风险：

- 顶层命令与子命令参数面混淆，例如 `codex` 顶层参数和 `codex exec` 子命令参数不一致。
- 可用性检测只验证 `--version`，不能证明真实执行链可用。
- Agent CLI 的调用协议漂移如果交给 LLM 临场猜测，会缺少确定性约束。
- `AgentTaskContract` 已存在，但任务语义、Agent 选择和 VectaHub 能力选择还没有完全通过统一 context pack 连接。

## 目标

- 建立统一动态 Agent registry，作为 Agent CLI runtime definition 的单一事实源。
- 建立 registry-backed generic renderer，不再依赖 LLM 猜测已注册 Agent 的命令参数。
- 让 `run-task` 主流程围绕 `AgentTaskContract` 运作，提示词与命令协议解耦。
- 将 Agent CLI 的 `installed`、`invocable`、`ready`、`executionMode` 和阻断原因分层。
- 让 LLM 通过 `LLM Context Pack` 熟悉已注册 Agent、VectaHub 命令能力和当前任务边界。
- 保留 LLM 作为 onboarding inference 或未知 Agent 辅助，但不能让它绕过 registry validation 直接产出执行协议。
- 为后续新增 `codex`、`gemini`、`aider`、`claude`、`cline` 之外的 Agent CLI 预留统一扩展点。

## 非目标

- 不在本设计中重写 `AgentTaskContract` 纯函数规则。
- 不改变 `run-task`、`recover-task`、插件 JSON 协议的既有大方向。
- 不把所有 Agent CLI 统一到完全相同的参数形态。
- 不让 LLM 覆盖 registry 中的 `promptTransport`、`cwdTransport`、`executionMode`、preflight 或 approval policy。
- 不把完整 help、完整文档、完整 trace 或完整 stdout/stderr 作为常规 LLM 上下文。
- 不在第一阶段引入数据库、远程控制面或多租户权限系统。

## 核心问题

### 问题 1：命令协议缺少抽象层

旧配置层只有 `enabled` 与 `has_permission` 两个布尔位，无法表达：

- 是否存在子命令入口
- prompt 通过参数还是 stdin 传递
- 是否支持非交互模式
- 是否需要 mediated interactive runner
- 工作目录如何注入
- approval policy 是否在顶层还是子命令层生效
- 真实 preflight 应检查哪条调用链

目标模型应把这些信息放入 Agent runtime registry。`run-task`、chat、插件和 LLM Context Pack 都从 registry 派生事实。

### 问题 2：提示词工程仍停留在“命令生成 prompt”

迁移期 `agent-cmd-generator-v1` 的职责仍可能是“根据工具帮助和任务信息生成完整执行命令”。这有两个问题：

- 命令协议本应由系统控制，而不是由 LLM 推断。
- `AgentTaskContract` 虽已上传到上下文，但未在模板中成为显式一等输入。
- LLM 不知道已注册 Agent 的真实 runtime state、execution mode 和 VectaHub capability，因此容易把 Agent 选择、命令协议和任务语义混在一起。

### 问题 3：preflight 只能证明命令存在，不能证明执行链有效

`--version` 能执行，不代表：

- `codex exec` 可执行
- 非交互参数组合可执行
- 当前环境具备认证和工作目录切换能力

系统需要对 `installed`、`invocable`、`ready`、`executionMode`、`issues` 和 `confidence` 做分层判断。

## 设计原则

### Contract First

任务语义应由 `AgentTaskContract` 主导，而不是由长文档或工具帮助主导。

### Registry Renderer First

已注册 Agent 走 registry-backed generic renderer 或 mediated runner。LLM 不生成已注册 Agent 的最终 argv。

### Prompt / Transport 解耦

“要对 Agent 说什么”与“如何把这段话传给某个 CLI”必须分离。

### Capability-Aware LLM

LLM 必须通过 `Agent Runtime Catalog`、`VectaHub Capability Catalog` 和 `LLM Context Pack` 理解当前项目能力。prompt 模板不得维护另一套静态 Agent 表。

### Config Source First

第三方 Agent CLI 的用户默认配置必须保持为单一事实源。若需要隔离可写运行态，只能隔离副作用目录，不能因为切换 home 或环境变量而隐式改变 provider、auth、model 或账号语义。

### Fail Closed

当协议不明确、子命令不兼容、非交互入口不可用时，系统应阻断并返回结构化失败，而不是静默回退到错误命令。

## 总体方案

```text
run-task
  -> Build AgentTaskContract
  -> Resolve Agent Runtime Record
  -> Onboard / Reprobe if needed
  -> Build Task Prompt from Contract
  -> Render Invocation or Select Mediated Runner
  -> Validate Invocation
  -> Security Check
  -> Agent Preflight
  -> Spawn Agent
  -> Collect Changes
  -> Run Verification
  -> Format Result / Persist / Recover
```

其中新增的关键层为：

- `Agent Runtime Registry`
- `Agent Runtime Catalog`
- `VectaHub Capability Catalog`
- `LLM Context Pack`
- `Generic Invocation Renderer`
- `Mediated Interactive Runner`
- `Task Execution Prompt Builder`
- `Invocation Validator`
- `Agent Preflight`

## 分层设计

### 1. Agent Runtime Registry

系统维护统一动态 Agent registry，作为 Agent CLI runtime definition 的单一事实源。

内建 descriptor 可以作为 seed migration 输入，但运行时不得让静态 descriptor、插件本地表或配置布尔位成为并行事实源。

建议描述字段至少包括：

- `id`
- `displayName`
- `entryCommand`
- `subcommand`
- `executionMode`
- `promptTransport`
  - `arg`
  - `stdin`
  - `file`
  - `positional`
- `promptArgName`
- `cwdTransport`
- `workingDirectoryArg`
- `nonInteractiveFlags`
- `approvalPolicySupport`
- `structuredOutputSupport`
- `preflightSpec`
- `dryRunRenderMode`
- `runtimePolicy`
- `capabilities`
- `constraints`
- `issues`
- `confidence`
- `source`

这层负责表达“某个 Agent CLI 该如何被调用、能否自动执行、如何向 LLM 暴露能力摘要”，而不是让 `run-task` 或 LLM 直接面向原始字符串。

`runtimePolicy` 至少应能表达：

- 是否直接继承用户默认配置
- 是否需要独立可写运行目录
- 独立运行目录使用哪个环境变量注入
- 用户默认配置源如何解析
- 需要同步哪些最小必要配置文件
- 需要剥离哪些上层环境变量，避免污染子进程行为

### 2. Agent Runtime Catalog

`Agent Runtime Catalog` 是从 registry 派生的 LLM-safe 和 UI-safe 视图，不是第二个 registry。

每个 catalog entry 应包含：

- `id`
- `displayName`
- `executionMode`
- `installed`
- `invocable`
- `ready`
- `status`
- `promptTransport`
- `cwdTransport`
- `structuredOutputSupport`
- `capabilities`
- `constraints`
- `issues`
- `confidence`
- `llmSummary`

catalog 不得包含：

- secrets
- token
- 完整配置文件
- 完整 help 输出
- 完整 stdout/stderr
- 完整 prompt 历史

### 3. VectaHub Capability Catalog

`VectaHub Capability Catalog` 描述 VectaHub 自身能做什么，让 LLM 不再靠记忆猜命令面。

建议覆盖：

- `run-task`
- `parse-doc`
- `tools agents`
- `tools agents onboard`
- `tools agents reprobe`
- `recover-task`
- `run-command`
- `security test`
- `workflow run`
- `trace show`

每个 capability entry 应包含：

- 适用意图
- 必需参数
- 可选参数
- 是否支持 `--json`
- 是否支持 `--dry-run` 或 preview
- 副作用等级
- 需要确认的条件
- 输出合同
- LLM 何时应选择
- LLM 何时必须避免

### 4. LLM Context Pack

`LLM Context Pack` 是单次 LLM 调用前动态生成的短上下文。

输入来源：

- Agent Runtime Catalog
- VectaHub Capability Catalog
- AgentTaskContract summary
- 当前 workspace 执行约束
- 安全策略摘要
- fallback/onboarding 规则

LLM 可以用它：

- 识别意图
- 选择 VectaHub capability
- 选择已注册 Agent
- 解释 Agent 为什么 blocked、manual-only 或 mediated
- 基于合同生成任务语义
- 在 onboarding 置信度不足时提出问题

LLM 不能用它：

- 发明已注册 Agent 的 argv
- 绕过 execution mode
- 绕过 approval broker
- 标记未 ready 的 Agent 可执行
- 根据 Agent 输出决定任务最终状态

### 5. Generic Invocation Renderer

generic renderer 根据 registry record 将统一输入渲染为具体调用。

统一输入建议包含：

- `workspaceRoot`
- `taskPrompt`
- `mode`
- `traceContext`
- `executionConstraints`
- `outputMode`

统一输出建议包含：

- `command`
- `args`
- `envPatch`
- `preview`
- `redactionHints`
- `runtimeBootstrapSpec`

renderer 的职责：

- 根据 runtime record 生成正确 argv
- 处理子命令位置
- 处理 prompt 传输方式
- 处理工作目录参数
- 处理非交互参数
- 生成 dry-run 预览内容
- 声明运行态 bootstrap 需求，但不直接读写用户配置文件

renderer 不负责：

- 推导任务语义
- 运行安全检查
- 决定验证命令
- 读整份文档
- 处理 `mediated_interactive` 的 PTY 对话循环
- 覆盖 registry runtime state

### 6. Task Execution Prompt Builder

新增专门的任务执行 prompt builder，只负责生成任务语义，不负责 shell 参数拼装。

prompt 输入优先级建议为：

1. `taskId`
2. `taskLabel`
3. `docExcerpt`
4. `allowedFiles`
5. `forbiddenFiles`
6. `validationCommands`
7. `boundaryConfidence`
8. `docPath`

约束：

- 默认不要求 Agent 重新读取整份文档。
- `docPath` 仅作为补充引用，不是主执行材料。
- 当 `docExcerpt` 缺失或可信度较低时，应明确要求最小改动并说明阻塞点。
- prompt 必须显式表达允许范围、禁止范围和验证要求。

### 7. Invocation Validator

在 renderer 输出后增加结构化校验层，确保命令满足当前 runtime record 约束。

校验内容包括：

- 子命令是否出现在正确位置
- 顶层参数是否被错误注入到子命令后
- prompt 是否通过声明的 transport 传递
- 非交互模式参数是否完整
- cwd 注入方式是否符合 runtime record

对已注册 Agent CLI，校验失败应直接阻断，不得进入 `spawn`。

### 8. Agent Runtime Bootstrap

在真正 `spawn` 前，系统需要有统一的 runtime bootstrap，而不是在某个 Agent 分支中零散写 home 修补。

bootstrap 的职责：

- 解析该 Agent CLI 的用户默认配置源
- 创建 VectaHub 托管的可写运行态目录
- 同步最小必要配置文件
- 生成最终 `envPatch`
- 记录当前运行使用的是“继承默认配置”还是“隔离运行态 + 配置同步”

bootstrap 的约束：

- 不得把空运行目录直接当作新的用户配置根
- 不得因为运行态隔离而改变 provider、auth、model 或账号来源
- 不能推断不确定的配置文件；没有证据时应保持直接继承用户环境
- 如果 bootstrap 缺少必要配置，应返回结构化 `config` 失败，而不是让 Agent 静默回退到默认 provider

### 9. Agent Preflight

将检测拆成三级：

- `installed`
  - 二进制可发现
- `invocable`
  - 真实入口可调用，例如 `codex exec --help`
- `ready`
  - 最小非交互 smoke test 可通过

插件、CLI 和 LLM Context Pack 都应消费这一分层状态，而不是只看 `--version`。

preflight 必须在 runtime bootstrap 之后执行，否则“可调用”结论可能建立在错误配置源上。

## Agent execution mode 策略

### native_headless

适用对象：

- 支持稳定非交互执行的已注册 Agent CLI。

策略：

- 必须走 registry-backed generic renderer。
- 默认跳过 LLM 命令生成。
- LLM 只能参与 Agent 选择、任务语义和 onboarding 辅助。
- 只有在 runtime record 明确声明时，才允许隔离可写运行目录。
- 隔离运行目录时，仍必须继承用户默认配置语义

### mediated_interactive

策略：

- 必须经由 PTY runner、prompt classifier 和 approval broker。
- 允许 VectaHub 帮助不支持原生 headless 的 Agent 进入受控执行。
- 不要求下游 Agent CLI 原生输出 JSON。
- VectaHub 负责输出捕获、脱敏、状态归类、验证和恢复。
- LLM Context Pack 必须明确该 Agent 需要 mediated runner，不能写成可直接 headless。

### manual_only

策略：

- 可以被发现、登记和展示。
- 不能进入自动执行链。
- `run-task` 应返回结构化阻断和可操作原因。
- LLM 可以解释阻断原因或建议 onboarding/reprobe，但不能把它改写为可执行。

### unknown / onboarding fallback

策略：

- 用户明确引用未知 Agent 时，先走 onboarding / reprobe 管道。
- 可使用 LLM 辅助归纳 help 输出和提出 targeted questions。
- LLM 产物必须进入 registry validation，不能直接成为最终执行协议。
- validation 成功后写入 registry，再按 execution mode 继续。
- validation 失败或置信度不足时进入 targeted questions、`manual_only` 或结构化失败。
- 未经证据不得为未知 CLI 发明 home、provider 或配置同步规则。

## 提示词工程调整

### 现状判断

当前提示词工程需要优化，但优化重点不是“让命令生成更聪明”，而是“让 LLM 熟悉 VectaHub 和已注册 Agent 的结构化能力，同时收窄职责边界”。

当前 `agent-cmd-generator-v1` 的主要问题：

- 把命令协议选择交给 LLM
- 强调“完整任务上下文不能丢失”，容易推动长 prompt 和整文档回灌
- 仍要求“先阅读参考文档，再按文档要求实现”
- 没有围绕 `AgentTaskContract` 建立 prompt 主结构
- 没有稳定注入 `Agent Runtime Catalog` 与 `VectaHub Capability Catalog`

### 建议调整

第一阶段：

- 已注册 Agent CLI 跳过命令生成 prompt
- 保留 `agent-cmd-generator-v1` 仅作为 onboarding inference / 未注册 Agent 辅助
- 新增或收敛 LLM Context Pack builder

第二阶段：

- 新增 `task-execution-from-contract` 类 prompt
- 输入显式包含合同摘要字段
- 输出仅为发给 Agent 的任务语义文本，不包含 shell 命令
- NL / chat / run-task 的 LLM 调用都注入 `registeredAgentCliContext` 与 `vectaHubCapabilityContext`

第三阶段：

- 为低可信度合同场景增加单独 prompt 分支
- 明确告诉 Agent：边界不清时只做最小实现或返回阻塞说明
- 对 `manual_only` 与 `mediated_interactive` Agent 使用不同的解释与执行提示模板

## 配置层调整方向

当前 `external_cli` 配置过薄，后续应由 Agent runtime registry 承担主要 runtime definition。用户配置只能影响许可、偏好和 profile，不应成为协议事实源。

建议区分：

- 用户可配置项
  - enabled
  - permission
  - profile
  - model override
- 系统协议项
  - entry command
  - subcommand shape
  - prompt transport
  - cwd transport
  - preflight spec
  - execution mode
  - approval mediation policy

避免让用户配置直接覆盖协议骨架，防止破坏已知 Agent CLI 的稳定调用方式。

## 迁移顺序

### 顺序 1：建立 Agent Runtime Registry

- 新增或收敛 runtime registry record 类型
- seed 现有内建 descriptor 进入 registry
- 定义 `executionMode`、`promptTransport`、`cwdTransport`、capabilities、constraints、issues 和 confidence
- `run-task`、chat、插件选择器都通过 registry 解析 Agent

### 顺序 2：建立 Generic Invocation Renderer 与 mediated runner

- 已注册 `native_headless` Agent 使用 renderer 渲染
- `mediated_interactive` Agent 使用 PTY runner 和 approval broker
- `manual_only` Agent 返回结构化阻断
- dry-run 使用 runtime record 直接渲染预览或阻断说明

### 顺序 3：升级 preflight 与工具检测

- `tools agents --json` 返回 `installed / invocable / ready / executionMode / status / issues / capabilities / llmSummary`
- `run-task` 在执行前验证真实入口

### 顺序 4：建立 LLM Context Pack

- 从 Agent Runtime Catalog 和 VectaHub Capability Catalog 生成短上下文
- NL / chat / run-task / onboarding 辅助统一消费
- prompt 模板不再维护静态 Agent 能力表

### 顺序 5：收敛任务执行 prompt

- 以合同为主输入重写任务 prompt builder
- 让文档路径从主输入退为补充输入
- 输出任务语义，不输出已注册 Agent 的最终 argv

### 顺序 6：保留 onboarding fallback

- fallback 仅服务未注册 Agent 的 onboarding inference
- 输出必须经过 registry validation 和显式标记

## 取舍

| 方案 | 结论 | 原因 |
|------|------|------|
| 所有 Agent 都继续走 help + LLM 命令生成 | 放弃 | 已知协议不稳定，错误难前置发现。 |
| 每个 Agent 都在 `run-task` 中写 if/else | 放弃 | 扩展性差，难以测试和维护。 |
| 用 registry + generic renderer 固化协议，LLM 只处理能力选择、任务语义和 onboarding 辅助 | 采用 | 符合合同优先、扩展稳定、验证明确。 |
| 让 LLM 读取完整 help 和文档来熟悉系统 | 放弃 | 上下文膨胀、易泄漏、协议不稳定。 |
| 用 LLM Context Pack 注入结构化能力摘要 | 采用 | 让 LLM 熟悉当前项目能力，同时保留系统控制权。 |

## 风险

- 第一阶段会出现新旧路径并存，需要明确命中条件和 trace 标识。
- 某些 Agent CLI 的协议可能随版本变化，需要 registry validation 和 reprobe 策略。
- 如果过早允许用户覆盖协议骨架，可能再次引入不可控漂移。
- 如果 LLM Context Pack 过长或包含敏感信息，会重新引入 prompt 泄漏和上下文污染风险。

## 验证方式

- `run-task --tool codex` 不再通过 LLM 生成命令。
- `run-task --dry-run` 对已注册 Agent 返回确定性预览或结构化阻断。
- `tools agents --json` 能区分安装、入口可调用、任务可执行、execution mode 和阻断原因。
- registered Agent 的命令渲染具备单元测试，覆盖子命令、cwd、prompt transport、非交互参数。
- mediated interactive Agent 具备 approval broker 与超时测试。
- LLM Context Pack 测试证明已注册 Agent 摘要和 VectaHub capability 摘要会进入 prompt，且不包含 secrets 或完整日志。
- LLM 不得为已注册 Agent 生成最终 argv 的规则有测试覆盖。
- 任务 prompt builder 的输入显式依赖 `AgentTaskContract`，不再默认要求读取整份文档。

## 相关文档

- [Agent 执行系统设计](./agent-execution-system.md)
- [合同单一事实源设计](./contract-single-source.md)
- [插件与 CLI 边界设计](./plugin-cli-boundary.md)
- [Agent Worker 合同规格](../contracts/agent-worker-contract.md)
- [CLI 命令面规格](../contracts/cli-command-surface.md)
