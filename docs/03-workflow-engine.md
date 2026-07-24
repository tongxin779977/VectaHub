# 03 — Workflow 引擎改造

> **状态: 已完成 — delegate handler 走 ACP transport,exec-handler agent runtime bootstrap 已移除**

> **依赖清单** — 本文档引用以下外部定义,实现时须加载:
> - `AgentTransport`, `TransportRequest`, `TransportResult`, `TransportError` → [01-acp-transport.md § 核心接口](./01-acp-transport.md#核心接口)
> - `AcpToolCallEvent`, `AcpStopReason` → `src/agent-runtime/acp/acp-types.ts`
> - `AgentDescriptor` → `src/types/agent.ts`
> - `SecurityGuard`, `SecurityContext` → [06-security-protocol.md](./06-security-protocol.md) / `src/types/security.ts`
> - `TraceContext`, `SpanHandle` → [07-infrastructure.md § Trace 系统](./07-infrastructure.md#trace-系统)
> - `WorkerResult` → `src/orchestration-plan/worker-result.ts`

## 当前状态

Workflow 引擎支持 6 种 step 类型,通过 `StepHandler` 接口分发:

| Step 类型 | 当前实现 | 用 LLM? | 用 Agent CLI? |
|---|---|---|---|
| `exec` | 本地 CLI spawn + 安全检测 + agent runtime bootstrap | 否 | 是(识别 agent CLI) |
| `if` | JsonLogic 条件评估 + body 递归执行 | 否 | 否 |
| `for_each` | JSON array / newline 迭代 + body 递归执行 | 否 | 否 |
| `parallel` | Promise.all body 并发执行 | 否 | 否 |
| `opencli` | `opencli <site> <command>` spawn | 否 | 否 |
| `delegate` | Agent CLI adapter.render() + spawn + normalizeWorkerResult | 否 | 是 |

## 改造方案

### delegate step — 全面 ACP 化

```yaml
# 改造前
- id: delegate-1
  type: delegate
  delegateTo: codex
  delegatePrompt: "Add tests for src/foo.ts"
  delegateOptions:
    maxTurns: 10
    allowedTools: ["write", "edit"]
    timeout: 300000

# 改造后
- id: delegate-1
  type: delegate
  delegateTo: opencode        # ACP agent ID
  delegatePrompt: "Add tests for src/foo.ts"
  delegateOptions:
    timeout: 300000
    permission: "ask"          # bash/edit 需要 ACP permission
```

**改造点:**

1. `delegateTo` 从 Agent CLI ID 改为 ACP agent ID
2. `delegateOptions.maxTurns` / `allowedTools` 移除(ACP 协议管理)
3. `delegateOptions.permission` 新增(控制 ACP permission 行为)
4. handler 内部从 `adapter.render() + exec()` 改为 `transport.execute()`
5. `normalizeWorkerResult()` 从 `TransportResult` 构建而非 raw stdout/stderr

### exec step — 保留,移除 agent runtime bootstrap

`exec` step 用于本地命令执行(npm test / tsc / git 等),不涉及 ACP。但当前 `exec-handler.ts` 会检查 `getAgentDescriptorById(interpolatedCli)` 来做 agent runtime bootstrap — 这部分移除。

```typescript
// exec-handler.ts 改造
// 移除: if (getAgentDescriptorById(cli)) { bootstrapAgentRuntime(...) }
// 保留: 安全检测 + sandbox + exec + audit
```

#### RedactionTransform 去留

`exec-handler.ts` 使用 `RedactionTransform`(`src/commands/run-task-spawner.ts`)对本地命令的 stdout/stderr 做实时脱敏。ACP transport 路径不需要 `RedactionTransform`(脱敏在 ACP 事件层处理,详见 [06-security-protocol.md](./06-security-protocol.md)),但 `exec` step 仍需要它。

| 组件 | ACP transport 路径 | exec step 路径 | 处理方式 |
|---|---|---|---|
| `RedactionTransform` | 不使用 | 继续使用 | 保留 `run-task-spawner.ts` 中的 `RedactionTransform` 类,标注 `@internal` |
| `run-task-spawner.ts` 的 spawn 状态机 | 已移除 | 不使用(exec 用 `environment.exec()`) | 标记 `@deprecated`,后续清理 |
| `run-task-logger.ts` 的 heuristic 函数 | 已移除 | 不使用 | 标记 `@deprecated`,后续清理 |

### opencli step — 保留不变

`opencli` 是通用 CLI 调用,不涉及 agent,不需要改造。

### if / for_each / parallel — 保留不变

这三个是控制流 step,不涉及 agent 调用,不需要改造。

## delegate-handler.ts 改造详情

### 当前实现(335 行)

```
1. 检查 deps.agentModule (legacy AIModule path)
2. makeDelegationDecision(mockTask) — 能力检查
3. getAgentDescriptorById(delegateTo) + getAgentAdapterById(delegateTo)
4. adapter.render({ descriptor, workspaceRoot, taskPrompt, mode, outputMode })
5. dry-run → return preview
6. bootstrapAgentRuntime() — 复制 config 文件
7. preflight exec(descriptor.entryCommand, preflightArgs)
8. exec(adapterOutput.command, adapterOutput.args, options)
9. normalizeWorkerResult(delegateTo, { stdout, stderr, exitCode, executionTimeMs })
10. 返回 ExecutionResult
```

### 改造后(~150 行)

```typescript
export const createDelegateHandler = (deps: DelegateHandlerDeps = {}) => {
  return async (step, options, context, executeStep, startTime) => {
    const { delegateTo, delegatePrompt } = step;
    if (!delegateTo || !delegatePrompt) {
      return failedResult(step.id, 'delegate step requires delegateTo and delegatePrompt', startTime);
    }

    // 1. 获取 ACP transport(从 DI 或全局配置)
    const transport = deps.getTransport?.() ?? getDefaultTransport();
    
    // 2. dry-run
    if (options.dryRun) {
      return { stepId: step.id, status: 'COMPLETED', output: [`[dry-run] delegate to ${delegateTo}: ${delegatePrompt}`], duration: Date.now() - startTime };
    }

    // 3. 执行 ACP transport
    //    TransportRequest 定义见 01-acp-transport.md § TransportRequest
    const result: TransportResult = await transport.execute({
      descriptor: { id: delegateTo } as AgentDescriptor,
      workspaceRoot: deps.getEnvironmentCwd(),
      taskPrompt: delegatePrompt,
      mode: 'run',
      traceContext: context.traceContext,
      parentSpanId: context.parentSpanId,
      securityContext: { cwd: deps.getEnvironmentCwd(), sessionId: context.sessionId },
      timeoutMs: step.delegateOptions?.timeout ?? 300000,
      onPermission: createPermissionHandler(deps.securityGuard, context),
    });

    // 4. 构建 WorkerResult
    const workerResult: WorkerResult = {
      schemaVersion: '1.0',
      workerId: delegateTo,
      status: result.success ? 'success' : 'failure',
      summary: result.output,
      exitCode: result.success ? 0 : 1,
      failureKind: result.error?.code,
      failureReason: result.error?.message,
      changedFiles: result.changedFiles.map(path => ({ path, status: 'modified' as const })),
      artifacts: result.toolCalls.map(tc => ({  // artifacts 不再为空!
        id: tc.toolCallId,
        type: tc.kind,
        summary: tc.title,
      })),
      executionTimeMs: Date.now() - startTime,
      redacted: true,
      verificationRequired: delegatedTaskRequiresVerification(mockTask),
    };

    // 5. 返回 ExecutionResult
    return {
      stepId: step.id,
      status: workerResult.status === 'success' ? 'COMPLETED' : 'FAILED',
      output: [workerResult.summary],
      error: workerResult.failureReason,
      exitCode: workerResult.exitCode,
      duration: Date.now() - startTime,
    };
  };
};
```

### 关键改进

| 维度 | 当前 | 改造后 |
|---|---|---|
| artifacts | 永远为空 `[]` | 从 ACP tool_call 事件填充 |
| changedFiles | 从未填充(delegate handler 不做 git diff) | 从 ACP tool_call 事件提取 |
| 完成检测 | exit code + timeout | ACP StopReason |
| 权限控制 | 无 | ACP session/request_permission → SecurityGuard |
| trace | 只有 audit.workflowStep | 每个 tool_call 自动生成 trace span |

## WorkerResult 改造

```typescript
// 改造前: normalizeWorkerResult 从 raw stdout/stderr/exitCode 构建
// 改造后: 从 TransportResult 直接构建
// TransportResult 定义见 01-acp-transport.md § TransportResult
// AcpToolCallEvent 定义见 src/agent-runtime/acp/acp-types.ts

function mapTransportToWorkerResult(
  transportResult: TransportResult,        // → 01-acp-transport.md
  workerId: string,
  executionTimeMs: number,
  verificationRequired: boolean,
): WorkerResult {
  return {
    schemaVersion: '1.0',
    workerId,
    status: transportResult.success ? 'success' : 'failure',
    summary: transportResult.output,
    exitCode: transportResult.success ? 0 : 1,
    failureKind: transportResult.error?.code as WorkerFailureKind,  // TransportErrorCode → WorkerFailureKind
    failureReason: transportResult.error?.message,
    changedFiles: transportResult.changedFiles.map(path => ({ path, status: 'modified' as const })),
    artifacts: transportResult.toolCalls.map((tc: AcpToolCallEvent) => ({
      id: tc.toolCallId,
      type: tc.kind,
      summary: tc.title,
    })),
    executionTimeMs,
    redacted: true,
    verificationRequired,
  };
}
```
