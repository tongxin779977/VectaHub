# NL Task Contract Migration Plan

> Document Status: Migration Plan / Review Draft
> Authority: 说明现有 NL 主链路如何从 `intent-first` 逐步迁移到 `TaskContract-first`。目标设计以 [NL Task Contract Redesign](./nl-task-contract-redesign.md) 为准。
> Last Verified: 2026-06-09

## Scope

本迁移计划只覆盖 NL 主链路相关模块：

- `src/nl/templates/index.ts`
- `src/nl/tool-calling.ts`
- `src/nl/core/category-router.ts`
- `src/nl/orchestrator.ts`
- `src/commands/chat.ts`
- `src/chat/repl.ts`
- `src/chat/nl-handler.ts`
- `src/commands/run-dispatch.ts`

不在本阶段内：

- workflow engine 重写
- capability router 全量重构
- Agent runtime 协议重写
- VS Code UI 重构

## Current Problems

### 1. Intent Metadata Is Split

当前至少存在四份含义相近但彼此独立的定义：

- `INTENT_TEMPLATES`
- `EXTRA_INTENT_MAPPINGS`
- `config/commands/intents.yaml`
- `CATEGORY_MAP`

迁移原则：

- 不再新增第五份定义。
- 迁移期间任何新 NL 能力都必须先声明最终要落到哪一份权威结构。

### 2. Command Surface Is Hand-Coded In Multiple Places

当前 `vectahub` 子命令能力既来自真实 CLI registry，也来自 tool-calling 手写映射，还来自 `run-dispatch` 的拦截白名单。

迁移原则：

- 所有可执行 surface 最终应从真实 CLI registry 或 capability catalog 派生。
- 手写白名单只允许作为过渡兼容层，不能继续扩张。

### 3. Chat Has Two Product Paths

当前存在：

- `src/commands/chat.ts`
- `src/chat/repl.ts`

两套入口分别解释 NL 输出，产品语义不一致。

迁移原则：

- 最终只能有一条用户可见 NL 主链。
- 在完成合并前，任何新能力都应优先接到共享合同层，而不是分别接两套 UI。

## Target State

推荐主链路：

```text
User Input
-> Semantic Task Modeling
-> TaskContract
-> Strategy Resolver
-> Validation
-> Execution / Reply / Clarify / Block
-> Presentation Model
```

映射关系：

```text
intent/template/tool-call/capability
-> internal signals
-> TaskContract
-> execution strategy
-> runtime action
```

## Migration Phases

### Phase 0: Freeze Intent Expansion

目标：

- 停止继续扩展 `intent-first` 设计债。

动作：

- 不再新增新的 `EXTRA_INTENT_MAPPINGS` 手写命令映射。
- 不再把新的用户可见文案建立在 `intent` 名称上。
- 不再新增依赖 `step_*` 命名的 UI 行为。

验收：

- 新增 NL 能力必须说明未来的 `TaskContract.taskKind` 和 `executionStrategy.mode`。

### Phase 1: Introduce TaskContract As A Derived Layer

目标：

- 在不破坏现有 `NLResult` 的前提下，引入 `TaskContract`。

动作：

- 在 `processInput()` 之后新增 `NLResult -> TaskContract` 适配层。
- 先不删除 `intent`、`taskList`、`workflowYAML`。
- `chat` 和 `run` 先只读消费 `TaskContract` 的摘要字段。

新增模块建议：

```text
src/nl/task-contract.ts
src/nl/task-contract-adapter.ts
src/nl/task-contract-types.ts
```

验收：

- 常见请求可同时产出旧 `NLResult` 和新 `TaskContract`。
- 旧测试不破坏。

### Phase 2: Replace UI-Facing Intent Output

目标：

- UI 不再直接显示内部 intent 和 step。

动作：

- `src/commands/chat.ts` 改为渲染 `ChatPresentationModel`。
- `Intent: ...`、`step_*` 只保留在 debug 输出或 trace 中。
- `src/chat/repl.ts` 和 `src/chat/nl-handler.ts` 同步改用 presentation model。

验收：

- 默认交互界面不再出现 `Intent:` 和 `step_*`。
- 调试信息仅在明确 debug 模式显示。

### Phase 3: Unify Execution Strategy Resolution

目标：

- 不再由多个模块各自决定如何执行。

动作：

- 引入统一 `Strategy Resolver`。
- `TaskContract.executionStrategy` 成为唯一执行入口。
- `run-dispatch` 从“规则补丁”演进为“策略校验器”。

建议新增模块：

```text
src/nl/strategy-resolver.ts
src/nl/strategy-validator.ts
```

验收：

