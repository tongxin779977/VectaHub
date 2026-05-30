# 能力明细

> Document Status: Current Implementation / Partial Implementation Reference
> Authority: 当前能力细节参考。本文总结真实存在的功能分组和边界。字段级真相仍以 specs 和源码为准。

## 怎么看这份文档

每一节都回答同样几类问题：

- 这个能力是干什么的，
- 用户怎么触发它，
- 它接收什么输入，
- 它返回什么输出，
- 它会不会写状态、有没有副作用，
- 当前实现边界在哪里。

## 交互式 CLI 与基础回复

**Status:** Current Implementation

### `run`

作用：

- 接收自然语言意图，
- 路由到计划生成或工作流执行，
- 支持 dry-run 预览和 JSON 输出，
- 按需保存 workflows。

触发方式：

```bash
vectahub run "show git status"
vectahub run --file ./workflow.yaml
vectahub run --dry-run "delete node_modules"
```

输入：

- 自然语言意图，
- workflow 文件，
- execution mode，
- 初始变量，
- dry-run 和 JSON 选项。

输出：

- 面向人的进度和执行文本，
- `--json` 下的结构化结果，
- 真实执行时的 execution records。

副作用：

- 可能执行命令，
- 使用 `--save` 时可能保存 workflow 定义，
- 非 dry-run 情况下可能写 execution records。

当前边界：

- 本地执行链路很强，
- preview 路径很强，
- 面向回复的自然语言模式确实存在，
- 但它默认不是一个会持续跨任意工具自由推理的自由对话助手。

关键文件：

- [src/commands/run.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/run.ts:1)

### `chat`

作用：

- 提供本地交互式会话、历史和命令快捷方式。

触发方式：

```bash
vectahub chat
```

输入：

- 用户消息，
- slash commands，
- 当前工作目录上下文。

输出：

- 文本回复，
- 带 session 感知的上下文使用。

副作用：

- 可能根据命令路径触发执行，
- 在进程内维护 session history。

当前边界：

- 它作为本地交互壳是有用的，
- 但还不是一个深度有状态的多用户 chat runtime。

关键文件：

- [src/commands/chat.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/chat.ts:17)
- [src/chat/context-builder.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/chat/context-builder.ts:1)
- [src/nl/session-manager.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/session-manager.ts:309)

## 文档处理

**Status:** Current Implementation

### 能力定位

文档处理的目标不是“把文档交给 LLM 总结”，而是把自然语言文档编译成可审查、可确认、可执行、可验证、可恢复的任务合同。

目标管线：

```text
Document
-> ParsedDocument / SourceMap
-> ParsedTaskCandidate
-> AgentTaskContract
-> Confirmed Task Contract
-> Workflow / Agent Step Plan
-> Execution / Verification / Recovery
```

当前已经实现的是后半段骨架；前半段文档数据层仍需 hardening。

关键设计：

- [文档处理架构设计](./design/document-processing-architecture.md)

### `parse-doc`

作用：

- 把开发文档或任务文档解析成结构化任务。

触发方式：

```bash
vectahub parse-doc ./docs/task.md --json
```

输入：

- 文档路径。

输出：

- 结构化任务列表，
- 在相关路径下返回 `source`、`degraded`、`warnings` 等元数据。

副作用：

- 只读。

当前边界：

- 支持结构化提取，
- 优先识别路线图状态表格，
- 会根据 parser 可用性和来源路径做 fallback，
- 当前任务主体仍偏薄，主要是 `id` 和 `label`，
- chunk 和任务结果还没有稳定 source map，
- 不能写成“通用深度语义文档理解”。

目标补强：

- 输出 `ParsedDocument`，
- 为 block、chunk、task 保留 `SourceRange`，
- 把任务候选升级为 `ParsedTaskCandidate`，
- 增加 `goal`、`acceptanceCriteria`、`suggestedFiles`、`validationHints`、`dependencies`、`riskHints`，
- 拆分 `extractionConfidence`、`boundaryConfidence`、`executionConfidence`，
- 对 fallback 记录 chunk-level warning、coverage ratio 和 fallback reason。

### `run-task`

作用：

- 从任务文档推导有边界的任务合同，并通过 Agent CLI 执行。

触发方式：

