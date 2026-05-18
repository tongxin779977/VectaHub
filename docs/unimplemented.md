# 未实现项总表

> Document Status: Migration Contract
> Authority: This document collects implementation gaps, target-only capabilities, and hardening backlog. It does not redefine runtime contracts.
> Sources: `docs/roadmap.md`, `docs/specs/implementation-traceability.md`, and the authoritative design/spec documents linked below.

## 目标

本文档用于把“已经写进设计或规格、但当前尚未完整实现”的内容收敛到一个维护者入口，避免未实现项分散在路线图、设计文档、规格文档和代码注释里。

它回答三个问题：

- 现在还有哪些能力没有实现或没有收口。
- 每个缺口的权威文档和代码入口在哪里。
- 下一步应该优先补什么，避免在错误层面反复加功能。

本文档是索引，不是事实源。字段语义、状态语义和命令合同仍以对应规格文档为准。

## 纳入规则

只有满足以下任一条件的事项才应进入本文档：

- 已出现在 `Target Design` 文档中，但当前没有完整代码入口或验证入口。
- 已有部分实现，但仍处于 `Migration Contract`，存在明确兼容字段、旧语义或未收口流程。
- 已被路线图标记为近期 hardening、补测、隔离层或 UI 收口项。

以下内容不应放进本文档：

- 纯历史记录。
- 尚未进入设计/规格的想法。
- 局部实现细节里的微小 TODO。
- 已经有代码和验证闭环、且不再影响架构判断的完成项。

## 状态定义

| 状态 | 含义 | 处理方式 |
|------|------|----------|
| `Target Design` | 目标能力已被设计文档定义，但当前不能当作可用能力。 | 需要补实现入口、测试入口和迁移计划。 |
| `Migration Contract` | 已有部分实现，但还保留旧字段、旧路径或未统一语义。 | 需要先收敛事实源，再清理兼容层。 |
| `Hardening Backlog` | 主能力存在，但可靠性、性能、安全、验证或 UX 还没有达到可收口状态。 | 需要补基线、回归、测量或 UI 闭环。 |

## 未实现项清单

