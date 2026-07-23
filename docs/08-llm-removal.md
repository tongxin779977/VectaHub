# 08 — LLM 调用全面移除清单

> **状态: 计划中 — LLM 完全移除未开始(402 处引用仍在)**

> **依赖清单** — 本文档引用以下外部定义:
> - `AgentTransport`, `TransportResult` → [01-acp-transport.md § 核心接口](./01-acp-transport.md#核心接口)
> - `AcpConfig` → [01-acp-transport.md § 传输工厂](./01-acp-transport.md#传输工厂)
> - 移除顺序与验证节点 → [09-execution-plan.md](./09-execution-plan.md) B3-B6

## 移除的文件(完全删除)

### 核心 LLM 客户端

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/nl/llm.ts` | ~324 | LLMClient 类(complete/completeRaw/embed/chat/generateYAMLWorkflow) |
| `src/nl/llm-http-client.ts` | ~691 | HTTP 传输层(OpenAI/Anthropic/Groq/Ollama) |
| `src/nl/llm-config.ts` | ~400 | LLM 配置解析(env + config file) |
| `src/nl/llm-orchestrator.ts` | — | LLM 编排包装 |
| `src/nl/llm-adapter.ts` | — | deprecated 别名 |
| `src/nl/interfaces.ts` | — | ILLMClient, LLMConfig, LLMTool 等类型 |

### LLM Dialog Control(独立 HTTP 客户端)

| 文件 | 职责 |
|---|---|
| `src/skills/llm-dialog-control/dialog-controller.ts` | 独立 LLM HTTP 调用(callOpenAICompatible/callAnthropic) |
| `src/skills/llm-dialog-control/http-client.ts` | 独立 HTTP fetch 封装 |
| `src/skills/llm-dialog-control/index.ts` | createDialogController 工厂 |

### Prompt 模板

| 文件 | 职责 |
|---|---|
| `src/nl/prompt/v3.ts` | 11 个 prompt 模板 |
| `src/nl/prompt/types.ts` | prompt 类型定义 |
| `src/nl/prompt-manager.ts` | PromptManager 类 |

### NL Pipeline

| 文件 | 职责 |
|---|---|
| `src/nl/core/pipeline.ts` | NL 处理管道(3 次 LLM 调用) |
| `src/nl/tool-calling.ts` | LLM tool 定义 + 转换 |
| `src/nl/intent-matcher.ts` | deprecated 关键词匹配 |

### Agent Runtime LLM 依赖

| 文件 | 职责 |
|---|---|
| `src/agent-runtime/llm-inferencer.ts` | LLM 推断 agent descriptor |
| `src/agent-runtime/config-loader.ts` | config-loaded agent(可选保留,去掉 LLM 部分) |
| `src/agent-runtime/provider-registrar.ts` | provider 注册(依赖 llm-inferencer) |

### Skills AI Modules

| 文件 | 职责 |
|---|---|
| `src/skills/ai-modules/semantic-matching/semantic-matcher.ts` | LLM embed() 语义匹配 |
| `src/skills/ai-modules/agent-delegate/agent-loop.ts` | LLM complete() agentic loop |
| `src/skills/ai-modules/intelligent-diagnosis/diagnoser.ts` | LLM complete() 错误诊断 |

### 其他

| 文件 | 职责 |
|---|---|
| `src/commands/self-healing.ts` | LLM 诊断 + 自愈循环 |
| `src/cli-tools/discovery/cache-manager.ts` | LLM 推断 CLI 工具能力 |

## 修改的文件(移除 LLM 调用,保留功能)

### 命令文件

| 文件 | LLM 调用 | 改造方式 |
|---|---|---|
| `src/commands/run-task.ts` | 3 处:命令生成、config digest、越界审查 | 命令生成→ACP transport;config digest→ACP config;越界审查→移除 |
| `src/commands/parse-doc.ts` | 1 处:文档解析 | 改为 ACP agent 解析 |
| `src/commands/run.ts` | 2 处:LLM config、self-healing | 移除 self-healing LLM;config 改为 ACP config |
| `src/commands/chat.ts` | 1 处:LLM config | 改为 ACP config |
| `src/commands/serve.ts` | 1 处:LLM config provider | 移除或改为 ACP config provider |
| `src/commands/generate.ts` | 1 处:LLM 生成 YAML | 改为 ACP agent 生成 |
| `src/commands/recover-task.ts` | 间接:通过 runTask() | runTask 改造后自动生效 |

### NL 系统

| 文件 | LLM 调用 | 改造方式 |
|---|---|---|
| `src/nl/orchestrator.ts` | 2 处:createLLMConfig、processInput | 移除 LLM fallback,改为 ACP fallback |
| `src/nl/core/pipeline.ts` | 4 处:LLMClient 构造 + 3 次 complete() | 整个文件移除或重写 |

### Chat 系统

| 文件 | LLM 调用 | 改造方式 |
|---|---|---|
| `src/chat/nl-handler.ts` | 2 处:LLMClient + complete() | 重写为 ACP session |
| `src/chat/types.ts` | 类型引用:LLMConfig | 改为 ACP config 类型 |

### Daemon / API

| 文件 | LLM 调用 | 改造方式 |
|---|---|---|
| `src/daemon/socket-server.ts` | 1 处:processInput(llmConfig) | 改为 ACP config |
| `src/api/server.ts` | 3 处:createLLMConfig + createLLMEnhancedParser | 改为 ACP transport |

### Skills 初始化

| 文件 | LLM 调用 | 改造方式 |
|---|---|---|
| `src/skills/init.ts` | 条件注册:if llmConfig | 改为 if acpConfig |
| `src/skills/intent-skill.ts` | 1 处:generateJSON() | 改为 ACP agent |
| `src/skills/workflow-skill.ts` | 1 处:generateYAML() | 改为 ACP agent |

### Agent Runtime

| 文件 | LLM 调用 | 改造方式 |
|---|---|---|
| `src/agent-runtime/factory.ts` | 无直接调用,但注册的 adapter 会被移除 | 改为注册 ACP agent descriptor |
| `src/agent-runtime/adapters/*.ts` | 无 LLM,但整个 adapter 模式被移除 | 删除 5 个 adapter 文件 |
| `src/agent-runtime/generic-adapter.ts` | 无 LLM,但被移除 | 删除 |
| `src/agent-runtime/cli-detector.ts` | 无 LLM,但被移除 | 删除(ACP `probe()` 替代) |
| `src/agent-runtime/llm-inferencer.ts` | LLM 推断 agent descriptor | 删除 |
| `src/agent-runtime/config-loader.ts` | config-loaded agent(可选保留,去掉 LLM 部分) | 删除 |
| `src/agent-runtime/provider-registrar.ts` | provider 注册(依赖 llm-inferencer) | 删除 |
| `src/types/agent.ts` 的 `AgentAdapter` 接口 | 无 LLM,但接口被移除 | 删除(`AgentTransport` 替代) |

### Commands(spawn 路径残留)

> **职责说明:** `run-task.ts` 的 spawn 块和 heuristic 函数已在 B2 批次移除(详见 [01-acp-transport.md](./01-acp-transport.md))。以下文件仍保留残留代码,需标记 `@deprecated` 并清理。

| 文件 | 残留内容 | 改造方式 |
|---|---|---|
| `src/commands/run-task-spawner.ts` | spawn 状态机 + `parseTokenUsage()` 正则 | 标记 `@deprecated`,保留 `RedactionTransform`(exec step 仍需要,详见 [03-workflow-engine.md](./03-workflow-engine.md)) |
| `src/commands/run-task-logger.ts` | `detectAgentExecutionOutcome()` + `classifyAgentFailureCode()` 等 heuristic 函数 | 标记 `@deprecated`,后续删除 |

### CLI Tools

| 文件 | LLM 调用 | 改造方式 |
|---|---|---|
| `src/cli-tools/discovery/cache-manager.ts` | 2 处:createLLMConfig + completeRaw() | 移除 LLM 能力推断 |

## 移除统计

| 类别 | 文件数 | 估算行数 |
|---|---|---|
| 完全删除 | ~20 | ~3000 |
| 修改(移除 LLM 调用) | ~20 | ~-500(净减少) |
| **总计** | ~40 | ~-3500(净减少约 3500 行) |

## 移除顺序(依赖反向)

```
1. 叶子: prompt 模板、llm-adapter、intent-matcher
2. 中层: llm-http-client、llm-config、llm-orchestrator
3. 上层: llm.ts (barrel)
4. 消费者: pipeline.ts、tool-calling.ts、nl-handler.ts
5. 命令: run-task.ts、parse-doc.ts、run.ts、chat.ts、generate.ts
6. Skills: llm-dialog-control/、intent-skill、workflow-skill
7. Agent runtime: llm-inferencer、provider-registrar、adapters/
8. 其他: self-healing.ts、cache-manager.ts、api/server.ts
```

## 移除后的替代方案

| 原 LLM 功能 | 替代方案 |
|---|---|
| 意图分类 | ACP agent 能力路由(待定) |
| 命令生成 | ACP transport 直接执行(不需要生成 CLI 命令) |
| 文档解析 | ACP agent 结构化任务链 |
| YAML workflow 生成 | ACP agent 生成 |
| 错误诊断 | ACP agent 分析 |
| 语义匹配 | ACP agent 搜索 |
| 越界变更审查 | 确定性边界检查 + 人工确认 |
| Agent descriptor 推断 | ACP probe + 静态配置 |
| CLI 工具能力推断 | 静态配置 |