```bash
vectahub run-task --tool codex --task-id T1 --task-label "Add tests" --doc ./docs/task.md --json
vectahub run-task --task-id T1 --task-label "Add tests" --doc ./docs/task.md --contract-preview --json
vectahub run-task --tool codex --task-id T1 --task-label "Add tests" --doc ./docs/task.md --dry-run --json
```

输入：

- task id，
- task label，
- 文档路径，
- 用于 dry-run 或真实执行的 agent tool，
- 输出模式选项。

输出：

- contract preview，
- 本地 preview command，
- execution result，
- 可选的 verification 和 recovery 元数据。

副作用：

- 真实执行会 spawn 外部 Agent CLI，
- 可能写 task run records、trace、failure logs 和相关执行元数据，
- dry-run 和 contract-preview 会更早返回，副作用更窄。

当前边界：

- 这是当前最成熟的能力区之一，
- 执行模型仍然是“一次 task run 对应一个选定的 Agent CLI”，
- 不能写成“已经完成的通用多 agent supervisor”，
- `run-task` 当前仍会基于 `taskId` / `label` 回扫文档片段并推导边界；后续应优先消费 richer task candidate。

目标补强：

- `AgentTaskContract` 增加 `schemaVersion` 和 `contractVersion`，
- 合同关联 `sourceRanges` 和 `sourceDocumentHash`，
- `run-task --contract-preview` 能展示 richer task contract summary，
- 从 confirmed task contract 生成 workflow draft，
- 多 Agent CLI 文档任务链路应进入 workflow，而不是隐藏在一次 `--tool` 调用里。

关键文件：

- [src/commands/run-task.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/run-task.ts:2414)
- [contracts/run-task-execution-contract.md](./contracts/run-task-execution-contract.md)
- [contracts/agent-worker-contract.md](./contracts/agent-worker-contract.md)

### 文档任务运行记录与恢复

定位：

- 这是文档任务系统的轻量状态与恢复层，
- 不是普通日志列表，
- 也不是自动自愈系统。

作用：

- 保存每个文档任务的最新状态和运行摘要，
- 查看近期 document-task runs，
- 查看 latest 或指定记录，
- 根据失败分类生成恢复建议，
- 在安全条件满足时恢复失败 task runs。

触发方式：

```bash
vectahub doc-task-runs list --json
vectahub doc-task-runs latest --json
vectahub doc-task-runs show <runId> --json
vectahub recover-task --doc ./docs/task.md --trace-id <traceId> --json
```

当前边界：

- 运行记录是状态真相来源之一，
- recovery 是真实存在的，
- recovery 语义依赖 task contract、trace 和 failure classification，
- `recover-task` 当前主要支持 `retry_direct`，`suggest_fix` 返回结构化建议，
- 这里应该写成“合同驱动恢复”，而不是“自愈魔法”。

最小必要能力：

- `latest`：查看每个文档任务的最新状态。
- `show <runId>`：解释一次运行为什么成功或失败。
- `recover-plan <runId>`：只生成恢复建议，不执行。
- `recover-task <runId>`：只执行安全的恢复路径；其他情况返回结构化建议或阻断。

必须保存的摘要：

- task id 和 label，
- run id、batch run id 和 trace id，
- 状态与失败分类，
- git change summary，
- verification summary，
- AgentTaskContract summary，
- instruction hash，
- recovery record 引用。

禁止保存：

- 完整 stdout/stderr，
- 完整文档，
- 完整 prompt，
- 完整 trace spans，
- 完整 git diff，
- secrets、完整 env、未脱敏用户路径。

目标补强：

- 文档解析阶段生成 `docParseTraceId`，
- 合同构建阶段生成 `contractTraceId`，
- workflow 执行阶段生成 `workflowRunTraceId`，
- 恢复记录能串起 `sourceRunId -> recoveryRunId -> newRunId`，
- `suggest_fix` 必须生成受原合同约束的 bounded fix task，
- 未收口执行必须进入基于现有 diff 的 bounded fix task，而不是自动重试。

## 工作流引擎

**Status:** Current Implementation / Hardening Needed

### 能力定位

Workflow engine 是 VectaHub 的本地自动化内核。

它当前最适合被理解为：

```text
workflow definition
-> dependency validation
-> ordered step execution
-> context / output propagation
-> execution record
-> rerun / resume
```

它不应该被描述成已经成熟的分布式 workflow 平台，也不能把 `delegate` 直接写成已完整落地的 multi-agent supervisor。

