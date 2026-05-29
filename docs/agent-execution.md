# Agent 执行系统

> Document Status: Current Reference / Partial Implementation Summary
> Authority: Execution-system overview for document-task and Agent-run flows. Exact execution behavior belongs to [Run-Task 执行合同规格](./contracts/run-task-execution-contract.md) and current code.
> Recommended Read Order: [Capability Map](./capabilities.md) -> [Capability Reference](./capabilities-reference.md) -> 本文 -> 相关 specs

## 核心模型

VectaHub 的 Agent 执行系统遵循一个简单分工：

```text
Agent = Worker
VectaHub = Orchestrator
```

Agent 负责执行边界清楚的小任务。VectaHub 负责把任务拆解成合同，控制执行生命周期，记录状态和 trace，执行安全评估，运行验证命令，并在失败后提供恢复路径。

`run-task` 的完整执行语义以 [Run-Task 执行合同规格](./contracts/run-task-execution-contract.md) 为准；本文只保留执行系统层面的总览。

如果 Agent 已经启动，但在其内部本地命令层被环境阻断，VectaHub 必须先把这类问题收敛为系统类失败，而不是误把它推进到验证阶段。

## 执行链路

```text
Document / Natural Language
  -> Parse Task
  -> Build AgentTaskContract
  -> Resolve Agent Runtime
  -> Runtime Bootstrap / Preflight
  -> Security Preflight
  -> Run Agent
  -> Collect Changes
  -> Run Verification
  -> Persist TaskRun
  -> Recovery / Resume when needed
```

任何阶段失败都必须进入结构化失败分类，不能只返回 `failed`。

## Agent Runtime 解析

Agent 执行前必须先解析 Agent Runtime。

当前项目已经有内建 Agent registry 和 adapter 层，覆盖：

- `codex`
- `gemini`
- `claude`
- `aider`

它们的职责是描述外部 Agent CLI 的入口命令、prompt 传递方式、cwd 参数、非交互 flags、preflight 规则和 runtime bootstrap policy。

目标链路：

```text
AgentTaskContract
-> Agent Registry
-> Runtime Catalog
-> Invocation Renderer
-> Runtime Bootstrap
-> Preflight
-> Spawn
```

关键边界：

- 已注册 Agent 的最终 argv 应由 registry-backed renderer 生成。
- LLM 可以选择 Agent 或生成任务语义，但不能为已注册 Agent 发明最终命令行协议。
- `tools agents --json` 应逐步成为机器可读 runtime catalog。
- custom Agent 第一版应要求显式 descriptor，不应自动变成 marketplace。

设计细节见 [Agent CLI 注册与 Runtime 架构设计](./design/agent-cli-runtime-architecture.md)。

## 编排入口

当任务不是单一 Agent 工作包，而是包含多个阶段时，应先进入编排层。

目标链路：

```text
User Intent / Document Task
-> Plan Proposal
-> Workflow Draft
-> Agent Runtime Delegation
-> Artifact Handoff
-> Verification
-> Recovery
```

边界：

- 单个明确文档任务可以直接进入 `run-task`。
- 多阶段任务应生成 workflow draft。
- 普通回复或澄清不应进入执行链路。
- 多 Agent 任务必须有明确交接物，不能只靠隐式上下文。

设计细节见 [编排、委托与任务拆解架构设计](./design/orchestration-and-delegation-architecture.md)。

## 文档处理入口

文档任务进入 Agent 执行前，目标上应先经过文档编译管线：

```text
Document
-> ParsedDocument / SourceMap
-> ParsedTaskCandidate
-> AgentTaskContract
-> Confirmed Task Contract
-> Agent / Workflow execution
```

当前实现已经具备 `parse-doc -> run-task -> AgentTaskContract -> verification -> recovery` 的骨架，但 `parse-doc` 输出仍偏薄，主要是 `id` 和 `label`。因此现阶段 `run-task` 仍会根据 `taskId` / `label` 回扫文档片段并推导边界。

目标架构见 [文档处理架构设计](./design/document-processing-architecture.md)。后续收敛方向是：

- `parse-doc` 输出带 source map 的任务候选。
- 用户先预览、确认或编辑任务合同。
- `run-task` 消费确认后的合同。
- 多 Agent CLI 文档任务链路进入 workflow，而不是隐藏在单次 Agent 调用里。
- 文档解析、合同构建、执行、验证和恢复共享 trace 关联。

## 状态来源

VectaHub 必须掌控以下状态：

- 任务定义状态。
- 任务运行状态。
- trace 关联。
- git change 摘要。
- 验证结果。
- 恢复记录。
- instruction hash / digest 可用性。
- 文档来源位置和 source map。
- task contract version。

