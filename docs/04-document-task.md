# 04 — 文档任务系统改造

> **状态: 已完成 — run-task + parse-doc 均已走 ACP transport**

> **依赖清单** — 本文档引用以下外部定义,实现时须加载:
> - `AgentTransport`, `TransportRequest`, `TransportResult`, `TransportError` → [01-acp-transport.md § 核心接口](./01-acp-transport.md#核心接口)
> - `AcpToolCallEvent`, `AcpStopReason` → `src/agent-runtime/acp/acp-types.ts`
> - `SecurityGuard`, `SecurityContext`, `CommandIntention` → [06-security-protocol.md](./06-security-protocol.md) / `src/types/security.ts`
> - `TraceContext`, `SpanHandle` → [07-infrastructure.md § Trace 系统](./07-infrastructure.md#trace-系统)
> - `TokenUsage`, `RunTaskResult` → `src/commands/run-task-shared.ts`

## 当前生命周期(5 阶段)

```
1. Parse    — parse-doc: LLM 解析文档提取任务列表
2. Contract — run-task: 构建任务合同(boundary / allowedFiles / forbiddenFiles / validationCommands)
3. Execute  — run-task: LLM 命令生成 + Agent CLI spawn + heuristic 分析
4. Verify   — run-task: 运行 validationCommands (typecheck / test)
5. Recover  — recover-task: 确定性恢复决策(无 LLM)
```

## 改造方案

### 阶段 1: Parse — 从 LLM 解析改为 ACP agent 结构化任务链

#### 当前

```typescript
// parse-doc.ts
// 1. 尝试 roadmap-table 解析(确定性,无 LLM)
// 2. 失败 → LLM 解析(LLMClient.completeRaw('doc-task-parser-v1', chunk))
// 3. LLM 不可用 → regex fallback
```

#### 改造后

```typescript
// parse-doc.ts
// 1. 尝试 roadmap-table 解析(确定性)— 保留
// 2. 失败 → ACP agent 解析
//    transport.execute({
//      taskPrompt: `Analyze this document and extract structured tasks as JSON array.
//                   Each task: { taskId, taskLabel, docExcerpt, allowedFiles, forbiddenFiles }
//                   Document: ${docContent}`,
//    })
//    → ACP agent 返回结构化 JSON
// 3. ACP 不可用 → regex fallback — 保留
```

#### parse-doc ACP 路径实现设计

```typescript
// src/commands/parse-doc.ts 中新增

async function parseDocViaAcp(
  docContent: string,
  transport: AgentTransport,
  descriptor: AgentDescriptor,
): Promise<DocTaskParseResult> {
  const result = await transport.execute({
    descriptor,
    workspaceRoot: process.cwd(),
    taskPrompt: buildParseDocPrompt(docContent),
    mode: 'run',
    traceContext: { traceId: `parse-doc-${Date.now()}` },
    securityContext: {
      cwd: process.cwd(),
      sessionId: `parse-doc-${Date.now()}`,
    },
    timeoutMs: 120_000,
  });

  if (!result.success) {
    throw new Error(`ACP parse-doc failed: ${result.error?.message}`);
  }

  // ACP agent 返回 JSON 格式的任务列表
  // agent 可以用 read 工具读取文档,用 search 探索代码库
  const tasks = JSON.parse(result.output) as DocTask[];
  return { tasks, source: 'acp', rawOutput: result.output };
}

function buildParseDocPrompt(docContent: string): string {
  return [
    'Analyze the following document and extract structured tasks as a JSON array.',
    'Each task object must have:',
    '  - taskId: string (unique identifier)',
    '  - taskLabel: string (human-readable label)',
    '  - docExcerpt: string (relevant excerpt from the document)',
    '  - allowedFiles: string[] (files the task may modify)',
    '  - forbiddenFiles: string[] (files the task must not touch)',
    '',
    'You may use read and search tools to explore the codebase for context.',
    'Respond with ONLY the JSON array, no markdown fences.',
    '',
    'Document:',
    docContent,
  ].join('\n');
}
```

**parse-doc 三层降级策略:**

| 层级 | 方法 | 触发条件 | 准确性 |
|---|---|---|---|
| 1 | roadmap-table 解析(确定性) | 文档含标准 roadmap 表格 | 100% |
| 2 | ACP agent 解析 | 表格解析失败,transport 可用 | 高(agent 有工具约束) |
| 3 | regex fallback | transport 不可用 | 中(正则匹配) |

**关键改进:**
- 不再需要 LLM HTTP 客户端
- ACP agent 的 tool_call 事件提供文件读取的可观测性
- ACP agent 可以直接读取文档文件(tool_call kind=read)

### 阶段 2: Contract — 保留不变

任务合同构建是确定性的(无 LLM),完全保留:

- `deriveDocExcerpt()` — 从文档提取任务相关片段
- `deriveAgentTaskBoundary()` — 解析 allowedFiles / forbiddenFiles
- `deriveValidationCommands()` — 推导验证命令
- `computeInstructionHash()` — 计算指令哈希
- `decideAgentTaskConcurrency()` — 并发决策

**唯一改动:** `globalConfigDigest` 从 LLM config 改为 ACP agent config:
```typescript
// 改造前
buildGlobalConfigDigest({ provider: 'openai', model: 'gpt-4o-mini', temperature: 0.1 })
// 改造后
buildGlobalConfigDigest({ provider: 'acp', model: agentId, temperature: 0 })
```

### 阶段 3: Execute — 从 LLM 命令生成 + spawn 改为 ACP transport

> **类型依赖:** `TransportRequest` / `TransportResult` 定义见 [01-acp-transport.md § 核心接口](./01-acp-transport.md#核心接口)。
> `AcpStopReason` 定义见 `src/agent-runtime/acp/acp-types.ts`。

#### 当前(最复杂的部分)

```
1. 命令生成:
   - Adapter path: adapter.render() → { command, args, stdinInput }
   - LLM fallback: LLMClient.completeRaw('agent-cmd-generator-v1', ...) → JSON command

2. 安全评估: guard.assess(commandIntention, securityContext)

3. Runtime bootstrap: bootstrapAgentRuntime() → 复制 config 文件

4. Agent preflight: exec(entryCommand, preflightArgs)

5. Spawn + 监控(~300 行状态机):
   - RedactionTransform(stdout/stderr)
   - parseTokenUsage() 实时扫描
   - 6 种完成信号
   - idle/no-close/wall-clock 多定时器
   - outputLastMessagePath 轮询(codex 特例)

6. Post-execution heuristic:
   - detectAgentExecutionOutcome() — 60+ 中英文短语匹配
   - detectAgentSoftSystemFailure() — 30+ 信号字符串
   - detectAgentTaskAlreadySatisfied() — 15 个满足信号
   - classifyAgentFailureCode() — keyword 匹配
   - reviewOutOfScopeWithLLM() — LLM 审查越界变更
```

#### 改造后

```
1. 构建 task prompt(保留 buildDefaultPrompt)

2. 安全评估: guard.assess(taskIntention, securityContext)
   — 评估的是任务意图而非 CLI 命令

3. ACP transport.execute():
   - spawn agent (opencode acp)
   - initialize (protocol version + capabilities)
   - session/new (cwd = workspaceRoot)
   - session/prompt (task prompt + contract context)
   - drain events:
     - agent_message_chunk → 流式文本
     - tool_call → 工具调用(kind/status/locations/rawInput/rawOutput)
     - plan → 执行计划
     - usage_update → token 用量
     - session/request_permission → SecurityGuard.assess() → approve/reject
   - StopReason → 明确完成原因

4. Post-execution 分析(从 heuristic 改为确定性):
    - stopReason === 'end_turn' && toolCalls 有 completed edit → 'implemented'
    - stopReason === 'end_turn' && toolCalls 无 completed edit → 'planned_only'
    - stopReason === 'refusal' → 'refusal'
    - stopReason === 'cancelled' → 'cancelled'
    - stopReason === 'max_tokens' → 'max_tokens'
    - stopReason === 'max_turn_requests' → 'max_turn_requests'
   - changedFiles 从 tool_call 事件提取(不需要 git diff)
   - 越界变更检测: 保留 detectPostExecutionConfirmation()(确定性)
   - LLM 审查越界变更: 移除,改为 ACP agent 自审或人工确认

5. 结果组装: TransportResult → RunTaskResult
```

**消除的代码:**
- spawn 状态机(~300 行)
- heuristic 函数群(~256 行)
- LLM 命令生成(~100 行)
- LLM 越界审查(~50 行)
- runtime bootstrap(~80 行)
- preflight 检查(~40 行)
- outputLastMessagePath 轮询(~50 行)
- **总计: ~876 行**

**替代为:**
- `transport.execute()` 调用(~10 行)
- `mapTransportToRunTaskResult()`(~50 行)
- trace/audit 桥接(~100 行)

### 阶段 4: Verify — 保留不变

验证命令执行是确定性的(无 LLM),完全保留:

- `runVerificationCommands()` — 运行 typecheck / test
- `guard.assess()` — 每条验证命令的安全检查
- `context.environment.exec()` — 实际执行

**唯一改动:** 验证结果从 `RunTaskResult.verification` 保留不变。

### 阶段 5: Recover — 保留不变

恢复决策是确定性的(无 LLM),完全保留:

- `decideRecovery(input)` — 确定性决策矩阵
- `applyRecoveryHints()` — 边界弱点提示
- `mapErrorCodeToFailureKind()` — 错误码映射(改为从 AcpStopReason 映射)

**改动:** `recover-task` 命令内部从 `runTask()` 重新执行,`runTask` 已改为 ACP transport。

## run-task.ts 改造后的执行流

```
runTask(options)
  │
  ├─ 1. buildAgentTaskContract()          ← 保留(确定性)
  │
  ├─ 2. buildDefaultPrompt()              ← 保留(确定性)
  │
  ├─ 3. guard.assess(taskIntention)       ← 保留(安全评估)
  │
  ├─ 4. transport.execute(request)        ← 新(ACP 通讯基座)
  │     ├─ spawn agent (opencode acp)
  │     ├─ initialize + session/new
  │     ├─ session/prompt
  │     ├─ drain events → trace spans + audit records
  │     ├─ handle permissions → SecurityGuard.assess()
  │     └─ StopReason
  │
  ├─ 5. mapTransportToRunTaskResult()     ← 新(确定性映射)
  │     ├─ stopReason → success/failure
  │     ├─ toolCalls → changedFiles
  │     ├─ toolCalls → agentExecutionOutcome
  │     └─ usage → TokenUsage
  │
  ├─ 6. detectPostExecutionConfirmation() ← 保留(确定性边界检查)
  │
  ├─ 7. runVerificationCommands()         ← 保留(确定性)
  │
  ├─ 8. createRunTaskReviewReport()       ← 保留(确定性)
  │
  └─ 9. return RunTaskResult
```

## RunTaskResult 改造

```typescript
// 新增字段
// AcpStopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'
// AcpToolCallEvent 定义见 src/agent-runtime/acp/acp-types.ts
// TransportResult 定义见 01-acp-transport.md § TransportResult

interface RunTaskResult {
  // ... 现有字段保留 ...
  
  // 新增 ACP 字段
  stopReason?: AcpStopReason;           // 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'
  toolCalls?: AcpToolCallEvent[];        // 工具调用记录(复用 acp-types.ts 类型,非 ToolCallRecord)
  agentName?: string;                    // ACP agent 名称
  agentVersion?: string;                 // ACP agent 版本
  
  // deprecated 字段(保留但不再填充)
  completionSignal?: string;             // @deprecated 被 stopReason 替代
}
```