| Area | Item | Status | Current Reality | Target Outcome | Authority | Code / Entry | Verification Gap | Suggested Next Step |
|------|------|--------|-----------------|----------------|-----------|--------------|------------------|---------------------|
| Agent Runtime | Unified dynamic Agent registry | `Target Design` | `tools agents` 仍组合内建 descriptor、`external_cli` 配置和运行探测结果。 | 所有 Agent runtime definition 统一由一个动态 registry 驱动。 | `docs/design/agent-execution-system.md`, `docs/specs/tools-security-management.md` | `src/commands/agent-cli-adapter.ts`, `src/setup/cli-scanner.ts`, `src/commands/tools.ts` | 缺少 registry 专属实现和回归测试。 | 先抽出 registry 数据模型和持久化边界，再替换当前 descriptor/config 拼装路径。 |
| Agent Runtime | Agent Runtime Catalog | `Target Design` | 没有稳定、可派生给 LLM 的统一 Agent catalog。 | 为 CLI、插件和 LLM 提供统一的 Agent 摘要视图。 | `docs/design/agent-execution-system.md`, `docs/specs/implementation-traceability.md` | future registry-derived catalog module | 缺少 catalog 构建与红线字段测试。 | 以 registry record 派生只读 catalog，明确可暴露字段和脱敏规则。 |
| VectaHub Runtime | VectaHub Capability Catalog | `Target Design` | 当前没有中央能力目录，LLM 对项目命令能力理解不稳定。 | LLM 能结构化理解 `run-task`、`recover-task`、`tools agents` 等能力。 | `docs/design/agent-execution-system.md`, `docs/specs/cli-command-surface.md` | future `src/nl/context/*` | 缺少 capability catalog 数据源和测试。 | 从 CLI command surface 派生 capability schema，而不是手写长 prompt。 |
| LLM Context | LLM Context Pack injection | `Target Design` | 设计已定义，但未稳定注入 `run-task`、chat、NL fallback、onboarding 辅助流程。 | 所有 LLM 调用统一消费同一份 context pack。 | `docs/specs/run-task-execution-contract.md`, `docs/specs/agent-worker-contract.md`, `docs/design/agent-cli-adapter-architecture.md` | future `src/nl/context/*`, `src/nl/llm.ts`, `src/nl/core/pipeline.ts`, `src/commands/run-task.ts` | 缺少 relevance、redaction 和调用面一致性测试。 | 先定义 context pack builder，再分入口接入并补红线测试。 |
| Invocation | Registry-backed generic renderer | `Migration Contract` | 代码里仍有 `adapter` 术语和迁移期路径。 | 调用渲染完全由 registry 数据驱动，不再依赖已注册 Agent 的 LLM command generation。 | `docs/design/agent-execution-system.md`, `docs/specs/run-task-execution-contract.md` | `src/commands/agent-cli-adapter.ts`, `src/commands/run-task.ts` | 还没有完成语义命名和旧路径清理。 | 先把 runtime schema 与 renderer schema 固化，再迁移诊断字段。 |
| Runtime | Runtime bootstrap and config-source handling | `Migration Contract` | `bootstrapAgentRuntime()` 已成为统一 bootstrap 入口，并已接入 `run-task` 与 `cli-scanner`；当前也已经通过 `envPatch` 把运行时 home 注入到后续调用链，并开始收敛“条件 bootstrap 未命中时保持直接继承用户环境”的语义，但 config-source / writable home 的迁移事实源仍未完全收口。 | 统一的 runtime bootstrap、条件启用规则与配置源处理收口到同一迁移合同。 | `src/commands/agent-runtime-bootstrap.ts`, `src/commands/run-task.ts`, `src/setup/cli-scanner.ts`, `src/commands/agent-cli-adapter.ts` | 缺少跨入口回归矩阵，验证 `envPatch`、bootstrap 文件拷贝、条件启用判定和配置源选择在 `run-task`、`cli-scanner` 中保持一致。 | 先补跨入口回归与迁移收口测试，再继续清理旧配置路径。 |
| Execution | Mediated interactive Agent execution | `Target Design` | 项目尚未提供通用 PTY runner + approval broker 执行层。 | 不能 headless 的 Agent 也能纳入受控执行链。 | `docs/design/agent-execution-system.md`, `docs/specs/tools-security-management.md` | future PTY runner / approval broker modules | 缺少端到端执行与确认链测试。 | 先做 executionMode 状态机和 approval brokerage contract，再落执行器。 |
| Tools Surface | `tools agents` target subcommands and fields | `Migration Contract` | 当前只有 `tools agents` / `--json` / `--sync-config`；目标子命令和字段未实现。 | 支持 `show`、`onboard`、`reprobe`、`disable`、`remove`，并输出 `executionMode`、`issues`、`capabilities`、`constraints`、`llmSummary`。 | `docs/specs/tools-security-management.md`, `docs/specs/cli-command-surface.md` | `src/commands/tools.ts`, `src/setup/cli-scanner.ts` | 当前 JSON 未完整提供目标字段。 | 先升级 JSON schema，再逐步补子命令。 |
| Agent Contract | Full prompt-boundary integration | `Migration Contract` | `AgentTaskContract` 已接入，但 prompt builder 还没有完整接入 context pack。 | 任务边界、Agent 选择和项目能力选择统一由结构化合同驱动。 | `docs/specs/agent-worker-contract.md` | `src/commands/agent-task-contract.ts`, `src/commands/run-task.ts`, `packages/doc-task-contract-core/` | 缺少 prompt builder 层集成测试。 | 先补 builder contract，再把文档片段、能力摘要和边界摘要统一拼装。 |
| Recovery | Doc-task recovery decision contract and trace linking | `Migration Contract` | 已有 `recover-task`、`rerun` / `resume`、运行记录、`failureKind`、`traceId` 和 `self-healing` 原型，但失败后仍没有统一 `recoveryDecision` 结构，恢复 trace 与原始 trace 也没有正式关联合同。 | 文档任务失败后能稳定得到结构化恢复决策、trace 关联、插件分流和 doc-task scoped self-healing 边界。 | `docs/specs/recovery-loop.md`, `docs/specs/doc-task-state-machine.md`, `docs/specs/trace-execution.md` | `src/commands/recover-task.ts`, `src/commands/self-healing.ts`, plugin doc-task run/update paths | 缺少恢复决策矩阵测试、恢复 trace linking 测试、`currentHash unavailable` 保守阻断测试。 | 先固化 `recoveryDecision` 数据合同和 trace linking 规则，再把插件分流和恢复执行入口收敛到同一模型。 |
| Run-Task | Agent runtime mode naming migration | `Migration Contract` | `run-task` 已支持完成/恢复语义，但目标 execution mode 命名尚未完全迁移到代码层。 | `native_headless`、`mediated_interactive`、`manual_only` 成为统一 runtime 语义。 | `docs/specs/run-task-execution-contract.md` | `src/commands/run-task.ts`, `src/commands/recover-task.ts` | 缺少迁移命名回归测试。 | 在不破坏现有 JSON 兼容的前提下增加目标字段并补映射测试。 |
| Run-Task | Closeout and recovery-matrix hardening | `Hardening Backlog` | `run-task` 已支持 `close` / `exit-stream-drain` / `exit-flush-grace` / `timeout`，但高风险验证命令确认尚未完全收敛到统一执行前确认合同，插件侧 trace 对“已写盘但未收口”表达也仍偏弱，文档与实现的完成边界矩阵还需继续对齐。 | CLI、插件、trace 和文档对 closeout、`unclosedExecution`、确认语义和恢复建议使用同一套矩阵。 | `docs/specs/run-task-execution-contract.md`, `docs/specs/trace-execution.md` | `src/commands/run-task.ts`, `src/commands/recover-task.ts`, plugin trace and task-run paths | 缺少 closeout matrix 回归、插件侧未收口表达测试、高风险验证确认路径测试。 | 先把 closeout / confirmation / recovery matrix 固化成可断言合同，再补 CLI 与插件双端回归。 |
| Shared Contract | CLI / plugin shared contract convergence | `Migration Contract` | 已有共享包，但插件端仍有部分派生逻辑残留；CLI 运行态 digest 的权威来源仍未完全收口，旧记录缺少完整 hash 因子时也还需要统一保守阻断语义。 | 合同推导长期只保留单一纯函数事实源，运行态 digest、instructionHash 和旧记录降级语义一致。 | `docs/design/contract-single-source.md`, `docs/specs/agent-worker-contract.md`, `docs/specs/recovery-loop.md` | `packages/doc-task-contract-core/`, `packages/vectahub-vscode-extension/src/project/docTaskContract.ts`, CLI contract/hash paths | 缺少 authoritative digest unavailable、旧记录 hash 因子缺失、CLI/插件合同因子一致性的系统回归。 | 继续把插件端推导下沉到共享包或 CLI 结构化预览，并把 digest/hash unavailable 的保守行为变成显式测试矩阵。 |
| Performance | P5 performance hardening and baseline | `Hardening Backlog` | 性能预算文档存在，但路线图仍要求补实测基线；当前仍有重复 IO、`DocTaskDocIndex` 保留完整内容、`latest.json` 高频写入未做 batch flush、CLI 冷启动尚未达到“顶级作用域零副作用”的最严格红线。 | 启动、内存、IO 和关键链路有可重复测量方法，并且关键热点有明确收敛策略。 | `docs/roadmap.md`, `docs/specs/performance-budget.md`, `docs/specs/recovery-loop.md` | performance measurement scripts / tests pending, plugin doc index/store paths, CLI bootstrap paths | 缺少稳定基准、batch flush 回归、重复 IO 消除证明和冷启动门槛测试。 | 先定义测量命令、样本输入和通过阈值，再分别补 batch flush、文档索引瘦身和 cold-start 守门。 |
| Security | P4 security loop hardening | `Hardening Backlog` | 安全闭环已有规格，但 CLI / 插件一致性和回归基线仍待补齐；高风险验证命令确认仍未完全和 `run-task` 执行前确认矩阵收敛，专项文档对“已完成”和“待 hardening”范围也还有漂移。 | 风险识别、确认语义、脱敏和失败分类在多入口保持一致，并有稳定回归定义。 | `docs/roadmap.md`, `docs/specs/security-permission-loop.md`, `docs/specs/run-task-execution-contract.md` | current CLI/plugin security paths | 缺少跨入口一致性回归、确认路径矩阵测试和文档/实现对齐检查。 | 先补 CLI 与插件共享判定样例，再收敛高风险验证确认路径，并清理专项文档中的过时“待开发”表述。 |
| Isolation | P5.5 isolated worktree execution layer | `Target Design` | 目前没有通用工作区隔离执行层。 | 并发任务能获得更稳的 git diff 归因和清理策略。 | `docs/roadmap.md` | future isolated worktree modules | 缺少设计落实和验收合同。 | 先补设计文档和清理语义，再进入实现。 |
| UI | P7 plugin visualization experience | `Hardening Backlog` | 插件功能存在，但 trace、重试、验证和恢复的可视化入口未完整收口。 | 插件具备稳定的任务态可视化和恢复操作入口。 | `docs/roadmap.md`, `docs/design/vscode-ui-logic.md` | `packages/vectahub-vscode-extension/` | 缺少 UI 验收和交互回归。 | 等恢复语义稳定后，再按 UI 逻辑设计推进落地。 |

## 推荐优先级

若目标是尽快让“Agent CLI + LLM + VectaHub 控制面”形成闭环，建议按以下顺序推进：

1. `Unified dynamic Agent registry`
2. `Registry-backed generic renderer`
3. `tools agents` target fields and subcommands
4. `LLM Context Pack injection`
5. `VectaHub Capability Catalog`
6. `Mediated interactive Agent execution`

若目标是先把当前主链路做稳，建议按以下顺序推进：

1. `P5 performance hardening and baseline`
2. `P4 security loop hardening`
3. `Closeout and recovery-matrix hardening`
4. `Doc-task recovery decision contract and trace linking`
5. `CLI / plugin shared contract convergence`
6. `Agent runtime mode naming migration`
7. `P7 plugin visualization experience`

## 维护规则

- 每当某个 `Target Design` 或 `Migration Contract` 项进入实现阶段，先更新权威 spec，再更新本文档状态。
- 某项关闭前，必须至少补齐代码入口或验证入口之一；最好两者同时存在。
- 若某项被拆成多个子任务，应在对应 spec 或 roadmap 中细分，不要把本文档变成流水账任务列表。
- 若某项被证明不再需要，应在权威文档中先删掉目标设计，再从本文档移除。
