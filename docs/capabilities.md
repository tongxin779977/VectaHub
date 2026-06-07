# 能力地图

> Document Status: Current Implementation / Partial Implementation Index
> Authority: 面向产品和读者的能力总览。字段级行为仍以链接到的命令文档、specs 和源码为准。

## 产品方向

VectaHub 当前最适合被理解成一个**单用户、本地优先的 NL Workflow Orchestrator**，自然语言编排、文档处理和可治理执行是它的核心优势。

它的主要价值不是“自己就是最聪明的 agent”，而是：

- 把模糊的用户意图变成结构化执行，
- 把大任务文档变成边界清楚的工作包，
- 协调本地工具和外部 Agent CLI，
- 让执行过程可看、可控、更安全、可恢复。

产品定位入口见 [NL Workflow Orchestrator](./nl-workflow-orchestrator.md)。详细产品设计见 [NL Workflow Orchestrator 产品设计](./design/nl-workflow-orchestrator-product-design.md)。

## 能力域

## 1. 交互式 CLI 与基础回复

**Status:** Current Implementation

VectaHub 通过 `chat` 提供本地交互会话，通过 `run` 提供自然语言执行路径。

当前范围：

- 交互式 chat 命令，
- session 历史和本地上下文构建，
- 意图路由，
- 结构化执行回复，
- 部分面向机器的命令支持 JSON 输出。

关键参考：

- [usage.md](./usage.md)
- [capabilities-reference.md](./capabilities-reference.md)
- [src/commands/chat.ts](../src/commands/chat.ts:17)
- [src/nl/session-manager.ts](../src/nl/session-manager.ts:309)

## 2. 文档处理与文档驱动执行

**Status:** Current Implementation

这是当前产品最强的部分之一。

当前范围：

- 解析任务文档，
- 提取任务片段，
- 构建 `AgentTaskContract`，
- 预览合同边界，
- 通过外部 Agent CLI 执行单个文档任务，
- 存储和查看 document-task run 记录，
- 做失败分类并提供恢复路径。

关键参考：

- [agent-execution.md](./agent-execution.md)
- [contracts/run-task-execution-contract.md](./contracts/run-task-execution-contract.md)
- [contracts/agent-worker-contract.md](./contracts/agent-worker-contract.md)
- [src/commands/run-task.ts](../src/commands/run-task.ts:2414)

## 3. 工作流编写与执行

**Status:** Current Implementation / Hardening Needed

VectaHub 可以从自然语言或 YAML/JSON 文件运行工作流。

当前工作流步骤类型：

- `exec`
- `if`
- `for_each`
- `parallel`
- `opencli`
- `delegate`

当前范围：

- 变量插值，
- 依赖感知执行，
- 基础控制流步骤，
- 执行历史和详情，
- rerun 和 resume，
- archive 流程，
- dry-run 预览路径。

当前边界：

- 主 workflow engine 当前以依赖校验、拓扑排序和顺序执行 loop 为核心。
- `parallel` 是 step 内并行，不应误写成完整 workflow 级统一并发调度已经完成。
- `delegate` 已进入类型和校验，但默认 executor 没有完整内建 handler，不能写成所有 workflow 路径都可直接执行多 Agent CLI。
- workflow 文件版本、保存前回读校验、执行定义快照仍是需要 hardening 的合同。

关键参考：

- [workflow-spec.md](./workflow-spec.md)
- [design/workflow-engine-architecture.md](./design/workflow-engine-architecture.md)
- [contracts/workflow-lifecycle.md](./contracts/workflow-lifecycle.md)
- [src/types/workflow.ts](../src/types/workflow.ts:1)
- [src/workflow/executor.ts](../src/workflow/executor.ts:1)

## 4. Agent CLI 注册与 Adapter 层

**Status:** Current Implementation / Migration Contract

VectaHub 已经有一层基于 registry 的 adapter 机制，用来接入部分外部 Agent CLI。

当前内建 descriptors：

- `codex`
- `claude`
- `gemini`
- `aider`

当前范围：

- descriptor 注册，
- 基于 adapter 的命令渲染，
- 部分 agent 的 runtime bootstrap，
- 机器可读的 `tools agents --json` 输出，
- 配置感知的权限与可用性探测。

当前边界：

- 现在是内建 registry，已经能看出向更丰富 runtime catalog 演进的痕迹，
- `custom` agent 仍是目标合同，
- workflow `delegate` 还没有默认接入完整 Agent Runtime 执行路径，
- 但它还不是一个完全动态、面向最终用户扩展的 onboarding 平台。

关键参考：

- [configuration.md](./configuration.md)
- [design/agent-cli-runtime-architecture.md](./design/agent-cli-runtime-architecture.md)
- [contracts/tools-security-management.md](./contracts/tools-security-management.md)
- [src/agent-runtime/factory.ts](../src/agent-runtime/factory.ts:14)
- [src/commands/tools.ts](../src/commands/tools.ts:1)