关键设计：

- [工作流引擎架构设计](./design/workflow-engine-architecture.md)

### Workflow 文件版本

当前事实：

- Workflow 历史版本能力已经存在，
- 但保存出来的 workflow 文件还没有强制内嵌 `schemaVersion`，
- `Workflow` 类型当前仍以 `id`、`name`、`mode`、`steps`、`createdAt` 为核心字段。

推荐合同：

- 新写的 workflow 文件应带 `schemaVersion: "1.0"`，
- 保存前应做一次“序列化后回读”正确性检查，
- 回读后至少校验顶层字段、step 类型、必填字段、依赖关系和静态可执行性，
- 运行时命令可用性、权限、网络和变量完整性仍属于执行期验证。

当前边界：

- 这是需要硬化的持久化合同，
- 不能把当前实现写成“已经强制校验 workflow 文件版本”。

目标补强：

- 新 workflow 文件默认写入 `schemaVersion: "1.0"`，
- 引入 `definitionVersion` 和 `definitionHash`，
- 保存前做 serialize -> parse -> validate，
- 读取、列表、文件加载都走同一套 parser / normalizer / validator，
- execution record 保存 workflow 定义 hash 或 snapshot 引用。

关键文件：

- [src/types/workflow.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/types/workflow.ts:30)
- [src/workflow/storage.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/storage.ts:270)
- [workflow-spec.md](./workflow-spec.md#版本与保存正确性)

### 支持的 step types

源码里当前定义的 step types：

- `exec`
- `for_each`
- `if`
- `parallel`
- `opencli`
- `delegate`

关键文件：

- [src/types/workflow.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/types/workflow.ts:1)

### 当前执行模型

主 workflow engine 当前执行路径：

```text
validateDependencies
-> topologicalSort
-> sequential run loop
-> interpolate step
-> executor.execute
-> contextManager.setStepOutput
-> storage.save execution record
```

当前能力：

- `dependsOn` 会影响执行顺序，
- 缺失依赖和循环依赖会在执行前暴露，
- step 输出会进入 context，
- `outputVar` 可以作为后续插值来源，
- 失败后 `resumeFromFailure` 可以从失败步骤重新执行。

当前边界：

- 主 engine 不是默认并行 DAG scheduler，
- 独立 `parallel-executor` 有依赖感知队列，但与主 engine 尚未统一，
- resume 当前按 `workflowId` 找回 workflow，尚未强绑定历史 workflow snapshot，
- step record 没有完整记录 agent target、artifact、permission decision 等多 Agent 编排元数据。

目标补强：

- 统一主 engine 和 parallel executor，
- 支持 workflow 级 `maxConcurrency`，
- 支持 step 级 `retry`、`continueOnError`、`timeout` 和失败分类，
- resume 前校验 workflow 定义 hash，
- 多 Agent step 的 trace 和 permission decision 写入 execution record。

### `exec`

作用：

- 直接运行一个命令。

当前边界：

- 它是主要执行原语，
- 同时受 policy、detector 和 sandbox 入口保护。

### `if`

作用：

- 有条件地执行一个 step body。

当前边界：

- 它支持结构化条件执行，
- 当前是基于 body 的分支执行。

### `for_each`

作用：

- 把一个逻辑步骤展开到多个 items 上执行。

当前边界：

- 它支持带插值的循环式工作流展开。

### `parallel`

作用：

- 并行执行子步骤。

当前边界：

- `parallel` step 内的子步骤并行执行是真实存在的，
- 独立 parallel executor 有依赖感知的队列逻辑，
- 任意一个 branch 失败会让父级 parallel step 失败，
- 但这仍然不是完整 workflow 级统一调度模型，也不是完整的多 agent 协作语义。

关键文件：

- [src/workflow/parallel-executor.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/parallel-executor.ts:1)

### `delegate`

作用：

- 表示把一个步骤委托给外部 agent target。

当前边界：

- 这个 step type 在工作流模型和校验里是存在的，
- executor 侧校验也是存在的，
- 但真正能不能跑，取决于是否接上了注册 handler，
- 所以在没有确认 handler 已经接进对应执行路径之前，不能把它写成“所有 workflow 路径都可用”。

关键文件：

- [src/workflow/executor.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/executor.ts:277)
- [workflow-spec.md](./workflow-spec.md)

### 多 Agent CLI workflow 编排

目标能力：

- 一个 workflow 可以先调用 `opencli` 或一个 Agent CLI 收集信息，
- 再把输出交给另一个 Agent CLI 整理文档、实现代码或做验证，
- VectaHub 负责步骤依赖、变量传递、artifact 交接、风险确认、trace、执行记录和恢复。

推荐执行模型：

- Agent CLI 应通过 registry descriptor 和 adapter 接入，
- workflow step 不应散落硬编码的 agent 命令细节，
- 小输出通过 `outputVar` 传递，
- 长文档、研究材料和审查结果应落成 artifact，再由后续步骤读取，
- 每个 agent step 都要有明确输入、输出、依赖、失败语义和执行边界。

当前已经具备的积木：

- Agent registry 和内建 descriptors，
- adapter-based command rendering，
- `opencli` step handler，
- `delegate` step 类型和基础校验，
- workflow 变量插值和 `outputVar` 交接，
- trace、audit、execution records 和 recovery 基础设施。

当前缺口：

- `delegate` 还不能被描述成所有 workflow 路径里都完整可执行，
- workflow 内的 artifact 合同还没有变成正式 `Step` 字段，
- 多 Agent 编排还没有完整 supervisor、冲突管理和共享状态模型，
- 保存前回读、版本迁移和 agent step 静态校验仍需要进一步硬化。

推荐最小落地顺序：

1. 先让 `delegate` 通过 Agent registry 找到目标 runtime。
2. 再定义统一 adapter 输入输出：prompt、cwd、env、timeout、stdout、stderr、exit code。
3. 再把 `delegate` 输出接入 `outputVar`。
4. 再引入 artifact 读写合同。
5. 最后才讨论多 Agent planner、共享状态和冲突管理。

关键参考：

- [workflow-spec.md](./workflow-spec.md#多-agent-cli-编排合同)
- [src/agent-runtime/factory.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/agent-runtime/factory.ts:14)
- [src/workflow/handlers/opencli-handler.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/handlers/opencli-handler.ts:1)
- [src/workflow/executor.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/executor.ts:176)

### 工作流历史与重放命令

当前命令族：

- `list`
- `list versions <workflowId>`
- `history`
- `detail <executionId>`
- `rerun <executionId>`
- `resume <executionId>`
- `archive`
- `rollback <workflowId> <version>`

当前边界：

- workflow history 是产品一等能力，
- 但 history version、workflow 文件版本和 execution snapshot 还没有完全收敛成一个统一版本合同。

目标补强：

- 区分 `schemaVersion`、`definitionVersion` 和 history snapshot version。
- 每次执行记录 workflow 定义 hash。
- `rerun` 默认使用原始定义快照或提示用户确认使用当前定义。
- `resume` 在定义变化时默认阻断自动恢复。

## Agent CLI 注册与 Runtime

**Status:** Current Implementation / Migration Contract

### 能力定位

Agent CLI Runtime 是 VectaHub 调度外部 Agent CLI 的运行时事实层。

它的目标不是替代 `codex`、`gemini`、`claude`、`aider`，而是记录这些 CLI 如何被调用、是否可用、是否能自动执行、运行目录如何准备、输出如何进入 VectaHub 执行记录。

关键设计：

- [Agent CLI 注册与 Runtime 架构设计](./design/agent-cli-runtime-architecture.md)

### 内建 registry

当前内建 agent descriptors：

- `codex`
- `gemini`
- `aider`
- `claude`

注册通过内建初始化流程完成。

当前 descriptor 已能表达：

- `entryCommand`
- `subcommand`
- `promptTransport`
- `promptArgName`
- `workingDirectoryArg`
- `nonInteractiveFlags`
- `preflightSpec`
- `runtimePolicy`

当前缺口：

- 尚未稳定表达 `executionMode`。
- 尚未完整表达 capabilities、constraints、issues、confidence。
- custom agent 还不是完整动态注册能力。
- workflow `delegate` 还没有默认接入这个 registry 的执行 handler。

关键文件：

- [src/agent-runtime/factory.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/agent-runtime/factory.ts:14)
- [src/agent-runtime/registry.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/agent-runtime/registry.ts:1)
- [src/cli-main.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-main.ts:478)

### `tools agents`

作用：

- 暴露机器可读和人类可读的 Agent CLI runtime 事实。

触发方式：

```bash
vectahub tools agents
vectahub tools agents --json
vectahub tools agents --json --sync-config
```

当前边界：

- 现在已经足够作为 runtime catalog 的主要入口，
- 但文档里仍然要把它标成“向更丰富 registry 模型迁移中的实现”，
- 它还不是完整动态的 agent marketplace，也不是任意最终用户插件注册中心。

目标补强：

- 输出 `executionMode`。
- 输出 `status` 和 `blockedReason`。
- 输出 capabilities 和 constraints。
- 区分 `installed`、`invocable`、`ready`、`configuredEnabled`、`hasPermission`。
- 明确 `ready=true` 只代表外层入口就绪，不代表任务一定成功。

### Runtime bootstrap

作用：

- 在不偷偷改写用户权威配置源的前提下，为部分 Agent CLI 准备可写 runtime home。

当前边界：

- 这是当前很重要的能力，
- 对 `run-task` 特别关键，
- 但应该写成“runtime 隔离支持”，而不是“完整租户隔离”。

### Runtime renderer

作用：

- 把 `AgentDescriptor`、workspace root、task prompt 和输出模式渲染成确定性的 command / args。

当前边界：

- 已经有 `codex`、`gemini`、`aider`、`claude` adapter。
- renderer 仍偏 per-agent class。
- 后续应收敛到 registry-backed generic renderer。
- LLM 不应该为已注册 Agent 临场发明最终 argv。

### Custom Agent

目标能力：

- 用户可以显式配置一个非内建 Agent CLI。
- VectaHub 校验 descriptor。
- 通过 preflight 判断真实入口是否可调用。
- 通过 renderer 执行或明确阻断。

当前边界：

- `custom` 应被写成目标合同。
- 当前不应描述成完整 marketplace 或自动 onboarding 平台。

## 编排、委托与任务拆解

**Status:** Partial Implementation

### 能力定位

编排层负责把用户意图或文档任务拆成可确认、可执行、可恢复的步骤。

推荐目标链路：

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

关键设计：

- [编排、委托与任务拆解架构设计](./design/orchestration-and-delegation-architecture.md)

### 当前已经真实存在的部分

- 自然语言路由到 execution plans，
- workflow 级 parallel execution，
- document-task contract generation，
- 通过 runtime descriptors 选择 agent，
- delegated AI module loop，
- 执行后的 verification 与 recovery。

### 必须谨慎描述的部分

- `multi-agent orchestration` 当前只实现了一部分，
- 项目已经有编排积木，但还不是完整成熟的 supervisor 架构，
- 一个 task run 一般只针对一个选定的 Agent CLI，
- workflow `parallel` 和 task `delegate` 并不等于“带权威共享计划、冲突安全”的多 agent 协作。

### 目标补强

- 为复杂意图生成 `PlanProposal`。
- 把多步骤计划落成 workflow draft。
- 让 workflow `delegate` 调用 Agent Runtime。
- 用 artifact 交接长文档、研究材料和审查结果。
- 失败后生成 recovery-oriented plan，而不是盲目重试。

### 编排边界

应进入 workflow 的任务：

- 有多个步骤。
- 有依赖关系。
- 会执行命令。
- 会写文件。
- 需要验证或恢复。

不应进入 workflow 的任务：

- 普通解释。
- 一次性问答。
- 信息不足、需要先澄清。
- 用户尚未确认的高风险动作。

### 当前 delegated AI module

代码库里有一个 AI module，可以让 LLM 在循环里调用一小组本地工具：

- `execute_command`
- `read_file`
- `write_file`
- `search_files`

当前边界：

- 它作为内部 delegated loop 机制是有价值的，
- 但这不等于整个产品已经是完整的 agent swarm system。

关键文件：

- [src/skills/ai-modules/agent-delegate/agent-loop.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/skills/ai-modules/agent-delegate/agent-loop.ts:1)
- [src/skills/ai-modules/agent-delegate/agent-tools.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/skills/ai-modules/agent-delegate/agent-tools.ts:1)

## 安全、策略与脱敏

**Status:** Current Implementation

### 能力定位

安全层负责把所有有副作用的执行放进统一 Permission Gate。

推荐链路：

```text
Plan / Workflow / Agent Step
-> Permission Gate
-> Execution
-> Trace / Audit
-> Output Summary
-> Verification
-> Failure Classification
-> Recovery Decision
```

关键设计：

- [安全、Trace、执行记录与恢复架构设计](./design/safety-trace-recovery-architecture.md)

当前安全能力：

- danger detection，
- semantic checks，
- security rules management，
- risk assessment，
- sandbox mode routing，
- redaction before persistence，
- risky commands 的 confirmation path。

当前命令族：

- `run-command`
- `security ...`
- `audit ...`

当前边界：

- 对一个本地 CLI 来说，这套安全姿态已经很强，
- 但实现细节仍然比宣传式说法更重要，尤其是 fallback 行为。
- `run-task` 已清晰区分执行前确认、执行后确认和未收口执行，
- chat、workflow、delegate 需要向同一确认语义收敛。

### Permission Gate

必须 fail closed：

- `critical` 主命令风险。
- 未知 Agent 直接执行。
- `manual_only` Agent 自动执行。
- runtime bootstrap 或 preflight 失败。
- workflow definition hash、instruction hash 或 source document hash 过期。

可以确认后继续：

- `high` 主命令风险。
- 高风险验证命令且验证尚未运行。
- 风险可解释、范围明确、用户确认后的写操作。

## Trace、Audit 与执行状态

**Status:** Current Implementation

当前能力：

- trace creation 和 query，
- audit logging，
- execution records，
- output persistence，
- detail 和 history inspection，
- selected flows 的 failure logs。

当前命令族：

- `trace list/show`
- `history`
- `detail`
- `archive`

当前边界：

- 已经有比较完整的可观测面，
- 但部分持久化语义足够复杂，必须 specs 和源码一起看。
- trace、execution record、artifact ref、recovery record 还需要统一 RunContext 串联。

### 恢复边界

可以直接重试：

- 没有 `gitChanges`，
- 上下文 hash 未变化，
- runtime 仍可用，
- failure kind 属于可重试失败。

必须进入 `suggest_fix`：

- 已有 `gitChanges`，
- timeout 但已有副作用，
- Agent 失败但已有文件修改，
- verification failed，
- 未收口执行。

必须 blocked：

- config failure，
- conflict，
- system internal failure，
- cancelled，
- stale instruction hash，
- stale workflow definition hash，
- artifact missing，
- permission denied。

## 本地服务与集成

**Status:** Secondary / Not Mainline

当前能力：

- daemon management，
- local socket server，
- API server 代码路径，
- VS Code integration commands，
- import/export，
- monitoring 和 debugging commands。

当前命令族：

- `daemon`
- `serve`
- `client`
- `vscode`
- `export`
- `import`
- `monitor`
- `debug`

当前边界：

- 这些是围绕 CLI 内核长出来的本地平台扩展，
- 但不应该写成生产级多用户服务层，
- 当前不属于 NL Workflow Orchestrator 主产品面，
- socket service 和 daemon 是本地辅助进程能力，
- HTTP API 当前应按本地 API server 理解，不应承诺公网访问、安全租户隔离或长期兼容的开放平台 API，
- VS Code extension 是 CLI 的本地 UI 入口，不应该复制 workflow、Agent Runtime、permission、trace 或 recovery 的权威逻辑，
- import/export 可用于备份、迁移和检查，但当前不应描述成完整跨版本迁移协议。

如果后续要重新进入主线，需要先补充权威合同、实现追踪矩阵和验证门禁：

- service、API、VS Code 和 CLI 共享 RunContext。
- 所有机器入口使用稳定结构化输出。
- 权限确认统一进入 Permission Gate。
- execution record、trace、artifact 和 recovery decision 互相关联。
- import/export manifest 增加 schema version、文件清单、脱敏摘要和 dry-run diff。

关键参考：

- [design/module-scope-cleanup.md](./design/module-scope-cleanup.md)
- [ui/vscode-extension.md](./ui/vscode-extension.md)

## 旧文档的阅读建议

下面这些文档现在应该当成主入口：

- [../README.md](../README.md)
- [README.md](./README.md)
- [capabilities.md](./capabilities.md)
- [capabilities-reference.md](./capabilities-reference.md)
- [usage.md](./usage.md)
- [architecture.md](./architecture.md)

只有在你需要字段级细节、迁移细节时，再回头去看旧 spec 或 design 文档。面向用户说明时，不要再从它们开讲。
