# 06 — 安全协议与 ACP 权限映射

> **状态: 部分完成 — security-bridge 已实现,Redactor ACP 事件层适配未开始**

> **依赖清单** — 本文档引用以下外部定义,实现时须加载:
> - `AcpToolKind`, `AcpPermissionRequest` → `src/agent-runtime/acp/acp-types.ts` / 本文 § ACP Permission 映射
> - `SecurityGuard`, `SecurityContext`, `CommandIntention`, `SecurityDecision` → `src/types/security.ts`
> - `AuditHelper` → [07-infrastructure.md § Audit 系统](./07-infrastructure.md#audit-系统) / `src/infrastructure/audit/index.ts`
> - 安全桥接 `handleAcpPermission` 的权威定义在 [01-acp-transport.md § ACP Permission → SecurityGuard 映射](./01-acp-transport.md#acp-permission--securityguard-映射)。本文的代码示例应与 01 保持一致。

## 当前安全协议(完全保留)

### 三层评估器管道

```
SecurityGuard.assess(intention, context)
  │
  ├─ 1. CommandRuleEvaluator    — 静态 blocklist/allowlist
  │     └─ CommandRuleEngine    — project + global 规则
  │
  ├─ 2. SandboxSemanticEvaluator — 启发式语义检测
  │     └─ 12 注入模式 + 16 危险模式
  │
  └─ 3. ProtocolRuleEvaluator   — 正则规则数据库
        └─ 23 条默认规则(sudo/rm-root/chmod-777/...)
```

**熔断机制:** 任一评估器返回 `BLOCKED` → 立即短路返回。
**优先级:** `REQUIRES_CONFIRMATION` > `REDACTED` > `PASSED`。

### 安全决策类型

```typescript
type SecurityDecisionType = 'PASSED' | 'BLOCKED' | 'REQUIRES_CONFIRMATION' | 'REDACTED';
type SecurityRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
```

### Redactor(脱敏器)

实时脱敏 agent 输出:
- API keys (OpenAI sk- / Stripe / AWS / GitHub / generic)
- JWT / Bearer tokens
- PII (中国手机号 / 身份证 / 邮箱)
- 信用卡号
- 敏感路径 (.ssh/ / .gnupg/ / .env / .aws/ / .kube/)

## ACP Permission 映射

### ACP 权限请求结构

```typescript
// ACP agent 发送给 client 的权限请求
interface AcpPermissionRequest {
  toolCall: {
    title: string;       // e.g. "echo TEST > /tmp/marker.txt"
    kind: string;        // 'execute' | 'edit' | 'read' | ...
  };
  options: {
    optionId: string;    // 'once' | 'always' | 'reject'
    name: string;        // 'Allow once' | 'Always allow' | 'Reject'
    kind: string;        // 'allow_once' | 'allow_always' | 'reject_once'
  }[];
}
```

### 映射规则

> 完整映射规则见 [01-acp-transport.md § 映射规则表](./01-acp-transport.md#acp-permission--securityguard-映射)。

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

### SecurityBridge 实现

> **权威定义:** 完整实现见 [01-acp-transport.md § ACP Permission → SecurityGuard 映射](./01-acp-transport.md#acp-permission--securityguard-映射)。
> 以下代码示例与 01 保持一致,包含全部 4 种 `SecurityDecisionType` 处理。

```typescript
// src/agent-runtime/transport/security-bridge.ts
// 与 01-acp-transport.md § ACP Permission → SecurityGuard 映射 对齐

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

  // 2. 构造结构化 CommandIntention
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
      // 后续可接入用户确认 UI
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
    const reject = options.find((o) => o.kind === 'reject_once');
    return reject?.optionId ?? options[0]?.optionId ?? '';
  }
  return opt.optionId;
}
```

## OpenCode 权限配置

OpenCode 在 ACP 模式下默认 auto-approve 所有操作。要触发 `session/request_permission`,需要在 workspace 的 `opencode.json` 中配置:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": "ask",
    "edit": "ask"
  }
}
```

VectaHub 在创建 ACP session 时,可以自动注入这个配置:

```typescript
// AcpTransport.execute() 中
const opencodeConfig = {
  permission: {
    bash: securityContext.permissionMode ?? 'ask',
    edit: securityContext.permissionMode ?? 'ask',
  },
};
// 写入临时 workspace 或通过 ACP session config 传递
```

## 安全评估流程对比

### 当前(spawn 模式)

```
1. 命令生成后评估: guard.assess({ rawCommand: fullCommand })
   — 评估的是整个 CLI 命令字符串
   — 一次评估,全有或全无

2. Post-execution 边界检查: detectPostExecutionConfirmation(gitChanges)
   — 事后 git diff 检查
   — 越界变更只能事后发现
```

### 改造后(ACP 模式)

```
1. 任务意图评估: guard.assess({ rawCommand: taskPrompt })
   — 评估的是任务意图而非 CLI 命令

2. 实时权限评估: 每次 ACP tool_call 都触发 guard.assess()
   — 实时拦截,事前阻止
   — 每次文件编辑/命令执行都有审计记录
   — BLOCKED → reject_once,agent 不会执行

3. Post-execution 边界检查: 保留 detectPostExecutionConfirmation()
   — 从 tool_call 事件提取 changedFiles(不需要 git diff)
   — 双重保障:事前拦截 + 事后检查
```

## Redactor 适配到 ACP 事件层

> **权威定义:** Redactor 的去留和适配归属本文档。01-acp-transport.md 只引用本文档。

### 当前(spawn 模式)

`RedactionTransform`(`src/commands/run-task-spawner.ts`)是一个 Node.js `Transform` stream,实时拦截 agent 进程的 stdout/stderr,对每个 chunk 调用 `Redactor.redact()` 做脱敏。同时通过正则扫描提取 token 用量。

### 改造后(ACP 模式)

ACP transport 不使用 `RedactionTransform`,因为 ACP 事件已经是结构化的,不需要从原始文本流中提取信息。脱敏改为在事件层处理:

| ACP 事件 | 脱敏处理 | 实现位置 |
|---|---|---|
| `agent_message_chunk` → `TransportResult.output` | `Redactor.redact()` 对 message text 脱敏 | `AcpTransport.execute()` 结果映射 |
| `tool_call.rawOutput` | `Redactor.redact()` 对 rawOutput 脱敏 | `AcpTransport.execute()` 事件处理 |
| `tool_call.rawInput` | 不脱敏(输入是 VectaHub 发出的,不含敏感信息) | — |

```typescript
// AcpTransport.execute() 中,结果映射后脱敏
const redactor = createRedactor();
result.output = redactor.redact(result.output);
result.toolCalls = result.toolCalls.map(tc => ({
  ...tc,
  rawOutput: tc.rawOutput ? redactor.redact(String(tc.rawOutput)) : tc.rawOutput,
}));
```

### exec step 路径

`exec-handler.ts` 仍使用 `RedactionTransform` 对本地命令输出做实时脱敏。这部分不涉及 ACP,保持不变。详见 [03-workflow-engine.md § RedactionTransform 去留](./03-workflow-engine.md#redactiontransform-去留)。

## 不变的安全组件

| 组件 | 文件 | 改动 |
|---|---|---|
| SecurityGuard | `src/security-protocol/guard.ts` | 无 |
| CommandRuleEvaluator | `src/security-protocol/evaluators/command-rule.ts` | 无 |
| SandboxSemanticEvaluator | `src/security-protocol/evaluators/sandbox-semantic.ts` | 无 |
| ProtocolRuleEvaluator | `src/security-protocol/evaluators/protocol-rule.ts` | 无 |
| Redactor | `src/security-protocol/redactor.ts` | 保留,适配到 ACP 事件内容(见上文) |
| CommandRuleEngine | `src/command-rules/engine.ts` | 无 |
| CommandDetector | `src/security-protocol/command-detector.ts` | 无 |
| default-rules | `src/security-protocol/default-rules.ts` | 无 |
| RBAC | `src/security-protocol/rbac.ts` | 无 |

## 新增的安全组件

| 组件 | 文件 | 职责 |
|---|---|---|
| SecurityBridge | `src/agent-runtime/transport/security-bridge.ts` | ACP permission → SecurityGuard 映射 |
| ACP permission audit | `src/agent-runtime/transport/audit-bridge.ts` | 每次 permission 请求的审计记录 |
