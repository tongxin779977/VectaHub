# 编排、委托与任务拆解架构设计

> Document Status: Design / Partial Implementation Map
> Authority: 本文解释 VectaHub 如何把交互意图、文档任务、workflow engine 和 Agent CLI Runtime 组合成“小马拉大车”的编排能力。字段级 workflow 语法见 [Workflow 规格](../workflow-spec.md)，Agent Runtime 细节见 [Agent CLI 注册与 Runtime 架构设计](./agent-cli-runtime-architecture.md)。

## 定位

编排层不是新的执行引擎。

它是一个上层策略层，负责把用户意图或文档任务拆成可确认、可执行、可恢复的步骤，再交给 workflow engine、Agent Runtime、文档任务执行链路和安全系统。

推荐理解：

```text
User Intent / Document Task
-> Task Decomposition
-> Plan Proposal
-> User Confirmation
-> Workflow Draft
-> Agent Runtime Delegation
-> Artifact Handoff
-> Verification
-> Recovery
```

这层的目标是“小 CLI 调度多个强 Agent CLI”，不是 autonomous swarm。

## 当前能力事实

当前已经存在的积木：

- 自然语言可以进入 `run`，并被路由为 execution plan 或 workflow steps。
- `chat` 可以生成 pending workflow，并在确认后执行。
- 文档任务可以通过 `parse-doc -> run-task -> AgentTaskContract` 进入 Agent 执行链路。
- workflow engine 支持 `exec`、`if`、`for_each`、`parallel`、`opencli`、`delegate` 类型。
- Agent Runtime 已有内建 descriptors 和 adapters。
- delegated AI module 可以让 LLM 通过一组受限工具执行内部 loop。
- trace、audit、execution record、verification、recovery 已经存在基础设施。

当前必须谨慎描述的能力：

- `delegate` 还不是默认 workflow executor 中完整内建的 Agent Runtime handler。
- workflow artifact 合同还不是正式 `Step` 字段。
- 多 Agent planner、共享状态、冲突管理、隔离 worktree 还不是成熟产品能力。
- `chat auto`、自然语言直接执行和 workflow proposal 的边界还需要进一步收紧。
- 当前文档任务执行通常是一条任务选择一个 Agent CLI，不是完整 supervisor 多 Agent 协作。

## 核心原则

### Plan First

多步骤任务必须先形成可读计划，而不是直接执行。

计划至少应说明：

- 目标是什么。
- 拆成哪些子任务。
- 每个子任务用什么能力执行。
- 哪些步骤会写文件或运行命令。
- 哪些步骤需要确认。
- 输出交给谁。
- 失败后如何恢复。

### Confirmation Before Side Effects

任何有副作用的步骤都应在执行前进入明确确认边界。

确认对象不是一句泛泛的“是否继续”，而是：

- 将执行哪些步骤。
- 哪些 Agent CLI 会被调用。
- 哪些文件或目录可能被读写。
- 是否会运行验证命令。
- 是否会产生 artifact。

### Workflow As Execution Plan

复杂任务最终应落成 workflow draft。

这样做的好处：

- 可以保存。
- 可以审查。
- 可以 dry-run。
- 可以 resume / rerun。
- 可以记录 execution record。
- 可以逐步接入多 Agent delegation。

### Agent As Worker

Agent CLI 是 worker，不是状态真相源。

VectaHub 负责：

- 选择 Agent。
- 构建任务输入。
- 控制执行生命周期。
- 记录输出摘要。
- 运行验证。
- 分类失败。
- 恢复或要求人工处理。

### Artifact For Large Handoff

短输出可以走 `outputVar`。

长文档、研究材料、审查结果、patch 说明、上下文包应该走 artifact。

## 拆解模型

推荐把任务拆成四类子任务：

| 子任务类型 | 说明 | 推荐执行方式 |
|------------|------|--------------|
| `reply` | 只需要解释、回答、澄清。 | chat reply，不进入 workflow。 |
| `inspect` | 读取、搜索、收集信息。 | `opencli`、只读 `exec`、Agent CLI。 |
| `transform` | 整理文档、生成计划、重写内容。 | Agent CLI 或本地脚本。 |
| `apply` | 写文件、改代码、执行命令。 | workflow step，必须确认。 |
| `verify` | 运行测试、lint、typecheck 或审查。 | `exec` 或 Agent CLI。 |
| `recover` | 基于失败记录修复或重试。 | recovery loop 或 bounded fix workflow。 |

拆解结果不应直接等于执行。

它应该先变成 `PlanProposal`。

## PlanProposal 目标合同

推荐目标结构：

```ts
interface PlanProposal {
  schemaVersion: '1.0';
  intentId: string;
  source: 'chat' | 'run' | 'document' | 'manual';
  goal: string;
  assumptions: string[];
  requiredConfirmations: ConfirmationRequest[];
  tasks: PlanTask[];
  workflowDraft?: WorkflowDraftSummary;
  risks: RiskSummary[];
}
```

```ts
interface PlanTask {
  id: string;
  kind: 'reply' | 'inspect' | 'transform' | 'apply' | 'verify' | 'recover';
  title: string;
  recommendedExecutor: 'local' | 'workflow' | 'agent' | 'human';
  delegateTo?: string;
  dependsOn?: string[];
  inputs: string[];
  outputs: string[];
  artifactInputs?: string[];
  artifactOutputs?: string[];
  sideEffect: 'none' | 'read' | 'write' | 'command' | 'network';
  confidence: 'low' | 'medium' | 'high';
  needsConfirmation: boolean;
}
```