- `chat`、`run`、REPL 共享同一策略选择逻辑。
- 相同请求在不同入口得到相同 execution strategy。

### Phase 4: Collapse Command Surface Truth Sources

目标：

- 收敛 CLI command surface 的事实源。

动作：

- 让 `vectahub` 可执行子命令从 `cli-command-registry.ts` 派生。
- `run-dispatch.ts` 的 `VECTAHUB_COMMANDS` 改成派生数据，不再手写。
- `tool-calling.ts` 中所有 `vectahub` 子命令映射必须通过 registry / capability lookup 校验。

验收：

- 不再允许“LLM 能生成、CLI 不存在”的命令面。
- registry 变更能自动影响 validation 和 tool exposure。

### Phase 5: Demote Templates To Training Hints, Not Runtime Truth

目标：

- `INTENT_TEMPLATES` 不再承担执行真相职责。

动作：

- `INTENT_TEMPLATES` 只保留：
  - examples
  - pattern hints
  - tool metadata
  - eval seeds
- 运行时命令映射迁到 `TaskContract` / strategy resolver / capability catalog。
- `config/commands/intents.yaml` 评估为：
  - 删除
  - 迁移到 capability contract
  - 或保留为 legacy fallback 并标记 deprecated

验收：

- 改一个 intent 示例不会再改变真实执行命令。
- 命令行为修改只发生在执行策略层或 capability 层。

### Phase 6: Merge Chat Entrypoints

目标：

- 只保留一条用户可见 NL 产品链路。

动作：

- 选择 `commands/chat.ts` 或 `chat/repl.ts` 作为唯一主入口。
- 另一套改为内部实现层，或删除。
- slash command、workflow preview、reply rendering 统一到同一 presentation policy。

验收：

- 所有 `vectahub chat` 路径共享同一 NL 主合同。
- 后续修复不再需要同时改两套 UI 行为。

## Module-by-Module Recommendation

### `src/nl/templates/index.ts`

当前角色：

- 意图模板
- tool metadata
- 正则样例

迁移后角色：

- 保留为语义样例库和 tool hint 库
- 不再直接决定 runtime command

### `src/nl/tool-calling.ts`

当前角色：

- tool schema builder
- intent 到 step 的映射器
- provider / agent / CLI 的混合入口

迁移后角色：

- 只负责：
  - 构建 LLM tool schema
  - 将 tool-call 转成中间语义对象
- 不直接输出最终 runtime step

建议拆分：

```text
tool schema
!=
task contract mapping
!=
runtime strategy mapping
```

### `src/nl/core/category-router.ts`

当前角色：

- 根据 category 判定是否走 LLM
- 直接创建 taskList

问题：

- category 决策和执行合同耦合
- 仍在制造旧式 `intent -> taskList`

迁移后角色：

- 只作为轻量 routing hint
- 不再直接生成最终执行 task

### `src/nl/orchestrator.ts`

当前角色：

- capability route
- fallback 到 LLM processor
- 输出 `NLResult`

迁移后角色：

- 保留为总协调器
- 输出 `TaskContractEnvelope`

推荐目标：

```ts
interface TaskContractEnvelope {
  taskContract: TaskContract;
  legacy?: NLResult;
}
```

### `src/commands/chat.ts`

当前角色：

- 直接消费 `NLResult`
- 执行 bridge 命令
- 展示内部 intent/task 信息

迁移后角色：

- 只消费 `PresentationModel`
- 不直接拼装内部编排文案

### `src/chat/repl.ts` / `src/chat/nl-handler.ts`

当前角色：

- 另一套 UI / workflow 解释链

迁移后角色：

- 与 `chat.ts` 共享相同 `TaskContract` 和 presentation adapter

### `src/commands/run-dispatch.ts`

当前角色：

- 对生成步骤做二次分类和阻断

迁移后角色：

- 成为执行策略 validator 的一部分
- 不再充当“发现运行时事实”的补丁层

## Stop Conditions

出现以下情况时，应暂停迁移并先修合同：

- 新设计又新增一份 `intent -> command` 映射表。
- `TaskContract` 只是给旧 `NLResult` 换个名字，没有新增目标、对象、约束和策略字段。
- UI 仍依赖 `intent` 名称来决定用户文案。
- 不同入口对同一请求产生不同 `executionStrategy`。

## Acceptance Criteria

- `TaskContract` 成为 NL 主合同，`intent` 降级为内部信号。
- 默认 UI 不再暴露 `intent` 和 `step_*`。
- `vectahub` 子命令 surface 只有一份权威事实源。
- `chat` 与 REPL 不再各自维护不同的执行语义。
- `templates`、`tool-calling`、`category-router` 都不再直接持有最终命令真相。
