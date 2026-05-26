# Agent CLI 注册与 Runtime 架构设计

> Document Status: Design / Migration Contract
> Authority: 本文解释 Agent CLI registry、runtime catalog、adapter、bootstrap、preflight 与 workflow `delegate` 的目标分层。`run-task` 的完整执行语义仍以 [Run-Task 执行合同规格](../specs/run-task-execution-contract.md) 为准。

## 定位

Agent CLI Runtime 是 VectaHub 调度外部 Agent CLI 的运行时事实层。

它的目标不是把所有 Agent CLI 变成同一个工具，而是把不同 Agent CLI 的调用协议、可用性、权限、运行目录和执行模式统一成可审查的 runtime definition。

VectaHub 应该负责：

- 记录有哪些 Agent CLI 可以被使用。
- 判断它们是否安装、可调用、就绪。
- 确定 prompt、cwd、env、timeout 如何传给对应 CLI。
- 在执行前做 bootstrap、preflight、安全确认。
- 给 `run-task` 和 workflow `delegate` 提供同一套 Agent 解析入口。

Agent CLI 自己负责：

- 具体推理和执行能力。
- 自身认证、模型、provider 和内部工具调用。
- 自身输出和错误。

## 当前能力事实

当前已经存在的能力：

- 内建 Agent descriptors：`codex`、`gemini`、`aider`、`claude`。
- `AgentDescriptor` 描述入口命令、子命令、prompt transport、cwd 参数、非交互 flags、preflight 和 runtime policy。
- `AgentAdapter` 负责把 descriptor 和任务 prompt 渲染成命令与参数。
- `AgentRegistry` 可以注册 descriptor 和 adapter。
- CLI 启动时会初始化内建 Agent。
- `tools agents --json` 可以输出 Agent CLI 的 `installed`、`invocable`、`ready`、permission 和 enabled 状态。
- `bootstrapAgentRuntime` 可以为需要可写 home 的 Agent 准备隔离 runtime home。

当前边界：

- registry 目前主要是内建 registry，不是完整动态用户注册平台。
- `tools agents` 已经是很有价值的 runtime probe，但还不是完整 runtime catalog。
- `AgentDescriptor` 还没有稳定表达 `executionMode`、capabilities、constraints、issues、confidence。
- `custom` Agent CLI 仍是目标方向，不能写成当前已完整支持。
- workflow `delegate` 还没有默认接入 Agent registry 的执行 handler。
- 代码里还有 `src/agent-runtime/interfaces.ts` 的另一套接口，和当前 `src/types/agent.ts` 模型需要后续收敛。

## 核心分层

推荐把 Agent CLI Runtime 拆成四层：

```text
Agent Registry
-> Runtime Catalog
-> Invocation Renderer
-> Runtime Bootstrap / Preflight
```

### Agent Registry

Registry 是权威运行时定义来源。

它回答：

- 这个 Agent 叫什么？
- 入口命令是什么？
- 是否有子命令？
- prompt 用参数、stdin、文件还是位置参数传入？
- cwd 如何传入？
- 哪些 flags 表示非交互执行？
- 是否支持 headless？
- preflight 应探测哪条真实路径？
- runtime home 是否需要隔离？

第一版可以继续以内建 descriptor 为主，但目标上应支持显式 custom descriptor。

### Runtime Catalog

Runtime catalog 是从 registry 和 probe 结果派生出来的机器可读状态视图。

它不是第二个 registry。

它回答：

- 是否已安装？
- 是否配置启用？
- 是否有权限？
- 是否可调用？
- 是否就绪？
- 为什么不可用？
- 当前执行模式是什么？
- 能否进入自动执行？

`tools agents --json` 应逐步成为这个 catalog 的主要 CLI 出口。

### Invocation Renderer

Renderer 负责把结构化任务输入转成具体 argv。

它必须由系统控制，不能让 LLM 为已注册 Agent 临场发明命令行参数。

输入应是：

- `AgentDescriptor`
- workspace root
- task prompt
- execution mode
- output mode

输出应是：

- command
- args
- env patch
- preview
- redaction hints

### Runtime Bootstrap / Preflight

Bootstrap 负责准备可写 runtime home，但不能偷偷改变用户默认配置语义。

Preflight 负责判断真实入口是否可用。

分层状态应至少包括：

- `installed`
- `configuredEnabled`
- `hasPermission`
- `invocable`
- `ready`
- `blockedReason`

`ready=true` 只表示 VectaHub 已知的外层调用链就绪，不代表任务一定成功。

## AgentDescriptor 目标字段

当前 `AgentDescriptor` 已有不少字段。后续建议收敛为下面的目标合同：

```ts
interface AgentRuntimeDefinition {
  id: string;
  displayName: string;
  entryCommand: string;
  subcommand?: string;
  executionMode: 'native_headless' | 'mediated_interactive' | 'manual_only';
  promptTransport: 'arg' | 'stdin' | 'file' | 'positional';
  promptArgName?: string;
  cwdTransport?: 'arg' | 'env' | 'inherit';
  workingDirectoryArg?: string;
  nonInteractiveFlags: string[];
  approvalPolicySupport: 'none' | 'top-level' | 'subcommand' | 'unknown';
  structuredOutputSupport: boolean;
  preflightSpec: {
    versionArgs: string[];
    invocableArgs: string[];
    readyArgs: string[];
  };
  runtimePolicy?: AgentRuntimePolicy;
  capabilities: string[];
  constraints: string[];
  issues?: string[];
  confidence: 'low' | 'medium' | 'high';
  source: 'builtin' | 'user-config' | 'onboarding';
}
```

