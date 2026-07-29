# 05 — 意图识别改造

> **状态: 已完成 — 方案 B 已实现,确定性路由 + ACP fallback**

> **依赖清单** — 本文档引用以下外部定义:
> - `AgentTransport`, `TransportRequest`, `TransportResult` → [01-acp-transport.md § 核心接口](./01-acp-transport.md#核心接口)
> - `AcpConfig` → [01-acp-transport.md § 传输工厂](./01-acp-transport.md#传输工厂)
> - `SecurityGuard`, `SecurityContext` → [06-security-protocol.md](./06-security-protocol.md) / `src/types/security.ts`

## 当前状态

意图识别使用两阶段路由:

### 阶段 1: 确定性能力路由(无 LLM,保留)

`src/nl/capabilities/router.ts` — 匹配注册的能力:
- `git-workflow` — git 操作
- `package-script` — npm 脚本
- `github-actions-repair` — CI 修复
- `user-report` — 用户报告
- `plan-adapter` — 计划适配

也检查安全 shell 命令(`pwd` / `ls` / `echo`)。

### 阶段 2: ACP fallback(待实现)

当前代码在 `src/nl/orchestrator.ts:63` 抛出错误:
```typescript
throw new Error('Capability routing returned fallback; LLM fallback has been removed.');
```

改造后此处调用 `transport.execute()`。

## 选定方案: B — 保留确定性路由 + ACP fallback

### 决策理由

| 维度 | 方案 A(全 ACP) | 方案 B(路由 + ACP fallback) | 方案 C(ACP 分类 + 路由) |
|---|---|---|---|
| 快速路径 | ❌ 每次启动 ACP session | ✅ 确定性匹配直接执行 | ❌ 每次启动 ACP session |
| 延迟 | 高(session 开销) | 低(匹配时)/ 中(fallback 时) | 高(两次 session 往返) |
| 可靠性 | 依赖 agent 可用 | 基本功能不依赖 agent | 依赖 agent 可用 |
| 准确性 | agent 自主决策 | 三层保障(见下文) | 分类准确率 80-90% |
| 改动面 | 大(重写全部) | 小(替换 throw) | 大(新增分类层) |

### 准确性保障(三层)

#### 第一层:确定性路由(已知模式,100% 准确)

5 类能力 + 安全 shell 命令,纯代码匹配,不存在误判。覆盖高频输入(git 操作、npm 脚本、CI 修复等),占日常使用的大多数。

#### 第二层:ACP agent 工具约束(未知模式,约束输出范围)

ACP fallback 不做"意图分类"这一步。直接把用户输入 + 可用工具列表发给 agent,agent 自主决定:

```
用户: "帮我把 src/foo.ts 的测试补上"

ACP agent 收到:
  - 用户输入(taskPrompt)
  - 可用工具: exec(bash)、edit、read、search、fetch
  - workspace 上下文(可以 read/search 探索代码)

agent 自主路径:
  → read src/foo.ts
  → search 相关测试模式
  → edit 新建测试文件
```

准确性来自 **工具约束**:agent 只能调用已注册的工具(`exec`/`edit`/`read`/`search`/`fetch`),不能凭空生成 workflow step。每个 `tool_call` 都是结构化的 `AcpToolCallEvent`,直接映射为 workflow step。

#### 第三层:SecurityGuard + 输出验证(兜底)

即使 agent 判断错误:
- 每个 `tool_call` 经过 `SecurityGuard.assess()` — 危险命令被 BLOCKED
- `TransportResult.changedFiles` 经过 `detectPostExecutionConfirmation()` — 越界变更被检测
- `tool_call.rawOutput` 经过 `Redactor.redact()` — 敏感信息被脱敏

### 核心设计

```
用户输入
  │
  ├─ 阶段 1: 确定性能力路由(capabilityRouter.route)
  │   ├─ 匹配 → 直接生成 NLResult(快速路径,无 ACP)
  │   │   ├─ 可执行 → capabilityPlanToNLResult()
  │   │   ├─ 预览 → capabilityNoTaskNLResult()
  │   │   └─ 需澄清 → capabilityNoTaskNLResult()
  │   │
  │   └─ 不匹配 → 阶段 2
  │
  └─ 阶段 2: ACP fallback(transport.execute)
      │
      ├─ 构造 TransportRequest
      │   - taskPrompt: 用户原始输入
      │   - descriptor: 默认 ACP agent(opencode)
      │   - workspaceRoot: 当前工作目录
      │   - securityContext: cwd + sessionId
      │   - mode: 'run' 或 'dry-run'
      │
      ├─ transport.execute(request) → TransportResult
      │   ├─ agent 自主调用工具(read/edit/exec/search/fetch)
      │   ├─ 每个 tool_call 经 SecurityGuard 评估
      │   └─ output/rawOutput 经 Redactor 脱敏
      │
      └─ TransportResult → NLResult 映射
          ├─ success=true → NLResult(path: 'acp-fallback', task: result)
          ├─ success=false → NLResult(path: 'acp-fallback', error: result.error)
          └─ output → NLResult.reply
```

### TransportResult → NLResult 映射

```typescript
// src/nl/orchestrator.ts 中新增

function transportResultToNLResult(
  result: TransportResult,
  input: string,
): NLResult {
  if (result.success) {
    return {
      input,
      intent: 'task',
      task: {
        type: 'acp-execution',
        toolCalls: result.toolCalls,
        changedFiles: result.changedFiles,
        usage: result.usage,
      },
      reply: result.output,
      path: 'acp-fallback',
      intentRecognitionMethod: 'acp',
    };
  }

  return {
    input,
    intent: 'none',
    error: result.error?.message ?? 'ACP agent failed to process input',
    path: 'acp-fallback',
    intentRecognitionMethod: 'acp',
  };
}
```

### orchestrator.ts 改造

```typescript
// 当前(line 62-63):
// LLM fallback removed — ACP migration pending
throw new Error('Capability routing returned fallback; LLM fallback has been removed.');

// 改造后:
// ACP fallback: 确定性路由未匹配时,交给 ACP agent 处理
if (!deps?.transport) {
  throw new Error('ACP fallback requires transport; no transport provided.');
}

const acpResult = await deps.transport.execute({
  descriptor: deps.agentDescriptor,
  workspaceRoot: context.cwd,
  taskPrompt: input,
  mode: 'run',
  traceContext: { traceId: context.sessionId },
  securityContext: {
    cwd: context.cwd,
    sessionId: context.sessionId,
    taskId: context.taskId,
  },
  timeoutMs: deps.acpConfig?.defaultTimeoutMs ?? 600_000,
});

return transportResultToNLResult(acpResult, input);
```

### processInput 签名变更

```typescript
// 当前:
export async function processInput(
  input: string,
  auditHelper?: AuditHelper,
  logger?: ILoggerService,
): Promise<NLResult>

// 改造后:
export interface NLProcessorDeps {
  transport?: AgentTransport;           // ACP fallback 传输层
  agentDescriptor?: AgentDescriptor;    // 默认 ACP agent
  acpConfig?: AcpConfig;                // ACP 超时/权限配置
  auditHelper?: AuditHelper;
  logger?: ILoggerService;
}

export async function processInput(
  input: string,
  deps?: NLProcessorDeps,
): Promise<NLResult>
```

### chat 模式(多轮对话)

chat 命令的 ACP session 管理:

```typescript
// src/chat/nl-handler.ts

// 每个 chat 会话维护一个 ACP session
// 用户输入 → transport.execute() 复用 session → agent 有上下文记忆
// session 生命周期: chat 启动时创建,chat 退出时销毁

// 简化方案: 每次输入都是独立的 transport.execute()
// ACP agent 通过 taskPrompt 中的上下文摘要获得"记忆"
// 后续可优化为真正的 session 复用
```

## 影响范围

| 文件 | 当前职责 | 改造影响 |
|---|---|---|
| `src/nl/orchestrator.ts` | 顶层 NL 入口 | 替换 throw 为 transport.execute(),新增 NLProcessorDeps |
| `src/nl/capabilities/router.ts` | 确定性能力路由 | **保留,无改动** |
| `src/nl/core/intent-splitter.ts` | 多意图拆分 | **保留,无改动** |
| `src/nl/command-synthesizer.ts` | 确定性命令合成 | **保留,无改动** |
| `src/commands/run.ts` | run 命令 | 适配 NLProcessorDeps,传入 transport |
| `src/commands/chat.ts` | chat 命令 | 适配 NLProcessorDeps,传入 transport |
| `src/chat/nl-handler.ts` | chat NL 处理 | 适配 processInput 新签名 |
| `src/daemon/socket-server.ts` | daemon | 适配 processInput 新签名 |

### 已移除文件(不涉及)

| 文件 | 状态 |
|---|---|
| `src/nl/core/pipeline.ts` | 已删除 |
| `src/nl/tool-calling.ts` | 已删除 |
| `src/nl/intent-matcher.ts` | 已删除 |
| `src/nl/prompt/v3.ts` | 已删除 |
| `src/nl/prompt-manager.ts` | 已删除 |

## 验证

| 检查项 | 通过标准 |
|---|---|
| 确定性路由保留 | 5 类能力 + shell 命令匹配行为不变 |
| ACP fallback 触发 | 确定性路由不匹配时调用 transport.execute() |
| TransportResult 映射 | success → NLResult.task; failure → NLResult.error |
| SecurityGuard 集成 | 每个 tool_call 经 SecurityGuard 评估 |
| Redactor 脱敏 | output/rawOutput 脱敏(已在 06 实现) |
| typecheck | 0 errors |
| test:run | 0 failures |
