# Agent CLI 适配分层与提示词收敛设计

## 背景

当前 `run-task` 已具备合同构建、trace、安全检查、Agent 执行、验证和恢复链路，但外部 Agent CLI 接入仍存在两个结构性问题：

1. 已知 Agent CLI 仍主要依赖“读取 `--help` + LLM 生成命令”的方式组装执行命令。
2. 任务提示词虽然已开始传入 `AgentTaskContract`，但主提示词模板仍以“整段任务说明 + 文档路径 + 工具帮助”思路为中心，没有真正以合同作为主输入。

这会带来以下风险：

- 顶层命令与子命令参数面混淆，例如 `codex` 顶层参数和 `codex exec` 子命令参数不一致。
- 可用性检测只验证 `--version`，不能证明真实非交互执行链可用。
- 已知 Agent CLI 的调用协议漂移由 LLM 临场猜测承受，缺少确定性约束。
- `AgentTaskContract` 已存在，但没有成为任务执行 prompt 的单一事实源。

## 目标

- 为已知 Agent CLI 建立确定性适配层，不再依赖 LLM 猜测命令参数。
- 让 `run-task` 主流程围绕 `AgentTaskContract` 运作，提示词与命令协议解耦。
- 将 Agent CLI 的“安装检测”“真实入口检测”“非交互可执行检测”分层。
- 保留 LLM 命令生成功能，但仅作为未知或自定义 Agent CLI 的显式 fallback。
- 为后续新增 `codex`、`gemini`、`aider`、`claude` 之外的 Agent CLI 预留统一扩展点。

## 非目标

- 不在本设计中重写 `AgentTaskContract` 纯函数规则。
- 不改变 `run-task`、`recover-task`、插件 JSON 协议的既有大方向。
- 不把所有 Agent CLI 统一到完全相同的参数形态。
- 不在第一阶段引入数据库、远程控制面或多租户权限系统。

## 核心问题

### 问题 1：命令协议缺少抽象层

当前配置层只有 `enabled` 与 `has_permission` 两个布尔位，无法表达：

- 是否存在子命令入口
- prompt 通过参数还是 stdin 传递
- 是否支持非交互模式
- 工作目录如何注入
- approval policy 是否在顶层还是子命令层生效
- 真实 preflight 应检查哪条调用链

结果是 `run-task` 只能把“工具帮助输出 + 任务信息”交给 LLM 生成命令，已知工具也缺少稳定协议。

### 问题 2：提示词工程仍停留在“命令生成 prompt”

当前 `agent-cmd-generator-v1` 的职责仍是“根据工具帮助和任务信息生成完整执行命令”。这有两个问题：

- 命令协议本应由系统控制，而不是由 LLM 推断。
- `AgentTaskContract` 虽已上传到上下文，但未在模板中成为显式一等输入。

### 问题 3：preflight 只能证明命令存在，不能证明执行链有效

`--version` 能执行，不代表：

- `codex exec` 可执行
- 非交互参数组合可执行
- 当前环境具备认证和工作目录切换能力

系统需要对“已安装”“可调用”“可执行任务”做分层判断。

## 设计原则

### Contract First

任务语义应由 `AgentTaskContract` 主导，而不是由长文档或工具帮助主导。

### Adapter First

已知 Agent CLI 走确定性 adapter；只有未知 CLI 才允许退回 `help + LLM` 猜测模式。

### Prompt / Transport 解耦

“要对 Agent 说什么”与“如何把这段话传给某个 CLI”必须分离。

### Config Source First

第三方 Agent CLI 的用户默认配置必须保持为单一事实源。若需要隔离可写运行态，只能隔离副作用目录，不能因为切换 home 或环境变量而隐式改变 provider、auth、model 或账号语义。

### Fail Closed

当协议不明确、子命令不兼容、非交互入口不可用时，系统应阻断并返回结构化失败，而不是静默回退到错误命令。

## 总体方案

