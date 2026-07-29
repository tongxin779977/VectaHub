# 00 — 项目愿景与改造目标

## 项目定位

VectaHub 是一个**单用户、本地优先的 TypeScript CLI 自动化内核**,用于把自然语言请求、任务文档和结构化 workflow 转成可审计的本地执行流程。

## 当前架构问题

### 问题 1:Agent 调用是黑盒

```
adapter.render() → { command, args }
       ↓
  spawn(command, args)  ← 子进程,完全黑盒
       ↓
  stdout/stderr → 字符串拼接 → 正则/heuristic 猜测结果
```

丢失的信息:
- Agent 内部工具调用(读文件/写文件/执行命令)— 只能事后 `git diff` 猜测
- Agent 的执行计划 — 不知道 agent 打算做什么
- Agent 的推理过程 — 只看到最终 stdout 文本
- Token 用量 — 正则扫描 stdout,格式一变就失效
- 结构化错误码 — keyword 匹配 stderr,30+ 硬编码 pattern
- 执行结果分类 — 60+ 硬编码中英文短语匹配
- 流式进度 — 只有"已运行 Ns"定时器

### 问题 2:LLM 直调散落各处

```
src/nl/llm.ts           — 主 LLM 客户端(OpenAI/Anthropic/Groq/Ollama)
src/nl/llm-http-client.ts — HTTP 传输层
src/nl/llm-config.ts    — 配置解析
src/skills/llm-dialog-control/ — 独立的 LLM HTTP 客户端(重复实现)
```

30+ 处 LLM 调用散落在:NL pipeline、parse-doc、run-task、chat、serve、generate、self-healing、agent inferencer、tool cache、skills。

### 问题 3:完成检测状态机过于复杂

run-task.ts 的 spawn 块(~300 行)是一个多定时器竞态:
- `cliTimeoutMs`(600s)、`idleTimeoutMs`(120s)、`noCloseTimeoutMs`(180s)、`maxWallClockMs`(900s)
- 6 种完成信号:`close`、`exit-stream-drain`、`exit-flush-grace`、`output-last-message`、`evidence-closeout`、`timeout`
- 这套逻辑是"因为 agent 是黑盒所以需要猜它什么时候完成"的产物

## 改造目标

### 目标 1:ACP 作为通讯基座

```
ACP session/prompt → 结构化事件流 → 明确结果
  ├─ agent_message_chunk  (流式文本)
  ├─ tool_call            (工具调用:kind/status/locations/rawInput/rawOutput)
  ├─ plan                 (执行计划:entries/priority/status)
  ├─ usage_update         (token 用量 + cost)
  ├─ session/request_permission (权限请求)
  └─ StopReason           (end_turn / max_tokens / refusal / cancelled)
```

初次启动时规定采用哪个 ACP agent(如 OpenCode),支持后期替换为 Claude、Codex 等。

### 目标 2:全面弃用 LLM 直调

移除所有 LLM HTTP 客户端,所有需要 AI 能力的场景统一走 ACP agent:
- 意图识别 → ACP agent 能力路由
- 文档解析 → ACP agent 结构化任务链
- 命令生成 → ACP agent 直接执行(不需要生成 CLI 命令)
- 错误诊断 → ACP agent 分析
- 工作流生成 → ACP agent 生成 YAML

### 目标 3:全链路可查验

```
Trace spans (JSONL):
  cli.run-task
    cli.run-task.transport.execute
      cli.run-task.transport.acp.initialize
      cli.run-task.transport.acp.session.new
      cli.run-task.transport.acp.prompt
      cli.run-task.transport.acp.permission (每次权限请求)
      cli.run-task.transport.acp.tool_call   (每次工具调用)
    cli.run-task.verification

Audit records (JSONL):
  SECURITY_ACTION  EXECUTING    ← transport.execute 开始
  SECURITY_ACTION  COMPLETED    ← transport.execute 成功
  SECURITY_ACTION  FAILED       ← transport.execute 失败
  SECURITY_ACTION  BLOCKED      ← permission 被拒绝
  EXECUTOR_RESULT  (per tool_call)
```

## 架构总览

```
                    User / CLI / VS Code
                           |
                    VectaHub CLI Core
                           |
                    +----------+
                    | ACP 基座 |  ← 初次启动规定,可替换
                    +----------+
                           |
            +--------------+--------------+
            |              |              |
       意图识别        文档任务       Workflow 引擎
            |              |              |
            +--------------+--------------+
                           |
                    ACP Transport
                    (JSON-RPC over stdio)
                           |
                    ACP Agent
                    (OpenCode / Claude / Codex)
                           |
                    本地命令 / 文件操作 / 工具调用
```

## 改造范围

| 模块 | 当前状态 | 改造目标 | 进度 | 文档 |
|---|---|---|---|---|
| Agent 调用 | spawn 黑盒 | ACP 结构化通讯 | ✅ B1+B2 已完成 | [01-acp-transport.md](./01-acp-transport.md) |
| LLM 调用 | 30+ 处散落 | 全面移除,统一走 ACP | ⏳ B3-B6 未开始 | [08-llm-removal.md](./08-llm-removal.md) |
| Workflow | delegate 走 spawn | delegate 走 ACP session | ⏳ B7 未开始 | [03-workflow-engine.md](./03-workflow-engine.md) |
| 文档任务 | LLM 解析 + spawn 执行 | ACP agent 结构化任务链 | ⏳ B8 未开始 | [04-document-task.md](./04-document-task.md) |
| 意图识别 | LLM 分类 | ACP agent 能力路由(待定) | ⏳ B9 未开始 | [05-nl-intent.md](./05-nl-intent.md) |
| 安全协议 | 3 层评估器 | 保留 + ACP permission 映射 | ✅ B1 已完成(security-bridge) | [06-security-protocol.md](./06-security-protocol.md) |
| 基础设施 | DI/trace/audit/event | 保留,新增 ACP 事件桥接 | ✅ B1 已完成(trace/audit-bridge) | [07-infrastructure.md](./07-infrastructure.md) |
| CLI 命令 | 43 个 | 保留,内部实现改造 | ⏳ B10 未开始 | [02-cli-commands.md](./02-cli-commands.md) |
