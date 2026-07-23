# 05 — 意图识别改造

> **状态: 待详细计划**

> **依赖清单** — 本文档引用以下外部定义:
> - `AgentTransport`, `TransportRequest`, `TransportResult` → [01-acp-transport.md § 核心接口](./01-acp-transport.md#核心接口)
> - `AcpConfig` → [01-acp-transport.md § 传输工厂](./01-acp-transport.md#传输工厂)

## 当前状态

意图识别使用两阶段路由:

### 阶段 1: 确定性能力路由(无 LLM)

`src/nl/capabilities/router.ts` — 匹配注册的能力:
- `git-workflow` — git 操作
- `package-script` — npm 脚本
- `github-actions-repair` — CI 修复
- `user-report` — 用户报告
- `plan-adapter` — 计划适配

也检查安全 shell 命令(`pwd` / `ls` / `echo`)。

### 阶段 2: LLM fallback(有 LLM)

`src/nl/core/pipeline.ts` — 三次 LLM 调用:

1. **意图分类**: `llmClient.complete('nl-intent-classifier-v1', input)` → `query` / `task` / `dialog`
2. **回复生成**(query/dialog): `llmClient.complete('nl-processor-tool-calling', input, { toolChoice: 'none' })` → Markdown 回复
3. **工具调用**(task): `llmClient.complete('nl-processor-tool-calling', input, { tools, toolChoice: 'auto' })` → LLM 选择工具 → workflow steps

## 改造方向(待详细计划)

### 方案 A: ACP agent 直接处理意图

```
用户输入 → ACP agent session/prompt → agent 自主决定:
  - 查询类 → 直接回复(agent_message_chunk)
  - 任务类 → 调用工具(tool_call) → 生成 workflow steps
  - 对话类 → 多轮对话
```

**优点:** 最简单,完全依赖 ACP agent 的能力
**缺点:** 丧失确定性路由的快速路径;每次输入都要启动 ACP session

### 方案 B: 保留确定性路由 + ACP fallback

```
用户输入 → 确定性能力路由(保留)
  ├─ 匹配 → 直接执行(快速路径)
  └─ 不匹配 → ACP agent 处理(fallback)
```

**优点:** 保留快速路径,ACP 只处理复杂意图
**缺点:** 需要维护两套路由逻辑

### 方案 C: ACP agent + 结构化输出

```
用户输入 → ACP agent session/prompt
  prompt: "Classify this input as query/task/dialog and respond with JSON"
  → ACP agent 返回结构化意图
  → 根据意图类型路由到不同处理路径
```

**优点:** 保留意图分类的显式控制
**缺点:** 增加一次 ACP session 往返

## 待定问题

1. 确定性能力路由是否保留?
2. ACP agent 的 tool_call 如何映射到 workflow steps?
3. 多轮对话(chat 模式)如何管理 ACP session?
4. 意图分类的 prompt 模板如何设计?
5. NL pipeline 的 self-healing loop 如何适配 ACP?

## 影响范围

| 文件 | 当前职责 | 改造影响 |
|---|---|---|
| `src/nl/orchestrator.ts` | 顶层 NL 入口 | 替换 LLM fallback 为 ACP |
| `src/nl/core/pipeline.ts` | LLM pipeline | 移除或重写为 ACP pipeline |
| `src/nl/core/intent-splitter.ts` | 多意图拆分 | 保留(确定性) |
| `src/nl/capabilities/router.ts` | 确定性能力路由 | 保留(如果选方案 B/C) |
| `src/nl/tool-calling.ts` | LLM tool 定义 + 转换 | 移除或重写 |
| `src/nl/command-synthesizer.ts` | 确定性命令合成 | 保留 |
| `src/nl/intent-matcher.ts` | deprecated 关键词匹配 | 移除 |
| `src/nl/prompt/v3.ts` | 11 个 prompt 模板 | 移除或重写 |
| `src/nl/prompt-manager.ts` | prompt 管理 | 移除 |
| `src/commands/run.ts` | run 命令 | 适配新 NL pipeline |
| `src/commands/chat.ts` | chat 命令 | 适配 ACP session 管理 |
| `src/chat/nl-handler.ts` | chat NL 处理 | 重写 |