注意：这是目标合同，不代表当前源码已经完整实现。

## 编排路径

### Chat 路径

chat 应优先判断用户输入属于哪一类：

- 普通回复。
- 需要澄清。
- 生成计划。
- 生成 workflow draft。
- 执行已确认 workflow。
- 显式 shell / command 请求。

推荐边界：

- 普通 chat 不直接执行。
- 生成 workflow 后进入 pending workflow。
- 执行必须来自明确动作，例如 `/execute`、确认 `y` 或明确“执行上一个工作流”。
- `auto` 不应作为普通 chat 默认模式。

### Document 路径

文档任务应优先进入文档编译管线：

```text
Document
-> ParsedTaskCandidate
-> AgentTaskContract
-> PlanProposal
-> Workflow Draft
-> Execution
```

如果任务只有一个明确边界，可以走 `run-task`。

如果任务包含多个阶段，例如“调研 -> 写文档 -> 修改代码 -> 验证”，应生成 workflow draft，而不是隐藏在单次 Agent 调用里。

### Workflow 路径

workflow 是编排层的主要落点。

推荐规则：

- 有多个步骤时，优先生成 workflow draft。
- 有依赖关系时，使用 `dependsOn`。
- 短输出用 `outputVar`。
- 大输出用 artifact。
- Agent CLI 执行用 `delegate`。
- 本地命令用 `exec`。
- 并行只在边界清晰、输出不冲突时使用。

## 多 Agent 分工

不同 Agent CLI 应按能力分工，而不是平均分配任务。

示例策略：

| 任务 | 推荐 Agent |
|------|------------|
| 快速问答、解释、初稿 | `gemini` 或轻量 Agent |
| 深度代码修改、测试、仓库操作 | `codex` |
| 大范围代码理解和重构建议 | `claude` |
| 代码编辑协作 | `aider` |
| 网站或外部信息收集 | `opencli` 或专用 CLI |

选择 Agent 时应读取 Agent Runtime Catalog，而不是写死在 prompt 里。

## Artifact Handoff

多 Agent 编排必须有明确交接物。

推荐 artifact 类型：

- `research_notes`
- `doc_draft`
- `implementation_plan`
- `patch_summary`
- `test_report`
- `review_findings`
- `recovery_plan`

artifact 规则：

- 每个 artifact 必须有 producer step。
- consumer step 必须显式声明读取它。
- artifact 应绑定 execution id。
- artifact 应有摘要和 hash。
- 不保存 secrets、完整 prompt、完整 trace、完整 diff。

## 并发规则

并行不是默认。

允许并行的条件：

- 任务之间没有文件写冲突。
- 依赖关系清楚。
- artifact 输出不覆盖。
- 验证命令不会互相污染。
- 失败后能解释哪个分支导致问题。

必须串行的情况：

- 多个 Agent 可能改同一文件。
- 一个步骤依赖另一个步骤的语义判断。
- 需要用户先确认前一步结果。
- git diff 归因不清楚。

## 失败与恢复

编排层必须把失败归到具体阶段：

- decomposition failed
- confirmation denied
- runtime unavailable
- preflight failed
- delegate failed
- artifact missing
- verification failed
- unclosed execution
- recovery blocked

恢复策略：

- 没有副作用：可以重新生成计划或重新执行。
- 有副作用但未收口：必须基于现有 diff 做 bounded fix，不能从头覆盖。
- workflow 定义变化：默认阻断自动 resume。
- artifact 缺失：阻断下游 step，并提示重新生成 producer step。
- Agent 不可用：可建议替换 Agent，但需要重新确认计划。

## 非目标

当前不应该做：

- 完整 autonomous swarm。
- 多 Agent 共享长期黑盒记忆。
- 自动冲突合并。
- 分布式任务队列。
- 多用户协作权限模型。
- Agent marketplace 自动推荐和安装。

## 阶段路线

### Phase 1: Plan Proposal

目标：

- 把 chat / run 的复杂意图先生成 plan proposal。
- 区分 reply、clarify、workflow proposal、execute request。
- 所有副作用前需要确认。

### Phase 2: Workflow Draft

目标：

- 将多步骤计划落成 workflow draft。
- 支持保存、dry-run、人工编辑。
- `delegate` 仍可先作为目标合同展示。

### Phase 3: Delegate Execution

目标：

- workflow `delegate` 接入 Agent Runtime。
- 支持 Agent CLI preflight、renderer、timeout、outputVar。

### Phase 4: Artifact Handoff

目标：

- 引入 artifact contract。
- 支持大输出在多 Agent 之间交接。

### Phase 5: Recovery-Oriented Orchestration

目标：

- Plan、workflow、execution record、artifact、recovery record 可互相引用。
- 失败后能给出结构化恢复计划。

## 架构师收口

VectaHub 的编排层应该坚持“小而硬”：

- 用计划压住模糊意图。
- 用 workflow 承载多步骤执行。
- 用 Agent Runtime 调度外部 Agent CLI。
- 用 artifact 交接大上下文。
- 用 verification 和 recovery 兜住失败。

不要把它做成一个“看起来很智能但不可审计”的 swarm。
