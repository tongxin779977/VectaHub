# VectaHub 项目蓝图 — ACP 全面改造

> 本文档集是 VectaHub 从"LLM + Agent CLI 黑盒调用"到"ACP 结构化通讯基座"全面改造的权威蓝图。
> 所有现有功能作为需求底座,改造一个一个来完成,避免计划偏移。

## 改造核心目标

1. **全面弃用 LLM 直调** — 移除 `src/nl/llm*.ts`、`src/skills/llm-dialog-control/` 等全部 LLM HTTP 客户端
2. **全面弃用 Agent CLI 黑盒 spawn** — 移除 `environment.spawn()` 调用 agent 的路径,改用 ACP 协议
3. **ACP 作为通讯基座** — 初次启动时规定采用哪个 ACP agent(如 OpenCode),支持后期替换
4. **Workflow 适配 ACP** — `delegate` step 改为 ACP session,`exec` step 保留用于本地命令
5. **意图识别改造** — 从 LLM 分类改为 ACP agent 能力路由(详细计划待定)
6. **文档任务分析改造** — 从 LLM 解析改为 ACP agent 结构化任务链
7. **全链路可查验** — trace/audit 从 agent 内部到最终结果完整覆盖

## 文档导航

| 文档 | 内容 | 状态 |
|---|---|---|
| [00-vision.md](./00-vision.md) | 项目愿景、改造目标、架构总览 | ✅ 完成 |
| [01-acp-transport.md](./01-acp-transport.md) | ACP 通讯基座设计、传输层接口、降级策略 | ✅ 完成 |
| [02-cli-commands.md](./02-cli-commands.md) | 43 个 CLI 命令清单与改造映射 | ✅ 完成 |
| [03-workflow-engine.md](./03-workflow-engine.md) | Workflow 引擎 6 种 step 类型改造 | ✅ 完成 |
| [04-document-task.md](./04-document-task.md) | 文档任务生命周期 5 阶段改造 | ✅ 完成 |
| [05-nl-intent.md](./05-nl-intent.md) | 意图识别改造(待详细计划) | ⏳ 待定 |
| [06-security-protocol.md](./06-security-protocol.md) | 安全协议与 ACP permission 映射 | ✅ 完成 |
| [07-infrastructure.md](./07-infrastructure.md) | DI / trace / audit / event 基础设施 | ✅ 完成 |
| [08-llm-removal.md](./08-llm-removal.md) | LLM 调用全面移除清单(30+ 触点) | ✅ 完成 |
| [09-execution-plan.md](./09-execution-plan.md) | 分批执行计划与验证节点 | ✅ 完成 |

## 现有功能盘点摘要

- **CLI 命令**: 43 个(6 个用 LLM,6 个用 Agent CLI,7 个用 Workflow,24 个纯 CLI)
- **Workflow step 类型**: 6 种(exec / if / for_each / parallel / opencli / delegate)
- **LLM 触点**: 30+ 处(NL pipeline、parse-doc、run-task、chat、serve、generate、self-healing、agent inferencer、tool cache、skills)
- **Agent runtime**: 5 个内建(codex/claude/gemini/aider/agy)+ config-loaded + LLM-inferred
- **安全协议**: 3 层评估器(CommandRule + SandboxSemantic + ProtocolRule)+ Redactor + RBAC
- **基础设施**: InfrastructureContext(DI)、trace(JSONL)、audit(JSONL)、event bus、environment(spawn/exec)

## 改造原则

1. **需求底座不变** — 现有功能全部保留,只改实现方式
2. **ACP 优先** — 能用 ACP 的全部走 ACP,不能用 ACP 的保留为本地 CLI
3. **低耦合高内聚** — 传输层抽象为接口,策略模式选择 ACP vs CLI
4. **全链路可追溯** — 每个 ACP 事件自动生成 trace span + audit 记录
5. **渐进式执行** — 分批推进,每批有验证节点,防止计划偏移

## 文档交叉引用矩阵

每个文档顶部的「依赖清单」列出了它消费的外部类型。以下是全局依赖关系:

| ↓ 消费方 \ 提供方 → | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 |
|---|---|---|---|---|---|---|---|---|---|---|
| **00-vision** | — | ← | ← | ← | ← | ← | ← | ← | ← | |
| **01-acp-transport** | ← | — | | | | | ← | ← | | |
| **02-cli-commands** | | ← | — | | | | | | | |
| **03-workflow-engine** | | ← | | — | | | ← | ← | | |
| **04-document-task** | | ← | | | — | | ← | ← | | |
| **05-nl-intent** | | ← | | | | — | | | | |
| **06-security-protocol** | | ← | | | | | — | ← | | |
| **07-infrastructure** | | ← | | | | | | — | | |
| **08-llm-removal** | | ← | | | | | | | — | ← |
| **09-execution-plan** | ← | ← | ← | ← | ← | ← | ← | ← | ← | — |

> `←` 表示该行文档引用了该列文档的类型/接口/概念。

### 类型权威定义点

以下类型只在**一个地方**定义,其他文档通过链接引用:

| 类型 | 权威定义位置 |
|---|---|
| `AgentTransport`, `TransportRequest`, `TransportResult`, `TransportError` | [01 § 核心接口](./01-acp-transport.md#核心接口) |
| `AcpConfig` | [01 § 传输工厂](./01-acp-transport.md#传输工厂) |
| `TraceBridge` | [01 § Trace Span 桥接](./01-acp-transport.md#acp-事件--trace-span-桥接) |
| `AuditBridge` | [01 § Audit 桥接](./01-acp-transport.md#acp-事件--audit-桥接) |
| `handleAcpPermission` / 安全桥接 | [01 § ACP Permission → SecurityGuard 映射](./01-acp-transport.md#acp-permission--securityguard-映射) |
| `AcpToolCallEvent`, `AcpEvent`, `AcpStopReason` | `src/agent-runtime/acp/acp-types.ts` |
| `AgentDescriptor` | `src/types/agent.ts` |
| `SecurityGuard`, `SecurityContext`, `CommandIntention`, `SecurityDecision` | `src/types/security.ts` |
| `TraceContext`, `SpanHandle`, `startSpan` | `src/infrastructure/trace/tracer.ts` |
| `AuditHelper` | `src/infrastructure/audit/index.ts` |
| `TokenUsage`, `RunTaskResult` | `src/commands/run-task-shared.ts` |
| `cli.run-task.verification` span | [02 § verification trace span](./02-cli-commands.md#verification-trace-span) |
