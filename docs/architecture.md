# VectaHub 架构总览

> Document Status: Current Implementation / Architecture Summary
> Authority: 高层系统结构和仓库重点说明。能力细节仍以能力文档、命令文档、specs 和源码为准。

## 定位

VectaHub 当前应被理解为一个**单用户、本地优先的 CLI 自动化内核**。

它把下面这些能力组合在一起：

- 文档驱动任务执行，
- 本地交互式回复路径，
- 工作流执行，
- 外部 Agent CLI 注册与路由，
- 安全、trace、验证和恢复。

它当前并不适合被描述成一个多租户服务平台。

## 核心系统形态

```text
User / CLI / VS Code
        |
        v
VectaHub CLI Core
        |
        +-- Intent and planning
        +-- Document-task contract building
        +-- Workflow execution
        +-- Agent CLI routing
        +-- Safety and confirmation
        +-- Trace / audit / execution records
        +-- Verification / recovery
        |
        v
Local commands / External Agent CLIs / Workflow steps
```

## 架构上的主要价值

VectaHub 的架构价值不在于“帮你调一个 agent”。

它真正做的是在本地自动化外面再加一层治理型执行层：

- 边界清楚的输入，
- 显式执行步骤，
- preview 路径，
- 机器可读输出，
- audit 和 trace，
- verification，
- recovery。

## 当前非目标

VectaHub 当前不应被写成：

- 托管式多用户 control plane，
- 数据库驱动的 orchestration platform，
- 底层 Agent CLI 的替代品，
- 自由放飞的 autonomous swarm system，
- 一个由 agent 输出单独定义真相的产品。

## 仓库边界

当前仓库结构大致如下：

```text
src/cli.ts                                  CLI 入口
src/cli-main.ts                             命令注册与全局 CLI 行为
src/nl/                                     自然语言路由与意图处理
src/workflow/                               工作流引擎与执行逻辑
src/skills/                                 skills 与 AI module 系统
src/agent-runtime/                          Agent CLI registry、descriptor、adapter
src/sandbox/                                sandbox 与危险检测
src/security-protocol/                      命令风险、策略、脱敏、规则系统
src/infrastructure/                         DI、environment、config、logger、audit、trace、event
src/execution/                              执行记录、output store、lifecycle helpers
src/commands/                               命令实现
packages/doc-task-contract-core/            共享文档任务合同逻辑
packages/vectahub-vscode-extension/         VS Code extension
```

## 主要运行层

## 1. CLI 组装层

CLI 仍然是主要 composition root。

当前特征：

- 命令注册在 `src/cli-main.ts`，
- 内建 Agent descriptors 会在 CLI 启动时初始化，
- 输出纪律很重要，因为支持 JSON 的命令必须保证 stdout 干净。

关键文件：

- [src/cli.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/cli.ts:1)
- [src/cli-main.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-main.ts:544)

## 2. 基础设施与依赖层

`InfrastructureContext` 是主要依赖装配点。

当前职责：

- environment access，
- config service，
- logger service，
- event bus，
- audit service。

当前边界：

- 显式依赖注入是真实存在的，
- 但兼容性默认值也还在，它们应该被视为当前技术边界，而不是所有核心模块的长期理想形态。

关键文件：

- [src/infrastructure/context.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/infrastructure/context.ts:18)

## 3. 意图、规划与回复层

自然语言输入会被路由到：

- 直接回复，
- execution plans，
- workflow steps，
- delegated task paths。

当前边界：

- routing 和 planning 是重要能力，
- 但产品整体仍然应该被描述成“执行优先”，而不是“聊天优先”。

关键文件：

- [src/nl/orchestrator.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/orchestrator.ts:1)
- [src/commands/run.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/run.ts:1)

## 4. 工作流执行层

workflow engine 是架构核心之一。

当前支持的 step model：

- `exec`
- `if`
- `for_each`
- `parallel`
- `opencli`
- `delegate`