```text
run-task
  -> Build AgentTaskContract
  -> Select Agent Descriptor / Adapter
  -> Build Task Prompt from Contract
  -> Render Invocation
  -> Validate Invocation
  -> Security Check
  -> Agent Preflight
  -> Spawn Agent
  -> Collect Changes
  -> Run Verification
  -> Format Result / Persist / Recover
```

其中新增的关键层为：

- `Agent Descriptor Registry`
- `Agent Adapter`
- `Task Execution Prompt Builder`
- `Invocation Validator`
- `Agent Preflight`

## 分层设计

### 1. Agent Descriptor Registry

系统维护一组内建 `AgentDescriptor`，作为已知 Agent CLI 的协议事实源。

建议描述字段至少包括：

- `id`
- `displayName`
- `entryCommand`
- `subcommand`
- `promptTransport`
  - `arg`
  - `stdin`
  - `file`
- `promptArgName`
- `workingDirectoryArg`
- `nonInteractiveFlags`
- `approvalPolicySupport`
- `structuredOutputSupport`
- `preflightSpec`
- `dryRunRenderMode`
- `runtimePolicy`

这层负责表达“某个 Agent CLI 该如何被调用”，而不是让 `run-task` 直接面向原始字符串。

`runtimePolicy` 至少应能表达：

- 是否直接继承用户默认配置
- 是否需要独立可写运行目录
- 独立运行目录使用哪个环境变量注入
- 用户默认配置源如何解析
- 需要同步哪些最小必要配置文件
- 需要剥离哪些上层环境变量，避免污染子进程行为

### 2. Agent Adapter

每个已知 Agent CLI 提供一个 adapter，将统一输入渲染为具体命令。

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

adapter 的职责：

- 根据 descriptor 生成正确 argv
- 处理子命令位置
- 处理 prompt 传输方式
- 处理工作目录参数
- 处理非交互参数
- 生成 dry-run 预览内容
- 声明运行态 bootstrap 需求，但不直接读写用户配置文件

adapter 不负责：

- 推导任务语义
- 运行安全检查
- 决定验证命令
- 读整份文档

### 3. Task Execution Prompt Builder

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

### 4. Invocation Validator

在 `adapter.render()` 后增加结构化校验层，确保命令满足当前 descriptor 约束。

校验内容包括：

- 子命令是否出现在正确位置
- 顶层参数是否被错误注入到子命令后
- prompt 是否通过声明的 transport 传递
- 非交互模式参数是否完整
- cwd 注入方式是否符合 descriptor

对已知 Agent CLI，校验失败应直接阻断，不得进入 `spawn`。

### 5. Agent Runtime Bootstrap

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

### 6. Agent Preflight

将检测拆成三级：

- `installed`
  - 二进制可发现
- `invocable`
  - 真实入口可调用，例如 `codex exec --help`
- `ready`
  - 最小非交互 smoke test 可通过

插件和 CLI 都应消费这一分层状态，而不是只看 `--version`。

preflight 必须在 runtime bootstrap 之后执行，否则“可调用”结论可能建立在错误配置源上。

## 已知 Agent 与未知 Agent 的策略分流

### 已知 Agent CLI

适用对象：

- `codex`
- `gemini`
- `aider`
- `claude`

策略：

- 必须走 descriptor + adapter
- 默认跳过命令生成 LLM
- 可选保留 LLM 仅用于任务执行 prompt 微调，但不参与命令协议决定
- 只有在 descriptor 明确声明时，才允许隔离可写运行目录
- 隔离运行目录时，仍必须继承用户默认配置语义

### 未知或自定义 Agent CLI

策略：

- 可以走 `help + LLM` 命令生成 fallback
- 但输出必须通过 invocation validator
- fallback 必须在结果中显式标记
- 未经证据不得为未知 CLI 发明 home、provider 或配置同步规则

## 提示词工程调整

### 现状判断