## 5. 编排、委托与任务拆解

**Status:** Partial Implementation

VectaHub 现在已经有一些真正可用的编排能力，但“多 agent 编排”这个说法必须谨慎使用。这里的正确目标是：先生成可审查计划，再落成 workflow draft，再通过 Agent Runtime 调度外部 Agent CLI。

当前已经实现的部分：

- 自然语言意图路由到可执行计划，
- workflow 级 `parallel` 执行，
- 工作流类型系统和文档里的 `delegate` step，
- 一个可进行 delegated tool loop 的 AI module，
- 一次 document-task 通过一个选定 Agent CLI 执行。

当前边界：

- workflow 的 `parallel` step 能做子步骤并行，
- document-task 编排是真实存在的，
- agent runtime 选择是真实存在的，
- plan proposal、artifact handoff、delegate execution 仍是目标合同，
- 但完整的 supervisor 风格多 agent planner、共享子 agent 状态、冲突管理、权威的并行 worktree 隔离，**还不能当作已完成产品能力来写**。

关键参考：

- [capabilities-reference.md](./capabilities-reference.md#编排委托与任务拆解)
- [design/orchestration-and-delegation-architecture.md](./design/orchestration-and-delegation-architecture.md)
- [src/workflow/parallel-executor.ts](../src/workflow/parallel-executor.ts:1)
- [src/skills/ai-modules/agent-delegate/agent-loop.ts](../src/skills/ai-modules/agent-delegate/agent-loop.ts:1)
- [workflow-spec.md](./workflow-spec.md)

## 6. 安全与命令治理

**Status:** Current Implementation

当前范围：

- token 级 danger detection，
- semantic 风险检查，
- 安全规则，
- 确认路径，
- sandbox mode 选择，
- 持久化前脱敏。

当前边界：

- 安全是产品核心支柱之一，
- sandbox 的语义和 fallback 行为必须以当前实现解释，不能只看宣传式措辞。
- `run-task` 的确认语义最清楚，后续应收敛到 chat、workflow 和 delegate。

关键参考：

- [contracts/tools-security-management.md](./contracts/tools-security-management.md)
- [contracts/security-permission-loop.md](./contracts/security-permission-loop.md)
- [design/safety-trace-recovery-architecture.md](./design/safety-trace-recovery-architecture.md)
- [src/security-protocol/manager.ts](../src/security-protocol/manager.ts:1)

## 7. Trace、Audit、执行记录与恢复

**Status:** Current Implementation

当前范围：

- audit logging，
- trace capture 和 query，
- execution records，
- output persistence，
- document-task run records，
- resume 和 recover 流程。

当前边界：

- 这一块已经很扎实，
- 但部分存储和执行收口语义仍在 hardening，文档里应该明确标出来。
- trace、execution record、artifact、recovery record 之间仍需要统一引用合同。
- workflow resume 需要补 workflow definition hash 或 snapshot guard。

关键参考：

- [contracts.md](./contracts.md)
- [contracts/trace-execution.md](./contracts/trace-execution.md)
- [contracts/recovery-loop.md](./contracts/recovery-loop.md)
- [design/safety-trace-recovery-architecture.md](./design/safety-trace-recovery-architecture.md)
- [src/infrastructure/trace-audit/system.ts](../src/infrastructure/trace-audit/system.ts:1)

## 8. 本地服务与集成层

**Status:** Secondary / Not Mainline

当前范围：

- daemon 命令集，
- 本地 socket server，
- API server 代码路径，
- VS Code extension workspace，
- import/export 路径。

当前边界：

- 这些能力确实存在，作为本地服务层和集成层是成立的，
- 但它们是本机适配层，不是成熟的多用户服务平台，
- 当前不属于 NL Workflow Orchestrator 主产品面，
- VS Code、API、socket client 应调用 CLI core 或共享合同，不应复制执行逻辑，
- import/export 是备份和迁移辅助能力，不是完整跨版本迁移系统。

目标方向：

```text
VS Code / local script / client / API
-> Local Integration Layer
-> CLI Core
-> Safety / Trace / Recovery
-> Structured Result
```

关键参考：

- [ui/vscode-extension.md](./ui/vscode-extension.md)
- [src/daemon/socket-server.ts](../src/daemon/socket-server.ts:1)
- [src/api/server.ts](../src/api/server.ts:1)
- [design/module-scope-cleanup.md](./design/module-scope-cleanup.md)

## 下一步建议阅读

- 看 [capabilities-reference.md](./capabilities-reference.md) 了解当前功能细节。
- 看 [usage.md](./usage.md) 了解命令入口和示例。
- 看 [architecture.md](./architecture.md) 了解当前仓库结构。
- 看 [contracts.md](./contracts.md) 了解核心合同和规格索引。
