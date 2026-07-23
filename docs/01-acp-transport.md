# 01 — ACP 通讯基座设计

> **本文档是类型权威定义点。** 以下类型被 03/04/06/07 等文档引用,修改时须同步。
> 详见文末 [被依赖类型清单](#被依赖类型清单)。

## 被依赖类型清单

以下类型定义在本文档中,被其他文档引用。修改时须同步检查所有引用方。

| 类型 | 定义位置 | 被引用方 |
|---|---|---|
| `AgentTransport` | [§ 核心接口](#核心接口) | 03, 04, 07 |
| `TransportRequest` | [§ 核心接口](#transportrequest-统一输入) | 03, 04 |
| `TransportResult` | [§ 核心接口](#transportresult-统一输出) | 03, 04 |
| `TransportError` / `TransportErrorCode` | [§ 核心接口](#transportresult-统一输出) | 03, 04 |
| `AcpConfig` | [§ 传输工厂](#传输工厂) | 02, 07 |
| `TraceBridge` | [§ ACP 事件 → Trace Span 桥接](#acp-事件--trace-span-桥接) | 07 |
| `AuditBridge` | [§ ACP 事件 → Audit 桥接](#acp-事件--audit-桥接) | 07 |
| 安全桥接 `handleAcpPermission` | [§ ACP Permission → SecurityGuard 映射](#acp-permission--securityguard-映射) | 06 |

> **复用的外部类型(非本文档定义):**
> - `AcpToolCallEvent`, `AcpEvent`, `AcpStopReason`, `AcpClientOptions` ← `src/agent-runtime/acp/acp-types.ts`
> - `AgentDescriptor` ← `src/types/agent.ts`
> - `SecurityGuard`, `SecurityContext`, `CommandIntention`, `SecurityDecision` ← `src/types/security.ts`
> - `TraceContext`, `SpanHandle`, `startSpan` ← `src/infrastructure/trace/tracer.ts`
> - `AuditHelper` ← `src/infrastructure/audit/index.ts`
> - `TokenUsage`, `RunTaskResult` ← `src/commands/run-task-shared.ts`

## 设计目标

用一个统一的 `AgentTransport` 接口替代当前的 `AgentAdapter.render()` + `environment.spawn()` 黑盒模式。ACP 是唯一的传输策略,但接口设计支持后期扩展(如 HTTP transport)。

## 核心接口

### AgentTransport — 传输策略接口

```typescript
// src/agent-runtime/transport/types.ts

interface AgentTransport {
  readonly kind: string;                                    // 'acp' | 'http' (后期扩展)
  execute(request: TransportRequest): Promise<TransportResult>;
  probe(descriptor: AgentDescriptor): Promise<boolean>;
}
```

> **设计说明:** `kind` 为 `string` 而非字面量 `'acp'`,使未来 HTTP transport 可实现同一接口。`AcpTransport` 的 `kind` 值为 `'acp'`。

### TransportRequest — 统一输入

```typescript
interface TransportRequest {
  descriptor: AgentDescriptor;
  workspaceRoot: string;
  taskPrompt: string;
  mode: 'run' | 'dry-run';
  traceContext: TraceContext;
  parentSpanId: string;
  securityContext: SecurityContext;
  envPatch?: Record<string, string>;
  timeoutMs: number;
  onPermission?: AcpClientOptions['onPermission'];
}
```

> **类型复用:** `onPermission` 的签名直接复用 `acp-types.ts` 中 `AcpClientOptions.onPermission` 的类型,不引入新的 `PermissionResponse` / `PermissionOption` 类型。

### TransportResult — 统一输出

```typescript
interface TransportResult {
  success: boolean;
  output: string;                    // agent 消息文本(拼接所有 message chunk)
  toolCalls: AcpToolCallEvent[];     // 复用 acp-types.ts 的类型
  stopReason: AcpStopReason;         // end_turn / max_tokens / max_turn_requests / refusal / cancelled
  usage?: TokenUsage;
  changedFiles: string[];             // 文件变更(从 tool_call 事件提取,复用 mapChangedFiles())
  events: AcpEvent[];                 // 复用 acp-types.ts 的 AcpEvent 联合类型
  error?: TransportError;
}

interface TransportError {
  code: TransportErrorCode;
  message: string;
  cause?: unknown;
}

type TransportErrorCode =
  | 'AGENT_SPAWN_FAILED'        // 进程启动失败(command not found / permission denied)
  | 'AGENT_CRASHED'             // 进程意外退出(initialize 之后)
  | 'INITIALIZE_FAILED'         // ACP initialize 握手失败(协议版本不匹配 / 能力交换失败)
  | 'SESSION_CREATE_FAILED'     // session/new 失败
  | 'PROMPT_TIMEOUT'            // session/prompt 超时(超过 timeoutMs)
  | 'PERMISSION_REJECTED'       // 用户/安全策略拒绝了关键权限请求,agent 无法继续
  | 'PROTOCOL_ERROR'            // JSON-RPC 协议错误(非预期消息 / 序列化失败)
  | 'UNKNOWN';
```

> **类型复用:** `toolCalls` 和 `events` 直接使用 `acp-types.ts` 中已有的 `AcpToolCallEvent` 和 `AcpEvent`,不引入重复的 `ToolCallRecord` / `TransportEvent` 类型。`AcpEvent` 已覆盖 message / tool_call / tool_call_update / plan / usage 五种事件,permission 和 session 生命周期事件由 trace/audit 桥接直接处理,不需要在 `events` 数组中重复。

> **StopReason 完整列表:** `end_turn` / `max_tokens` / `max_turn_requests` / `refusal` / `cancelled`(与 `acp-types.ts` 的 `AcpStopReason` 一致)。

## AgentDescriptor → AcpClientOptions 映射

`TransportRequest.descriptor` 是现有的 `AgentDescriptor` 类型(`src/types/agent.ts`),其字段面向 spawn 模式。`AcpTransport` 需要从中提取 ACP 客户端所需的 `command` / `args` / `cwd`:

```typescript
// src/agent-runtime/transport/descriptor-mapper.ts

function descriptorToAcpOptions(
  descriptor: AgentDescriptor,
  request: TransportRequest,
): AcpClientOptions {
  return {
    command: descriptor.entryCommand,           // e.g. 'opencode'
    args: buildAcpArgs(descriptor),             // e.g. ['acp'] or [descriptor.subcommand, 'acp']
    cwd: request.workspaceRoot,
    clientName: 'vectahub',
    clientVersion: getVectaHubVersion(),
    envPatch: { ...request.envPatch },
    timeoutMs: request.timeoutMs,
    onEvent: undefined,                         // 由 AcpTransport 内部注入
    onPermission: request.onPermission,         // 透传
  };
}

function buildAcpArgs(descriptor: AgentDescriptor): string[] {
  // 大多数 ACP agent 的子命令是 'acp'(如 `opencode acp`)
  // 如果 descriptor 有 subcommand,则 [subcommand, 'acp']
  if (descriptor.subcommand) {
    return [descriptor.subcommand, 'acp'];
  }
  return ['acp'];
}
```

> **注意:** `AgentDescriptor` 的 `promptTransport` / `promptArgName` / `nonInteractiveFlags` 等 spawn 时代字段在 ACP 模式下不再使用。这些字段在 B6 批次移除 `AgentAdapter` 时一并清理(见 [09-execution-plan.md](./09-execution-plan.md) B6)。

## ACP 传输实现

### AcpTransport 类

```typescript
// src/agent-runtime/transport/acp-transport.ts

class AcpTransport implements AgentTransport {
  readonly kind = 'acp';

  constructor(private config: AcpConfig) {}

  async execute(request: TransportRequest): Promise<TransportResult> {
    // === 1. 外层 trace span: cli.run-task.transport.execute ===
    const executeSpan = traceBridge.onTransportExecute(request);
    auditBridge.onTransportStart(request.securityContext.taskId ?? 'unknown', request.descriptor.id);

    try {
      // === 2. dry-run 快速路径 ===
      if (request.mode === 'dry-run') {
        return await this.executeDryRun(request);
      }

      // === 3. 映射 descriptor → AcpClientOptions ===
      const acpOptions = descriptorToAcpOptions(request.descriptor, request);

      // === 4. 注入 trace/audit 桥接回调 ===
      acpOptions.onEvent = (event: AcpEvent) => {
        traceBridge.onAcpEvent(event);
        auditBridge.onAcpEvent(event);
      };

      // === 5. 调用 PoC 客户端(已升级) ===
      const acpResult = await prompt(request.taskPrompt, acpOptions);

      // === 6. 映射结果 ===
      const stopResult = mapStopReason(acpResult.stopReason);
      const result: TransportResult = {
        success: stopResult.success,
        output: acpResult.message,
        toolCalls: acpResult.toolCalls,
        stopReason: acpResult.stopReason,
        usage: mapUsage(acpResult),
        changedFiles: mapChangedFiles(acpResult.toolCalls),
        events: acpResult.events,
        error: stopResult.success ? undefined : {
          code: stopToErrorCode(acpResult.stopReason),
          message: stopResult.errorMessage ?? 'Unknown error',
        },
      };

      // === 7. 关闭 trace/audit ===
      traceBridge.onTransportExecuteEnd(executeSpan, result.success, result.stopReason);
      auditBridge.onTransportEnd(request.securityContext.taskId ?? 'unknown', result.success);

      return result;

    } catch (err) {
      // === error path ===
      const transportError = mapErrorToTransportError(err, request);
      traceBridge.onTransportExecuteEnd(executeSpan, false, undefined, transportError);
      auditBridge.onTransportEnd(request.securityContext.taskId ?? 'unknown', false);
      auditBridge.onTransportFailed(transportError);

      return {
        success: false,
        output: '',
        toolCalls: [],
        stopReason: 'cancelled',
        changedFiles: [],
        events: [],
        error: transportError,
      };
    }
  }

  // --- 以下为伪代码,展示设计意图,非实际实现 ---

  async probe(descriptor: AgentDescriptor): Promise<boolean> {
    // spawn agent, try initialize, check if ACP protocol version matches
    // timeout 10s, cleanup on failure
    // 替代 cli-detector.ts 的 version/invocable/ready 检查
  }

  // === dry-run 实现 ===
  private async executeDryRun(request: TransportRequest): Promise<TransportResult> {
    // dry-run: 只做 probe() + prompt 预览,不创建 session
    const probeOk = await this.probe(request.descriptor);
    if (!probeOk) {
      return {
        success: false,
        output: '',
        toolCalls: [],
        stopReason: 'cancelled',
        changedFiles: [],
        events: [],
        error: { code: 'INITIALIZE_FAILED', message: 'Agent probe failed in dry-run' },
      };
    }
    return {
      success: true,
      output: `[dry-run] Would send prompt to ${request.descriptor.id}:\n${request.taskPrompt}`,
      toolCalls: [],
      stopReason: 'end_turn',
      changedFiles: [],
      events: [],
    };
  }
}
```

### 错误处理与超时策略

```typescript
// src/agent-runtime/transport/error-mapper.ts

function mapErrorToTransportError(err: unknown, request: TransportRequest): TransportError {
  // 进程启动失败
  if (err instanceof Error && err.message.includes('ENOENT')) {
    return { code: 'AGENT_SPAWN_FAILED', message: `Agent binary not found: ${request.descriptor.entryCommand}`, cause: err };
  }
  if (err instanceof Error && err.message.includes('EACCES')) {
    return { code: 'AGENT_SPAWN_FAILED', message: `Permission denied: ${request.descriptor.entryCommand}`, cause: err };
  }

  // ACP 协议错误
  if (err instanceof AcpProtocolError) {
    if (err.phase === 'initialize') {
      return { code: 'INITIALIZE_FAILED', message: err.message, cause: err };
    }
    if (err.phase === 'session_new') {
      return { code: 'SESSION_CREATE_FAILED', message: err.message, cause: err };
    }
    return { code: 'PROTOCOL_ERROR', message: err.message, cause: err };
  }

  // 进程崩溃(非零退出码,非超时)
  if (err instanceof ProcessExitError) {
    return { code: 'AGENT_CRASHED', message: `Agent process exited unexpectedly (code=${err.exitCode})`, cause: err };
  }

  // 超时
  if (err instanceof TimeoutError) {
    return { code: 'PROMPT_TIMEOUT', message: `Agent timed out after ${request.timeoutMs}ms`, cause: err };
  }

  return { code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err), cause: err };
}

function stopToErrorCode(stopReason: AcpStopReason): TransportErrorCode {
  switch (stopReason) {
    case 'max_tokens':        return 'PROMPT_TIMEOUT';    // token 限制视为超时
    case 'max_turn_requests': return 'PROMPT_TIMEOUT';
    case 'refusal':           return 'PERMISSION_REJECTED';
    case 'cancelled':         return 'PERMISSION_REJECTED';
    default:                  return 'UNKNOWN';
  }
}
```

**超时策略 — 单一定时器替代多定时器竞态:**

| 旧(spawn 模式) | 新(ACP 模式) | 说明 |
|---|---|---|
| `cliTimeoutMs` (600s) | `request.timeoutMs` | 唯一超时,覆盖整个 prompt turn |
| `idleTimeoutMs` (120s) | — 移除 | ACP 事件流是活跃信号,不需要 idle 检测 |
| `noCloseTimeoutMs` (180s) | — 移除 | `session/prompt` 的 Promise resolve 即完成,不需要 drain 等待 |
| `maxWallClockMs` (900s) | — 移除 | `timeoutMs` 已是 wall clock 上限 |

超时触发后:`child.kill('SIGKILL')` → `TimeoutError` → `mapErrorToTransportError()` → `TransportResult.error.code = 'PROMPT_TIMEOUT'`。

> **与 PoC 客户端的关系:** `acp-client.ts` 的 `prompt()` 函数已有 `setTimeout(() => child.kill('SIGKILL'), timeoutMs)` 逻辑。`AcpTransport` 复用此逻辑,不重新实现。

### dry-run 语义

| 模式 | 行为 | 适用场景 |
|---|---|---|
| `'run'` | 完整 ACP 流程:spawn → initialize → session/new → session/prompt → drain events → StopReason | 正常执行 |
| `'dry-run'` | 只做 `probe()` + prompt 预览,不创建 session,不发送 prompt | 预检、成本估算、命令预览 |

> **dry-run 不创建 session 的原因:** ACP 协议没有原生的 dry-run 概念。创建 session 后发送 prompt 就会触发实际工具调用。因此 dry-run 只验证 agent 可用性 + 展示将要发送的 prompt。

## ACP 事件 → Trace Span 桥接

与 [07-infrastructure.md](./07-infrastructure.md) 的 `TraceBridge` 接口对齐。覆盖 00 愿景要求的全部 7 个 trace span:

```typescript
// src/agent-runtime/transport/trace-bridge.ts

interface TraceBridge {
  // 最外层 span(00 愿景: cli.run-task.transport.execute)
  onTransportExecute(request: TransportRequest): SpanHandle;
  onTransportExecuteEnd(span: SpanHandle, success: boolean, stopReason?: AcpStopReason, error?: TransportError): void;

  // ACP initialize(00 愿景: cli.run-task.transport.acp.initialize)
  onInitialize(): SpanHandle;
  onInitializeEnd(span: SpanHandle, agentName: string, agentVersion: string): void;

  // ACP session/new(00 愿景: cli.run-task.transport.acp.session.new)
  onSessionStart(sessionId: string): SpanHandle;
  onSessionEnd(span: SpanHandle, stopReason: string): void;

  // ACP session/prompt(00 愿景: cli.run-task.transport.acp.prompt)
  onPrompt(): SpanHandle;
  onPromptEnd(span: SpanHandle, stopReason: string): void;

  // ACP tool_call(00 愿景: cli.run-task.transport.acp.tool_call)
  onToolCall(toolCall: AcpToolCallEvent): SpanHandle;
  onToolCallEnd(span: SpanHandle, toolCall: AcpToolCallEvent): void;

  // ACP permission(00 愿景: cli.run-task.transport.acp.permission)
  onPermission(toolTitle: string, decision: 'approved' | 'rejected' | 'auto_approved'): SpanHandle;

  // 通用事件分发
  onAcpEvent(event: AcpEvent): void;
}

function createTraceBridge(traceContext: TraceContext, parentSpanId: string): TraceBridge {
  const mk = (name: string, attrs?: Record<string, unknown>) =>
    startSpan(name, { context: traceContext, parentSpanId, kind: SpanKind.CLIENT, attributes: attrs });

  return {
    onTransportExecute(req) {
      return mk('cli.run-task.transport.execute', {
        agentId: req.descriptor.id,
        mode: req.mode,
        timeoutMs: req.timeoutMs,
      });
    },
    onTransportExecuteEnd(span, success, stopReason, error) {
      if (success) {
        span.end({ stopReason });
      } else {
        span.fail(error ?? new Error('Transport failed'), { stopReason });
      }
    },

    onInitialize() {
      return mk('cli.run-task.transport.acp.initialize');
    },
    onInitializeEnd(span, agentName, agentVersion) {
      span.end({ agentName, agentVersion });
    },

    onSessionStart(sessionId) {
      return mk('cli.run-task.transport.acp.session.new', { sessionId });
    },
    onSessionEnd(span, stopReason) {
      span.end({ stopReason });
    },

    onPrompt() {
      return mk('cli.run-task.transport.acp.prompt');
    },
    onPromptEnd(span, stopReason) {
      span.end({ stopReason });
    },

    onToolCall(tc) {
      return mk('cli.run-task.transport.acp.tool_call', {
        toolCallId: tc.toolCallId, kind: tc.kind, title: tc.title,
      });
    },
    onToolCallEnd(span, tc) {
      if (tc.status === 'failed') {
        span.fail(new Error(`Tool call failed: ${tc.title}`));
      } else {
        span.end({ status: tc.status });
      }
    },

    onPermission(toolTitle, decision) {
      const span = mk('cli.run-task.transport.acp.permission', { toolTitle, decision });
      span.end({ decision });
      return span;
    },

    onAcpEvent(event) {
      // 细粒度事件 → 对应 span 的 attributes 更新
      // 不创建新 span,只更新当前活跃 span 的 attributes
    },
  };
}
```

**Trace span 完整覆盖对照(00 愿景 → 01 实现):**

| 00 愿景 span | 01 TraceBridge 方法 | 状态 |
|---|---|---|
| `cli.run-task.transport.execute` | `onTransportExecute` / `onTransportExecuteEnd` | ✅ |
| `cli.run-task.transport.acp.initialize` | `onInitialize` / `onInitializeEnd` | ✅ |
| `cli.run-task.transport.acp.session.new` | `onSessionStart` / `onSessionEnd` | ✅ |
| `cli.run-task.transport.acp.prompt` | `onPrompt` / `onPromptEnd` | ✅ |
| `cli.run-task.transport.acp.permission` | `onPermission` | ✅ |
| `cli.run-task.transport.acp.tool_call` | `onToolCall` / `onToolCallEnd` | ✅ |
| `cli.run-task.verification` | — | 归属 [02-cli-commands.md](./02-cli-commands.md) |

## ACP 事件 → Audit 桥接

与 [07-infrastructure.md](./07-infrastructure.md) 的 `AuditBridge` 接口对齐。覆盖 00 愿景要求的全部审计记录:

```typescript
// src/agent-runtime/transport/audit-bridge.ts

interface AuditBridge {
  // 00 愿景: SECURITY_ACTION EXECUTING / COMPLETED / FAILED
  onTransportStart(taskId: string, agentId: string): void;
  onTransportEnd(taskId: string, success: boolean, durationMs: number): void;
  onTransportFailed(error: TransportError): void;

  // 00 愿景: SECURITY_ACTION BLOCKED (permission 被拒绝)
  onPermission(toolTitle: string, decision: string, sessionId: string): void;
  onSecurityBlock(toolTitle: string, ruleName: string): void;

  // 00 愿景: EXECUTOR_RESULT (per tool_call)
  onToolCallResult(toolCall: AcpToolCallEvent, sessionId: string): void;

  // 通用事件分发
  onAcpEvent(event: AcpEvent): void;
}

function createAuditBridge(audit: AuditHelper): AuditBridge {
  return {
    onTransportStart(taskId, agentId) {
      audit.securityAction('TRANSPORT_EXECUTE', agentId, 'EXECUTING', taskId);
    },
    onTransportEnd(taskId, success, durationMs) {
      audit.securityAction('TRANSPORT_EXECUTE', '', success ? 'COMPLETED' : 'FAILED', taskId);
    },
    onTransportFailed(error) {
      audit.securityAction('TRANSPORT_EXECUTE', '', 'FAILED', undefined);
    },
    onPermission(toolTitle, decision, sessionId) {
      audit.securityAction('ACP_PERMISSION', toolTitle, decision, sessionId);
    },
    onSecurityBlock(toolTitle, ruleName) {
      audit.securityAction('ACP_PERMISSION', toolTitle, 'BLOCKED', undefined);
      audit.securityAlert(ruleName, toolTitle, 'high', undefined);
    },
    onToolCallResult(tc, sessionId) {
      audit.executorResult(tc.toolCallId, tc.title, tc.status === 'completed' ? 0 : 1, 0, sessionId, {
        kind: tc.kind,
        locations: tc.locations,
      });
    },
    onAcpEvent(event) {
      // usage 事件可触发 telemetry audit(如需要)
    },
  };
}
```

**Audit 记录完整覆盖对照(00 愿景 → 01 实现):**

| 00 愿景 audit 记录 | 01 AuditBridge 方法 | 状态 |
|---|---|---|
| `SECURITY_ACTION EXECUTING` | `onTransportStart` | ✅ |
| `SECURITY_ACTION COMPLETED` | `onTransportEnd(success=true)` | ✅ |
| `SECURITY_ACTION FAILED` | `onTransportEnd(success=false)` / `onTransportFailed` | ✅ |
| `SECURITY_ACTION BLOCKED` | `onSecurityBlock` | ✅ |
| `EXECUTOR_RESULT (per tool_call)` | `onToolCallResult` | ✅ |

## ACP Permission → SecurityGuard 映射

与 [06-security-protocol.md](./06-security-protocol.md) 对齐。补全 `REDACTED` 决策处理,利用 ACP tool call 的结构化字段:

```typescript
// src/agent-runtime/transport/security-bridge.ts

interface AcpPermissionRequest {
  toolCall: {
    title: string;
    kind: AcpToolKind;
  };
  options: {
    optionId: string;
    name: string;
    kind: string;           // 'allow_once' | 'allow_always' | 'reject_once'
  }[];
}

async function handleAcpPermission(
  request: AcpPermissionRequest,
  guard: SecurityGuard,
  context: SecurityContext,
  audit: AuditHelper,
): Promise<{ optionId: string } | { cancelled: true }> {
  const { title, kind } = request.toolCall;

  // 1. 无副作用的工具自动批准
  if (kind === 'think' || kind === 'switch_mode') {
    audit.securityAction('ACP_PERMISSION', title, 'AUTO_APPROVED', context.sessionId);
    return { optionId: findOption(request.options, 'allow_once') };
  }

  // 2. 构造结构化 CommandIntention(利用 ACP tool call 的 kind + title)
  const intention = buildIntentionFromAcpTool(kind, title);

  // 3. SecurityGuard 评估
  const decision = await guard.assess(intention, context);

  // 4. 审计记录
  audit.securityAction('ACP_PERMISSION', title, decision.decision, context.sessionId);

  // 5. 映射到 ACP 响应(处理全部 4 种决策)
  switch (decision.decision) {
    case 'PASSED':
      return { optionId: findOption(request.options, 'allow_once') };

    case 'BLOCKED':
      audit.securityAlert(decision.ruleName ?? 'unknown', title, decision.riskLevel, context.sessionId);
      return { optionId: findOption(request.options, 'reject_once') };

    case 'REQUIRES_CONFIRMATION':
      // 当前行为: 自动拒绝(与 run-task.ts 一致)
      // 后续可接入用户确认 UI(转发 onPermission 回调)
      return { optionId: findOption(request.options, 'reject_once') };

    case 'REDACTED':
      // 输出需要脱敏,但工具调用本身可以执行
      // 返回 allow_once,Redactor 在事件层处理输出脱敏
      return { optionId: findOption(request.options, 'allow_once') };

    default:
      // 穷尽性检查:未来新增决策类型时编译报错
      const _exhaustive: never = decision.decision;
      return { cancelled: true };
  }
}

function buildIntentionFromAcpTool(kind: AcpToolKind, title: string): CommandIntention {
  switch (kind) {
    case 'execute':
      // title 就是命令本身(e.g. "echo TEST > /tmp/marker.txt")
      return { rawCommand: title, tool: 'bash' };
    case 'edit':
    case 'delete':
    case 'read':
    case 'move':
    case 'search':
    case 'fetch':
      return { rawCommand: `${kind} ${title}`, tool: kind };
    default:
      return { rawCommand: title, tool: kind };
  }
}

function findOption(options: AcpPermissionRequest['options'], kind: string): string {
  const opt = options.find((o) => o.kind === kind);
  if (!opt) {
    // 如果 agent 没有提供请求的 option kind,fallback 到 reject_once
    const reject = options.find((o) => o.kind === 'reject_once');
    return reject?.optionId ?? options[0]?.optionId ?? '';
  }
  return opt.optionId;
}
```

**映射规则表(与 06 对齐):**

| ACP tool kind | 构造的 CommandIntention | SecurityGuard 评估 | ACP 响应 |
|---|---|---|---|
| `execute` (bash) | `{ rawCommand: title, tool: 'bash' }` | 正常评估 | PASSED → allow_once; BLOCKED → reject_once; REDACTED → allow_once |
| `edit` (文件写入) | `{ rawCommand: 'edit ' + title, tool: 'edit' }` | 正常评估 | 同上 |
| `read` (文件读取) | `{ rawCommand: 'read ' + title, tool: 'read' }` | 正常评估(通常 PASSED) | 同上 |
| `delete` | `{ rawCommand: 'delete ' + title, tool: 'delete' }` | 正常评估 | 同上 |
| `move` | `{ rawCommand: 'move ' + title, tool: 'move' }` | 正常评估 | 同上 |
| `search` | `{ rawCommand: 'search ' + title, tool: 'search' }` | 正常评估(通常 PASSED) | 同上 |
| `fetch` | `{ rawCommand: 'fetch ' + title, tool: 'fetch' }` | 正常评估 | 同上 |
| `think` | 不评估(无副作用) | — | auto allow_once |
| `switch_mode` | 不评估(无副作用) | — | auto allow_once |
| `other` | 不评估(未知) | — | auto reject_once |

> **REDACTED 处理说明:** `REDACTED` 表示命令可以执行但输出需要脱敏。ACP 模式下,`Redactor` 在事件层处理 `agent_message_chunk` 和 `tool_call.rawOutput` 的脱敏,不需要阻止工具调用。这与 06 文档的 `Redactor` 适配到 ACP 事件内容一致。

> **穷尽性检查:** switch 的 `default` 分支使用 `never` 类型,确保未来新增 `SecurityDecisionType` 时编译报错,强制更新映射逻辑。

## 传输工厂

```typescript
// src/agent-runtime/transport/factory.ts

// 初次启动时规定的 ACP agent 配置(与 07-infrastructure.md 的 VectaHubConfig.acp 对齐)
interface AcpConfig {
  agentId: string;        // 'opencode' | 'claude' | 'codex' | ...
  command: string;        // 'opencode'
  args: string[];         // ['acp']
  defaultTimeoutMs: number;
  permissionMode: 'ask' | 'allow' | 'deny';  // 默认 'ask'
}

function createTransport(config: AcpConfig): AgentTransport {
  return new AcpTransport(config);
}
```

## run-task.ts 集成点

`AcpTransport` 替换 `run-task.ts` 中约 300 行的 spawn 块(详细执行计划见 [09-execution-plan.md](./09-execution-plan.md) B2):

```typescript
// src/commands/run-task.ts — 改造前后对比

// === 改造前(spawn 黑盒) ===
// const adapter = getAgentAdapterById(tool);
// const adapterOutput = adapter.render({ descriptor, workspaceRoot, taskPrompt, mode });
// const child = environment.spawn(adapterOutput.command, adapterOutput.args, { ... });
// ... ~300 行多定时器竞态 + heuristic 完成检测 ...

// === 改造后(ACP transport) ===
const transport = createTransport(acpConfig);
const result = await transport.execute({
  descriptor: agentDescriptor,
  workspaceRoot,
  taskPrompt,
  mode: dryRun ? 'dry-run' : 'run',
  traceContext,
  parentSpanId,
  securityContext,
  timeoutMs: acpConfig.defaultTimeoutMs,
});

// 映射 TransportResult → AcpExecutionResult → RunTaskResult
// 实际实现拆分为两层:
//   1. run-task-acp.ts: mapTransportToExecutionResult() → AcpExecutionResult
//   2. run-task.ts: 手动构建 RunTaskResult (含 verification/gitChanges/recovery 等)
const acpResult = await executeViaAcpTransport({ transport, ... });
// acpResult 包含: success/output/stopReason/agentExecutionOutcome/usage/changedFiles/error/failureKind/toolCalls
```

```typescript
// src/commands/run-task-acp.ts — ACP 执行桥接
// TransportResult 定义见 01-acp-transport.md § TransportResult
// AcpToolCallEvent 定义见 src/agent-runtime/acp/acp-types.ts

export async function executeViaAcpTransport(input: AcpExecutionInput): Promise<AcpExecutionResult> {
  const result: TransportResult = await input.transport.execute(request);
  return mapTransportToExecutionResult(result);
}

export function mapTransportToExecutionResult(result: TransportResult): AcpExecutionResult {
  const agentExecutionOutcome = deriveExecutionOutcome(result.toolCalls);
  // ...映射 success/output/stopReason/usage/changedFiles/error/failureKind/toolCalls
}

// run-task.ts 中手动构建 RunTaskResult (含 verification/gitChanges/recovery 等字段)
// AcpExecutionResult 是中间类型,不直接等于 RunTaskResult

**移除的代码(对应 09 执行计划 B2):**

| 移除项 | 行数(约) | 替代方案 |
|---|---|---|
| spawn 块(多定时器竞态) | ~300 行 | `transport.execute()` |
| `detectAgentExecutionOutcome()` heuristic | ~40 行 | `mapTransportToRunTaskResult()` 中的 tool_call 状态检查 |
| `classifyAgentFailureCode()` heuristic | ~30 行 | `TransportResult.error.code` |
| `parseTokenUsage()` 正则扫描 | ~20 行 | `mapUsage()` 从 ACP usage_update 事件提取 |
| `RedactionTransform` 在 spawn 中的使用 | — | 保留类,但不在 transport 中使用(Redactor 适配到 ACP 事件层) |

## 已有代码复用

| 已有代码 | 复用方式 |
|---|---|
| `src/agent-runtime/acp/acp-client.ts` (PoC) | 升级为 `AcpTransport.execute()` 的核心调用 |
| `src/agent-runtime/acp/acp-result-mapper.ts` | 复用 `mapStopReason`, `mapChangedFiles`, `mapUsage`, `mapToRunTaskResult` |
| `src/agent-runtime/acp/acp-types.ts` | 复用 `AcpEvent`, `AcpPromptResult`, `AcpToolCallEvent`, `AcpStopReason`, `AcpClientOptions` |
| `src/infrastructure/trace/tracer.ts` | `startSpan()` / `withSpan()` / `SpanHandle` 完全复用 |
| `src/infrastructure/audit/` | `AuditHelper` 完全复用(`securityAction`, `securityAlert`, `executorResult`) |
| `src/security-protocol/guard.ts` | `SecurityGuard.assess()` 完全复用 |
| `src/security-protocol/redactor.ts` | `Redactor` 保留,适配到 ACP 事件内容脱敏 → 详见 [06-security-protocol.md](./06-security-protocol.md) |
| `src/commands/run-task-spawner.ts` | `RedactionTransform` 保留(CLI exec step 仍需要) → 去留详见 [03-workflow-engine.md](./03-workflow-engine.md) |
| `src/commands/run-task-shared.ts` | `TokenUsage`, `RunTaskResult` 类型复用 |

## 需要移除的代码

> **职责边界:** 本表只列出 01(ACP transport 层)直接负责的移除项。
> 以下条目的移除归属其他文档:
> - `adapters/*.ts`、`generic-adapter.ts`、`cli-detector.ts`、`llm-inferencer.ts`、`config-loader.ts`、`provider-registrar.ts` → [08-llm-removal.md § Agent Runtime](./08-llm-removal.md#agent-runtime)
> - `run-task-spawner.ts` 的 spawn 状态机、`run-task-logger.ts` 的 heuristic 函数 → [03-workflow-engine.md](./03-workflow-engine.md)(exec step 改造) + [04-document-task.md](./04-document-task.md)(heuristic 移除)
> - `types/agent.ts` 的 `AgentAdapter` 接口 → [08-llm-removal.md § Agent Runtime](./08-llm-removal.md#agent-runtime)

| 代码 | 原因 | 状态 |
|---|---|---|
| `src/commands/run-task.ts` 的 spawn 块(~300 行) | ACP `StopReason` 替代 | ✅ 已完成 |
| `src/commands/run-task.ts` 的 LLM 命令生成路径 | ACP transport 不需要生成 CLI 命令 | ✅ 已完成 |
| `src/commands/run-task.ts` 的 heuristic 函数调用 | ACP 事件替代 | ✅ 已完成 |
| `src/commands/run-task.ts` 的 `bootstrapAgentRuntime` 调用 | ACP 不需要 runtime bootstrap | ✅ 已完成 |
| `src/commands/run-task.ts` 的 preflight `--version` 检查 | `transport.probe()` 替代 | ✅ 已完成 |

## PoC 验证结果

已在 PoC 中验证:
- ✅ `opencode acp` initialize + capability exchange
- ✅ session/new + session/prompt + session/update 事件流
- ✅ tool_call 事件(kind/status/locations/rawInput/rawOutput)
- ✅ usage_update 事件(token + cost)
- ✅ StopReason(end_turn)
- ✅ session/request_permission approve + reject 两条路径
- ✅ mapToRunTaskResult 成功映射