当前提示词工程需要优化，但优化重点不是“让命令生成更聪明”，而是“收窄 LLM 职责边界”。

当前 `agent-cmd-generator-v1` 的主要问题：

- 把命令协议选择交给 LLM
- 强调“完整任务上下文不能丢失”，容易推动长 prompt 和整文档回灌
- 仍要求“先阅读参考文档，再按文档要求实现”
- 没有围绕 `AgentTaskContract` 建立 prompt 主结构

### 建议调整

第一阶段：

- 已知 Agent CLI 跳过命令生成 prompt
- 保留 `agent-cmd-generator-v1` 仅作为未知 Agent fallback

第二阶段：

- 新增 `task-execution-from-contract` 类 prompt
- 输入显式包含合同摘要字段
- 输出仅为发给 Agent 的任务语义文本，不包含 shell 命令

第三阶段：

- 为低可信度合同场景增加单独 prompt 分支
- 明确告诉 Agent：边界不清时只做最小实现或返回阻塞说明

## 配置层调整方向

当前 `external_cli` 配置过薄，后续应允许配置或覆盖 descriptor 相关字段，但内建 descriptor 仍应是代码事实源。

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
  - preflight spec

避免让用户配置直接覆盖协议骨架，防止破坏已知 Agent CLI 的稳定调用方式。

## 迁移顺序

### 顺序 1：建立 Agent Descriptor / Adapter 抽象

- 新增 descriptor registry
- 为 `codex`、`aider`、`gemini`、`claude` 定义最小协议
- 新增 adapter 接口和内建 adapter
- `run-task` 先接入 adapter 选择，但可暂时保留旧路径作为 fallback

### 顺序 2：替换已知 Agent 的命令生成路径

- 已知 Agent 命中 descriptor 时跳过 `discoverToolHelp + LLM generate command`
- dry-run 使用 adapter 直接渲染预览

### 顺序 3：升级 preflight 与工具检测

- `tools agents --json` 返回 `installed / invocable / ready`
- `run-task` 在执行前验证真实入口

### 顺序 4：收敛任务执行 prompt

- 以合同为主输入重写任务 prompt builder
- 让文档路径从主输入退为补充输入

### 顺序 5：保留未知 CLI fallback

- fallback 仅服务自定义 Agent
- 输出命令必须经过协议校验和显式标记

## 取舍

| 方案 | 结论 | 原因 |
|------|------|------|
| 所有 Agent 都继续走 help + LLM 命令生成 | 放弃 | 已知协议不稳定，错误难前置发现。 |
| 每个 Agent 都在 `run-task` 中写 if/else | 放弃 | 扩展性差，难以测试和维护。 |
| 用 descriptor + adapter 固化协议，LLM 只处理任务语义或未知工具 fallback | 采用 | 符合合同优先、扩展稳定、验证明确。 |

## 风险

- 第一阶段会出现新旧路径并存，需要明确命中条件和 trace 标识。
- 某些 Agent CLI 的协议可能随版本变化，需要 descriptor 维护策略。
- 如果过早允许用户覆盖协议骨架，可能再次引入不可控漂移。

## 验证方式

- `run-task --tool codex` 不再通过 LLM 生成命令。
- `run-task --dry-run` 对已知 Agent 返回确定性预览。
- `tools agents --json` 能区分安装、入口可调用、任务可执行三层状态。
- 已知 Agent 的命令渲染具备单元测试，覆盖子命令、cwd、prompt transport、非交互参数。
- 任务 prompt builder 的输入显式依赖 `AgentTaskContract`，不再默认要求读取整份文档。

## 相关文档

- [Agent 执行系统设计](./agent-execution-system.md)
- [合同单一事实源设计](./contract-single-source.md)
- [插件与 CLI 边界设计](./plugin-cli-boundary.md)
- [Agent Worker 合同规格](../specs/agent-worker-contract.md)
- [CLI 命令面规格](../specs/cli-command-surface.md)