Agent 输出不是状态来源。Agent 只能提供执行产物和诊断材料。

## 阶段边界

| 阶段 | 目标 | 当前判断 |
|------|------|----------|
| P0 Trace | 贯通插件、CLI、Agent 和验证链路。 | 已有第一版，仍需 hardening。 |
| P1 状态机 | 为文档任务建立持久化运行状态和失败分类。 | 可作为稳定基线。 |
| P2 Agent Worker 化 | 建立 AgentTaskContract 和任务边界。 | 已有第一版，需收敛单一事实源。 |
| P3 验证闭环 | Agent 成功后自动运行验证命令。 | 已有第一版，需补回归。 |
| P4 安全闭环 | 风险评估、确认拦截和脱敏。 | 已有第一版，需统一 CLI/插件判断。 |
| P5 性能与资源 | 降低重复读取、大输出和启动成本。 | 已有第一版，缺实测基线。 |
| P6 自愈与恢复 | 根据失败分类、hash 和 trace 恢复任务。 | 主链路成型，需收口 authoritative hash。 |
| P7 插件体验 | 提供 trace、恢复、验证等自助入口。 | 不应早于 P6 语义稳定。 |

“已有第一版”不是完成声明。每个阶段进入稳定基线前必须有回归测试、边界说明和真实验证。

## 并发原则

默认串行。只有在以下条件满足时才能并发：

- 合同中的 `allowedFiles` / `forbiddenFiles` 可计算。
- 文件范围不重叠。
- 验证命令不会互相污染状态。
- git diff 归因可解释。

边界未知或文件范围重叠时，必须降级串行。未来可以通过 isolated worktree 解决并发 diff 归因问题。

## 失败分类

失败必须尽量归因到具体类型：

| 类型 | 含义 |
|------|------|
| `failed_config` | Agent CLI、权限、配置或文档路径不可用。 |
| `failed_agent` | Agent 子进程或外部 CLI 执行失败。 |
| `failed_json_protocol` | CLI JSON 协议破坏或解析失败。 |
| `failed_timeout` | 命令或 Agent 超时。 |
| `failed_test` | 验证命令失败。 |
| `failed_conflict` | git diff 或输出中出现冲突。 |
| `failed_system_internal` | IO、记录写入、验证工具等系统异常。 |

这里也包括 Agent 内部本地命令工具无法启动、代码读取被阻断、`sandbox_apply` 失败等“Agent 已启动但未真正落地执行”的环境问题。
| `needs_confirmation` | 需要用户确认；必须区分执行前确认与执行后确认。 |
| `cancelled` | 用户取消或取消信号触发。 |

## 恢复原则

恢复不能只看任务 id。恢复前必须确认：

- 当前任务说明是否与历史记录匹配。
- authoritative `instructionHash` 是否可用。
- 当前 `AgentTaskContract` 版本是否兼容。
- 文档 source hash 是否与历史记录一致。
- git 工作区是否存在冲突或不相关改动。
- 上次失败是否属于可恢复类型。
- 验证命令是否仍然有效。

hash 或 digest 不可用时必须保守处理，不能用 guessed digest 误判需求未变。

未收口执行不能直接自动重试。如果 Agent 已经产生 `gitChanges`，但执行未完成权威收口，恢复应进入基于现有 diff 的 bounded fix task，不能从头覆盖现场。

安全、trace、执行记录和恢复的统一设计见 [安全、Trace、执行记录与恢复架构设计](./design/safety-trace-recovery-architecture.md)。该设计的核心是：

- 副作用前先确认。
- 副作用后先审查。
- 记录只存摘要和引用。
- 失败先分类，再决定动作。
- 上下文过期就阻断。

## 关键规格

- [文档任务状态机规格](./contracts/doc-task-state-machine.md)
- [Run-Task 执行合同规格](./contracts/run-task-execution-contract.md)
- [Agent Worker 合同规格](./contracts/agent-worker-contract.md)
- [Agent CLI 注册与 Runtime 架构设计](./design/agent-cli-runtime-architecture.md)
- [安全、Trace、执行记录与恢复架构设计](./design/safety-trace-recovery-architecture.md)
- [Trace 执行规格](./contracts/trace-execution.md)
- [任务验证闭环规格](./contracts/verification-loop.md)
- [安全与权限闭环规格](./contracts/security-permission-loop.md)
- [性能与资源预算规格](./contracts/performance-budget.md)
- [恢复闭环规格](./contracts/recovery-loop.md)
