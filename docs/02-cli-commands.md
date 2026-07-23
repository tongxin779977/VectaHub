# 02 — CLI 命令清单与改造映射

> **依赖清单** — 本文档引用以下外部定义:
> - `AcpConfig` → [01-acp-transport.md § 传输工厂](./01-acp-transport.md#传输工厂)
> - `cli.run-task.verification` trace span → 本文 § verification trace span(00 愿景指定归属本文)

## 命令总览

VectaHub 有 43 个 CLI 命令,按改造类型分为四类:

| 类别 | 命令数 | 改造方式 |
|---|---|---|
| **ACP 改造** | 6 | 内部从 LLM/Agent CLI 切换到 ACP transport |
| **Workflow 改造** | 4 | 内部 workflow 引擎适配 ACP |
| **轻量改造** | 5 | 增加 ACP agent 配置/检查/查询,不改变核心逻辑 |
| **保留纯 CLI** | 19 | 不改动,仅 bump 版本 |
| **移除** | 9 | LLM 相关命令移除或合并 |

## 命令改造映射表

### ACP 改造类(6 个)

| 命令 | 当前实现 | 改造后 | 改动文件 |
|---|---|---|---|
| `run` | LLM NL pipeline → workflow 生成 → workflow 执行 | ACP agent 意图识别 → workflow 生成 → workflow 执行 | `src/commands/run.ts`, `src/nl/` |
| `chat` | LLM REPL + NL processor + workflow engine + agent CLI | ACP agent REPL + workflow engine | `src/commands/chat.ts`, `src/chat/` |
| `parse-doc` | LLM 解析文档提取任务列表 | ACP agent 解析文档提取结构化任务链 | `src/commands/parse-doc.ts` |
| `run-task` | LLM 命令生成 + Agent CLI spawn + heuristic 分析 | ACP transport.execute() + 结构化事件 | `src/commands/run-task.ts` |
| `recover-task` | LLM 恢复决策 + Agent CLI 重新执行 | ACP transport 重新执行 + 恢复决策(保留) | `src/commands/recover-task.ts` |
| `generate` | LLM 生成 YAML workflow | ACP agent 生成 YAML workflow | `src/commands/generate.ts` |

### Workflow 改造类(4 个)

| 命令 | 当前实现 | 改造后 | 改动文件 |
|---|---|---|---|
| `rerun` | workflow engine execute | 保留,workflow 内部已适配 ACP | 无改动 |
| `resume` | workflow engine resumeFromFailure | 保留,同上 | 无改动 |
| `run-command` | security guard + workflow engine | 保留,exec step 不涉及 ACP | 无改动 |
| `draft` | draft storage + draft executor | 保留,draft execute 走 workflow | 无改动 |

### 轻量改造类(5 个)

这些命令的核心逻辑不变,仅增加 ACP agent 相关的配置、检查或查询。

| 命令 | 说明 | 改动 |
|---|---|---|
| `setup` | 运行安装流程 | 改为配置 ACP agent |
| `config show` | 显示配置 | 增加显示 ACP agent 配置 |
| `config reset` | 重置配置 | 增加重置 ACP agent 配置 |
| `config tools` | 列出 CLI 工具 | 改为列出 ACP agent |
| `doctor` | 系统诊断 | 增加 ACP agent 可用性检查 |
| `tools` | CLI 工具管理 | 改为 ACP agent 管理 |
| `trace` | 链路追踪 | 增加 ACP 事件查询 |

> **注:** `config` 的 3 个子命令(show/reset/tools)均有 ACP 相关改动,计入 `config` 1 个命令。`tools` 和 `trace` 各计 1 个。共 5 个命令。

### 保留纯 CLI 类(19 个)

| 命令 | 说明 | 改动 |
|---|---|---|
| `version` | 显示版本 | 无 |
| `completion` | 生成补全脚本 | 无 |
| `client` | 服务客户端 | 无 |
| `security` | 安全管理 | 无 |
| `audit` | 审计管理 | 无 |
| `list` | workflow 列表 | 无 |
| `mode` | 执行模式 | 无 |
| `history` | 执行历史 | 无 |
| `detail` | 执行详情 | 无 |
| `archive` | 归档 | 无 |
| `schedule` | 定时任务 | 无 |
| `daemon` | 守护进程 | 无 |
| `templates` | 模板管理 | 无 |
| `rollback` | 版本回滚 | 无 |
| `verify` | 验证检查 | 无 |
| `monitor` | 性能监控 | 无 |
| `debug` | 调试 | 无 |
| `export` / `import` | 导入导出 | 无 |
| `doc-task-runs` | 任务运行记录 | 无 |
| `queue` | 诊断队列 | 无 |
| `run-task-clean-logs` | 清理日志 | 无 |
| `vscode` | VS Code 集成 | 无 |
| `dev *` | 开发命令 | 无 |

### 移除/合并类(9 个)

| 命令 | 原因 |
|---|---|
| `serve` | LLM socket server,改用 ACP agent 直接服务 |
| `provider` | Agent CLI provider 管理,ACP 不需要 provider 注册 |
| `tools agents` | Agent CLI 扫描,改为 ACP agent 探测 |
| `tools register` | Agent CLI 注册,ACP 不需要 |
| `tools test` | Agent CLI 测试,改为 ACP probe |
| `tools rules` | Agent CLI 规则,ACP 不需要 |
| `tools eval` | Agent CLI 评估,改为 ACP 能力查询 |
| `tools search` | Agent CLI 搜索,改为 ACP agent 列表 |
| `tools category` | Agent CLI 分类,改为 ACP agent 分类 |

## setup 命令改造

`setup` 是初次启动的入口,改造为配置 ACP agent:

```
vectahub setup
  → 检测已安装的 ACP agent (opencode / claude / codex)
  → 让用户选择默认 ACP agent
  → 保存到 config: { acp: { agentId, command, args, timeoutMs } }
  → 验证 ACP agent 可用性 (probe)
```

## config 命令改造

```bash
vectahub config show
# 输出新增:
# ACP Agent:
#   Agent ID: opencode
#   Command: opencode acp
#   Timeout: 600000ms
#   Status: available (verified)

vectahub config reset
# 重置时清除 ACP agent 配置,重新运行 setup
```

## tools 命令改造

```bash
# 改造前
vectahub tools agents          # 扫描 Agent CLI
vectahub tools register <cmd>  # 注册 Agent CLI

# 改造后
vectahub tools agents          # 探测 ACP-compatible agents
vectahub tools info <agentId>  # 显示 ACP agent 能力
vectahub tools test <agentId>  # ACP probe 验证
```

## verification trace span

> 00 愿景定义了 `cli.run-task.verification` trace span,指定归属本文。

`run-task` 命令在执行验证命令(`typecheck` / `test` / `lint` 等)时创建此 span:

```typescript
// src/commands/run-task.ts — 验证阶段
// 在 runVerificationCommands() 中创建

const verifySpan = startSpan('cli.run-task.verification', {
  context: traceContext,
  parentSpanId: transportSpanId,  // transport.execute 的 span 作为 parent
  kind: SpanKind.INTERNAL,
  attributes: {
    commands: validationCommands,
    taskId,
  },
});

// 执行验证命令...
// span.end({ passed, failedCount }) 或 span.fail(error)
```

**Span 层级关系:**

```
cli.run-task
  └─ cli.run-task.transport.execute        ← 01 定义
       └─ cli.run-task.transport.acp.*      ← 01 定义(6 个子 span)
  └─ cli.run-task.verification             ← 本文定义(run-task 验证阶段)
```

> **注意:** `cli.run-task.verification` 与 `cli.run-task.transport.execute` 是兄弟 span,都是 `cli.run-task` 的子 span。验证在 transport 执行完成后进行。