当前边界：

- workflow execution 是真实存在的，
- `parallel` step 的子步骤并行是真实存在的，
- `delegate` step 的类型和校验是真实存在的，
- 但主 workflow engine 仍以依赖校验、拓扑排序和顺序执行 loop 为核心，
- 默认 executor 没有完整内建 `delegate` handler，
- workflow 文件版本、保存前回读校验、执行定义快照仍需要 hardening。

目标方向：

```text
WorkflowDefinition v1
-> validated run plan
-> local scheduler
-> Agent CLI delegation
-> execution snapshot
-> trace / recovery
```

这条路线应该保持本地轻量，不要过早膨胀成分布式调度平台。

关键文件：

- [src/types/workflow.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/types/workflow.ts:1)
- [src/workflow/executor.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/executor.ts:1)
- [src/workflow/parallel-executor.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/parallel-executor.ts:1)
- [design/workflow-engine-architecture.md](./design/workflow-engine-architecture.md)

## 5. 文档任务执行层

这是当前仓库里最有辨识度的产品区域。

当前职责：

- 从任务文档推导有边界的合同，
- 选择 Agent CLI，
- preview 或 execute，
- verify，
- classify failures，
- support recovery。

关键文件：

- [src/commands/run-task.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/run-task.ts:2414)
- [packages/doc-task-contract-core/package.json](/Users/xin.tong/apps/project/test_trae/VectaHub/packages/doc-task-contract-core/package.json:1)

## 6. Agent CLI runtime 层

VectaHub 没有把外部 agent 路径写死成一个，它已经有了基于 registry 的 runtime 层。

当前内建覆盖：

- `codex`
- `claude`
- `gemini`
- `aider`

当前能力：

- descriptor 注册，
- adapter-based command rendering，
- 部分 agent 的 runtime bootstrap 规则，
- 通过 `tools agents` 做 runtime probing。

当前边界：

- runtime registry 目前以内建 descriptor 为主，
- `tools agents --json` 已能作为 runtime probe 入口，但还不是完整 runtime catalog，
- `custom` Agent CLI 仍应被视为目标合同，
- workflow `delegate` 尚未默认接入完整 Agent Runtime handler。

目标方向：

```text
Agent Registry
-> Runtime Catalog
-> Invocation Renderer
-> Runtime Bootstrap / Preflight
-> run-task / workflow delegate
```

关键文件：

- [src/agent-runtime/factory.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/agent-runtime/factory.ts:14)
- [src/agent-runtime/registry.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/agent-runtime/registry.ts:1)
- [design/agent-cli-runtime-architecture.md](./design/agent-cli-runtime-architecture.md)

## 7. 编排、委托与任务拆解层

编排层位于交互、文档处理、workflow engine 和 Agent Runtime 之上。

它的职责不是执行命令，而是生成可审查计划：

```text
User Intent / Document Task
-> Plan Proposal
-> Workflow Draft
-> Agent Runtime Delegation
-> Artifact Handoff
-> Verification / Recovery
```

当前边界：

- 已有自然语言到 execution plan / workflow steps 的路径，
- 已有 document-task contract generation，
- 已有 workflow 和 Agent Runtime 两套底座，
- 但完整 `PlanProposal`、artifact handoff、delegate runtime execution 仍是目标合同。

关键文件：

- [src/nl/orchestrator.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/orchestrator.ts:1)
- [src/skills/pipeline-skill.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/skills/pipeline-skill.ts:1)
- [src/skills/workflow-skill.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/skills/workflow-skill.ts:1)
- [design/orchestration-and-delegation-architecture.md](./design/orchestration-and-delegation-architecture.md)

## 8. 安全与治理层

安全是架构一等公民。

当前组件：

- command danger detection，
- semantic detection，
- security rules，
- sandbox management，
- redaction，
- risk-driven confirmation logic。

关键文件：