注意：这是一份目标合同，不代表当前源码已经完整实现所有字段。

## 执行模式

Agent CLI 不能只用“可用 / 不可用”表示。

推荐三种执行模式：

| 模式 | 含义 | VectaHub 行为 |
|------|------|---------------|
| `native_headless` | 支持稳定非交互执行。 | 可以由 renderer 生成命令并自动 spawn。 |
| `mediated_interactive` | 不能充分 headless，但可通过 PTY 和 approval broker 托管。 | 进入 mediated runner，不能伪装成 headless。 |
| `manual_only` | 可被发现，但不适合自动执行。 | 只展示使用建议，自动执行 fail closed。 |

当前文档和代码里已经有 headless、preflight、bootstrap 的基础，但 `executionMode` 字段还需要正式进入 registry 合同。

## 与 `run-task` 的关系

`run-task` 当前最需要 Agent Runtime 提供确定性。

目标链路：

```text
AgentTaskContract
-> resolve Agent Runtime Definition
-> bootstrap runtime home
-> preflight installed / invocable / ready
-> render invocation
-> risk assessment
-> spawn
-> collect changes
-> verification
```

关键规则：

- 已注册 Agent 必须走 registry-backed renderer。
- LLM 不得为已注册 Agent 生成最终 argv。
- 未注册 Agent 不能无界自动探测；第一版应要求显式 custom descriptor。
- runtime bootstrap 失败应归类为配置类失败。
- `run-task --dry-run --json` 应能展示 registry-derived preview。

## 与 workflow `delegate` 的关系

`delegate` 应该成为 workflow 调用 Agent Runtime 的标准 step。

目标链路：

```text
workflow delegate step
-> delegateTo
-> Agent Registry
-> Runtime Catalog check
-> Invocation Renderer
-> Runtime Bootstrap / Preflight
-> Agent process
-> outputVar / artifact
-> execution record
```

`delegate` handler 最小职责：

- 校验 `delegateTo` 是否存在。
- 读取对应 runtime definition。
- 构建 delegate prompt。
- 渲染调用命令。
- 运行 bootstrap 和 preflight。
- 进入安全确认。
- 执行 Agent CLI。
- 将输出写入 `outputVar` 或 artifact。
- 在 execution record 里记录 agent target、状态、exit code 和错误摘要。

## Custom Agent 第一版

`custom` 不建议第一版做成自动 marketplace。

第一版应只支持显式配置：

```yaml
agents:
  custom-doc-agent:
    entryCommand: my-agent
    promptTransport: stdin
    executionMode: native_headless
    preflightSpec:
      versionArgs: ["--version"]
      invocableArgs: ["--help"]
      readyArgs: ["--help"]
```

最小要求：

- 用户显式写配置。
- VectaHub 校验必填字段。
- preflight 必须能证明真实入口可调用。
- 不允许 LLM 自动发明最终调用协议。
- 配置错误 fail closed。

## 安全边界

Agent Runtime 必须保守处理：

- 不保存 token、auth 文件内容、完整 env。
- 不保存完整 stdout/stderr，除非进入受控失败日志并脱敏。
- 不把完整 help 输出塞进 LLM 上下文。
- 不在 bootstrap 时创建空 home 后强行切换。
- 不把 `ready=true` 解释成“任务安全”。
- 不允许 unknown Agent 直接 spawn。

每次 Agent 执行都应有：

- runtime resolution 记录，
- bootstrap 结果，
- preflight 结果，
- permission decision，
- spawn trace，
- output summary，
- failure classification。

## 阶段路线

### Phase 1: Registry Contract

目标：

- 以 `src/types/agent.ts` 作为权威类型入口。
- 给 descriptor 补 `executionMode`、capabilities、constraints、issues。
- 收敛 `src/agent-runtime/interfaces.ts` 的重叠接口。

### Phase 2: Runtime Catalog

目标：

- `tools agents --json` 输出完整 runtime catalog。
- 保留 `installed / invocable / ready`。
- 增加 `executionMode / status / blockedReason / capabilities / constraints`。

### Phase 3: Run-Task Runtime Resolution

目标：

- `run-task` 全量走 registry-backed renderer。
- `dry-run` 输出 registry-derived preview。
- bootstrap 和 preflight 失败进入结构化失败分类。

### Phase 4: Workflow Delegate Handler

目标：

- 默认 executor 注册 `delegate` handler。
- `delegate` 通过 Agent registry 执行外部 Agent CLI。
- 输出进入 `outputVar`，大输出进入 artifact。

### Phase 5: Custom Agent

目标：

- 支持显式 custom descriptor。
- 支持 `tools agents validate <descriptor>`。
- 支持 `tools agents add` 或配置文件导入。
- 暂不做自动 marketplace。

## 架构取舍

应该优先做：

- registry 单一事实源。
- runtime catalog。
- deterministic renderer。
- bootstrap / preflight。
- workflow `delegate` handler。
- explicit custom descriptor。

不应该优先做：

- 自动 Agent marketplace。
- LLM 自动生成未知 Agent 调用协议。
- 多用户 agent 权限平台。
- 把 Agent auth 复制进 VectaHub 配置。
- 把完整 help、完整输出、完整配置作为长期上下文。
