# 07 — 基础设施层

> **状态: 已完成 — trace/audit 桥接 + ACP Event Bus 集成均已实现**

> **依赖清单** — 本文档引用以下外部定义,实现时须加载:
> - `AcpToolCallEvent`, `AcpEvent`, `AcpStopReason` → `src/agent-runtime/acp/acp-types.ts`
> - `TransportRequest`, `TransportResult`, `TransportError` → [01-acp-transport.md § 核心接口](./01-acp-transport.md#核心接口)
> - `TraceBridge`, `AuditBridge` 的权威定义在 [01-acp-transport.md](./01-acp-transport.md#acp-事件--trace-span-桥接)。本文描述基础设施侧的集成点。

## 当前基础设施(完全保留)

### InfrastructureContext — DI 容器

```typescript
// src/infrastructure/context.ts

class InfrastructureContext {
  environment: IEnvironmentService;   // FS, env, spawn, exec
  config: IConfigService;             // 配置读写
  logger: ILoggerService;             // 日志
  eventBus: IEventBus;               // 事件总线
  audit: IAuditService;              // 审计(延迟初始化)
  
  with(overrides): InfrastructureContext;  // 局部覆盖
}
```

**DI 纪律:** `getDefaultContext()` 只允许出现在 `context.ts`、`cli-main.ts`、`cli-bootstrap.ts`、`*-bridge.ts`。CI 检查强制执行。

### Trace 系统

```
src/infrastructure/trace/
├── types.ts      — TraceSpanRecord, TraceContext, SpanKind
├── context.ts    — ID 生成, 环境变量传播
├── tracer.ts     — startSpan(), withSpan(), SpanHandle
├── writer.ts    — JSONL 持久化 + 脱敏
└── index.ts      — barrel export
```

**Span 生命周期:**
1. `startSpan(name, options)` → `SpanHandle`
2. `span.end(attributes)` → status='completed', 持久化
3. `span.fail(error, attributes)` → status='failed', 持久化

**持久化:** `{projectRoot}/.vectahub/logs/traces/{date}.jsonl`(每行一个 span)

**跨进程传播:** `VECTAHUB_TRACE_ID` / `VECTAHUB_PARENT_SPAN_ID` / `VECTAHUB_TRACE_SOURCE` 环境变量

### Audit 系统

```
src/infrastructure/audit/
├── index.ts      — AuditLogger + AuditHelper
├── service.ts    — AuditService (fail-open / fail-closed)
└── env-audit.ts  — 系统能力探测
```

**AuditHelper 方法:**
- `securityAction(action, target, result, sessionId)` — 安全动作
- `workflowStart/Step/End(...)` — workflow 生命周期
- `executorResult(stepId, cli, exitCode, duration, sessionId)` — 执行结果
- `sandboxDetect(command, isDangerous, severity)` — sandbox 检测

**持久化:** `~/.vectahub/logs/audit/{date}.jsonl`(每行一个事件,自动脱敏)

### Event Bus

```typescript
interface IEventBus {
  on(event, listener, context?): void;
  once(event, listener, context?): void;
  off(event, listener?): void;
  offByContext(context): void;
  emit(event, ...args): void;
}
```

通用 string-keyed pub/sub,支持 context 分组清理。

### Environment Service

```typescript
interface IEnvironmentService {
  // 路径
  getHomePath(): string;
  resolvePath(...segments): string;
  
  // 文件系统
  readFile(path): string;
  writeFile(path, content): void;
  exists(path): boolean;
  ensureDir(path): void;
  
  // 环境变量
  getEnv(key): string | undefined;
  getAllEnv(): NodeJS.ProcessEnv;
  
  // 进程控制
  exec(command, args, options): Promise<CLIResult>;
  spawn(command, args, options): ChildProcess;
  getCwd(): string;
  getPlatform(): string;
}
```

## ACP 改造对基础设施的影响

### 新增: ACP 事件 → Trace 桥接

> **权威定义:** `TraceBridge` 接口的完整定义在 [01-acp-transport.md § ACP 事件 → Trace Span 桥接](./01-acp-transport.md#acp-事件--trace-span-桥接)。
> 01 定义了覆盖 00 愿景全部 6 个 span 的方法。此处仅展示基础设施侧的集成点。

```typescript
// src/agent-runtime/transport/trace-bridge.ts
// 完整接口定义见 01-acp-transport.md § ACP 事件 → Trace Span 桥接

interface TraceBridge {
  // 最外层 span: cli.run-task.transport.execute
  onTransportExecute(request: TransportRequest): SpanHandle;
  onTransportExecuteEnd(span: SpanHandle, success: boolean, stopReason?: AcpStopReason, error?: TransportError): void;

  // ACP initialize: cli.run-task.transport.acp.initialize
  onInitialize(): SpanHandle;
  onInitializeEnd(span: SpanHandle, agentName: string, agentVersion: string): void;

  // ACP session/new: cli.run-task.transport.acp.session.new
  onSessionStart(sessionId: string): SpanHandle;
  onSessionEnd(span: SpanHandle, stopReason: string): void;

  // ACP session/prompt: cli.run-task.transport.acp.prompt
  onPrompt(): SpanHandle;
  onPromptEnd(span: SpanHandle, stopReason: string): void;

  // ACP tool_call: cli.run-task.transport.acp.tool_call
  onToolCall(toolCall: AcpToolCallEvent): SpanHandle;   // ← AcpToolCallEvent,非 ToolCallRecord
  onToolCallEnd(span: SpanHandle, toolCall: AcpToolCallEvent): void;

  // ACP permission: cli.run-task.transport.acp.permission
  onPermission(toolTitle: string, decision: 'approved' | 'rejected' | 'auto_approved'): SpanHandle;

  // 通用事件分发
  onAcpEvent(event: AcpEvent): void;
}
```

### 新增: ACP 事件 → Audit 桥接

> **权威定义:** `AuditBridge` 接口的完整定义在 [01-acp-transport.md § ACP 事件 → Audit 桥接](./01-acp-transport.md#acp-事件--audit-桥接)。
> 01 定义了覆盖 00 愿景全部 5 种审计记录的方法。此处仅展示基础设施侧的集成点。

```typescript
// src/agent-runtime/transport/audit-bridge.ts
// 完整接口定义见 01-acp-transport.md § ACP 事件 → Audit 桥接

interface AuditBridge {
  // 00 愿景: SECURITY_ACTION EXECUTING / COMPLETED / FAILED
  onTransportStart(taskId: string, agentId: string): void;
  onTransportEnd(taskId: string, success: boolean, durationMs: number): void;
  onTransportFailed(error: TransportError): void;

  // 00 愿景: SECURITY_ACTION BLOCKED (permission 被拒绝)
  onPermission(toolTitle: string, decision: string, sessionId: string): void;
  onSecurityBlock(toolTitle: string, ruleName: string): void;

  // 00 愿景: EXECUTOR_RESULT (per tool_call)
  onToolCallResult(toolCall: AcpToolCallEvent, sessionId: string): void;   // ← AcpToolCallEvent,非 ToolCallRecord

  // 通用事件分发
  onAcpEvent(event: AcpEvent): void;
}
```

### 新增: ACP 事件 → Event Bus

```typescript
// ACP 事件通过 event bus 发布,供 UI/日志订阅
eventBus.emit('acp:message', { messageId, text });
eventBus.emit('acp:tool_call', { toolCallId, kind, status });
eventBus.emit('acp:permission', { toolTitle, decision });
eventBus.emit('acp:usage', { used, max });
eventBus.emit('acp:stop', { stopReason });
```

### 不变的基础设施

| 组件 | 改动 |
|---|---|
| `InfrastructureContext` | 无(ACP transport 通过 DI 接收 context) |
| `IEnvironmentService` | `spawn()` 不再被 agent 调用使用,但 `exec()` 仍用于验证命令 |
| Trace 系统 | 无(新增 span 通过现有 `startSpan()` API) |
| Audit 系统 | 无(新增 audit 通过现有 `AuditHelper` API) |
| Event Bus | 无(新增事件通过现有 `emit()` API) |
| Logger | 无 |
| Config | 新增 ACP agent 配置字段 |

## ACP 配置存储

```typescript
// config 新增字段
interface VectaHubConfig {
  // ... 现有字段 ...
  
  acp: {
    agentId: string;          // 'opencode' | 'claude' | 'codex'
    command: string;          // 'opencode'
    args: string[];           // ['acp']
    defaultTimeoutMs: number;  // 600000
    permissionMode: 'ask' | 'allow' | 'deny';  // 默认 'ask'
  };
}
```

## 测试基础设施

### createTestInfrastructureContext()

现有测试工具,提供内存化的 InfrastructureContext:
- `environment.spawn()` 返回 mock ChildProcess
- `environment.exec()` 返回预设结果
- `environment.exists()` 返回 false
- trace/audit 写入内存

**ACP 改造后:** 需要新增 `createTestTransport()` mock:
```typescript
// TransportResult 定义见 01-acp-transport.md § TransportResult
// AcpEvent 定义见 src/agent-runtime/acp/acp-types.ts

function createTestTransport(overrides?: Partial<TransportResult>): AgentTransport {
  return {
    kind: 'acp',
    execute: async () => ({
      success: true,
      output: 'test output',
      toolCalls: [],
      stopReason: 'end_turn' as AcpStopReason,
      changedFiles: [],
      events: [] as AcpEvent[],
      ...overrides,
    }),
    probe: async () => true,
  };
}
```