- [src/security-protocol/manager.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/security-protocol/manager.ts:1)
- [src/security-protocol/guard.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/security-protocol/guard.ts:1)
- [design/safety-trace-recovery-architecture.md](./design/safety-trace-recovery-architecture.md)

## 9. 本地服务与集成层

本地服务与集成层是 CLI core 外围的本机适配层，当前已从 NL Workflow Orchestrator 主产品面降级。

当前组件：

- `serve` / `client` 本地 socket service，
- `daemon` 本地辅助进程管理，
- HTTP API server 代码路径，
- VS Code extension workspace，
- `mode` 本地执行模式切换，
- `export` / `import` 数据导入导出。

当前边界：

- 这些能力是本地入口扩展，不是多用户 SaaS control plane，
- 当前不作为主线合同或主线设计入口维护，
- HTTP API 应按本地 API server 理解，不能默认写成公网稳定 API，
- VS Code extension 应调用 CLI 或共享合同，不应复制执行真相，
- import/export 是备份和迁移辅助能力，不是完整跨版本迁移协议。

目标方向：

```text
VS Code / local script / socket client / API
-> Local Integration Layer
-> CLI Core
-> Permission Gate
-> RunContext
-> Trace / Execution Record
-> Structured Result
```

关键文件：

- [src/commands/serve.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/serve.ts:1)
- [src/commands/daemon.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/daemon.ts:1)
- [src/api/server.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/api/server.ts:1)
- [src/commands/export.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/export.ts:1)
- [packages/vectahub-vscode-extension/package.json](/Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/package.json:1)
- [design/module-scope-cleanup.md](./design/module-scope-cleanup.md)

## 10. Trace、Audit 与恢复层

VectaHub 已经有一套比较成型的可观测和恢复基础设施。

当前组件：

- audit logging，
- trace audit system，
- execution records，
- output storage，
- document-task run records，
- recovery decision paths。

目标方向：

```text
Permission Gate
-> RunContext
-> Execution Record
-> Output / Artifact Summary
-> Failure Classification
-> Recovery Decision
```

当前边界：

- `run-task` 的安全、trace 和恢复语义最完整，
- workflow、delegate 和 chat 需要向同一 Permission Gate 与 RunContext 收敛，
- workflow resume 需要补 workflow definition hash 或 snapshot guard。

关键文件：

- [src/infrastructure/trace-audit/system.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/infrastructure/trace-audit/system.ts:1)
- [src/workflow/storage.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/storage.ts:72)
- [design/safety-trace-recovery-architecture.md](./design/safety-trace-recovery-architecture.md)

## 架构原则

## Preview first

Preview 路径很重要。

- `run --dry-run` 应该描述将会执行什么，
- `run-task --contract-preview` 应该暴露合同而不是启动 agent，
- `run-task --dry-run` 应该渲染本地 preview command，而不是执行 agent。

## Contract first

文档任务执行应该被结构化合同约束，而不是靠一段超长自由 prompt 撑起来。

## 执行真相由 VectaHub 自己掌控

执行真相属于 VectaHub 自己记录的 records、trace、verification 和 recovery 逻辑。Agent 输出只是输入材料，不是最终权威。

## 干净的机器接口

面向机器的命令路径必须保持结构化 JSON 输出语义。

## Safety by default

高风险命令、危险输出和持久化记录都要受到显式安全逻辑约束。

## 架构解释时的写法建议

描述产品时，优先从这些点开讲：

1. 文档处理，
2. workflow 执行，
3. agent runtime 路由，
4. 编排与拆解，
5. 安全与恢复。

不要优先从这些点开讲：

- control-plane 语言，
- 多租户服务声明，
- 还未真正落地的 registry 未来蓝图，
- 没有实现限定词的“通用多 agent 平台”说法。

## 建议继续阅读

- [capabilities.md](./capabilities.md)
- [capabilities-reference.md](./capabilities-reference.md)
- [usage.md](./usage.md)
- [agent-execution.md](./agent-execution.md)
