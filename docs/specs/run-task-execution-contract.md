# Run-Task 执行合同规格

## 1. 目标

本文档是 `run-task` 执行语义的单一事实源。

它定义：

- 输入分支：`--contract-preview`、`--dry-run`、正常执行
- 正常执行阶段：命令生成、风险评估、preflight、spawn、`gitChanges`、`verification`、JSON 收口
- 完成边界：`exit`、`close`、总超时、未收口执行
- 失败分类：`failed_agent`、`failed_timeout`、`failed_system_internal`、`failed_test`、`needs_confirmation`
- 副作用语义：何时允许出现 `gitChanges`，何时禁止进入 `verification`
- 恢复入口语义：哪些失败可直接重试，哪些必须转为修复任务或人工处理

其他文档如果涉及 `run-task`，只应引用本文或补充本模块局部约束，不得再重复定义完整执行链路。

## 2. 术语

### 2.1 执行前确认

指在真正 `spawn Agent` 之前，因为风险评估命中“可确认后继续”的前置门禁而要求人工确认。

当前合同约束：

- 主命令 `high`：执行前确认
- 验证命令 `high/critical`：验证前确认
- 主命令 `critical`：不进入执行前确认，必须 fail-closed 阻断

约束：

- 发生时机：`spawn` 前
- 仓库副作用：不得已有仓库写盘副作用
- 状态语义：属于 preflight/security gate，不得伪装成“已执行后等待确认”

### 2.2 执行后确认

指 Agent 已执行，并且系统已经观测到越界修改、触碰 forbidden files 或其他必须人工接管的副作用，因此需要人工确认后再继续处理。

约束：

- 发生时机：`gitChanges` 已存在之后
- 仓库副作用：已存在，不能被描述为纯预检阻断
- 状态语义：属于执行后副作用分流，不得与执行前确认混写

### 2.3 未收口执行

指 Agent 已产生仓库副作用，但 CLI 尚未完成权威收口。

典型特征：

- 已观测到 `gitChanges.changedFileCount > 0`
- 最终结果不是成功收口
- `verification` 缺失

典型例子：

- `timeout + gitChanges.changedFileCount > 0 + verification 缺失`
- Agent 写盘后长期不 `close`，CLI 最终按超时或未完成失败收口

约束：

- 不能写成“未执行”
- 不能视为成功
- 不允许继续进入 `verification`
- 默认恢复策略不是 `retry_direct`

### 2.4 Agent 支持分层

`run-task` 的 Agent 接入必须区分三层：

- `adapter-backed known agents`
  - 当前实现：`codex`、`gemini`、`aider`、`claude`
  - 含义：已有 descriptor，且存在内建 adapter，可确定性渲染命令
- `descriptor-known but adapter-incomplete agents`
  - 当前实现：无（保留该分层用于后续新增 Agent 迁移期）
  - 含义：已有 descriptor / preflight 事实，但没有完整内建 adapter，执行路径仍可能落入 `llm-fallback`
- `unknown/fallback agents`
  - 含义：没有内建 descriptor，仍走 help/LLM fallback

文档不得把 `descriptor-known but adapter-incomplete` 写成“已完整 adapter-backed”。

## 3. 输入分支合同

### 3.1 `--contract-preview`

语义：

- 只构建 `agentTaskContract` 摘要并立即返回
- 不要求 `--tool`
- 不创建 LLM client，也不发起 LLM 请求
- 不做 tool help discovery
- 不执行 Agent
- 不做仓库副作用

JSON 语义：

- 保留 `ok`、`command`、`output`、`outputTruncated`、`agentTaskContract`
- `command` 与 `output` 为空字符串
- 若传入了 `tool`，实现可返回 `commandGenerationPath` 作为预测执行路径信号；这不表示已经做过 command generation、tool help discovery 或 LLM 调用

### 3.2 `--dry-run`

语义：

- 先构建 `agentTaskContract` 摘要
- 不执行 Agent
- 不做仓库副作用
- 不进入 `verification`
- 对 `llm-fallback` 工具，可只读取本地 Provider/Model/Temperature 元数据来完成最终 `instructionHash`，但不得创建 LLM client

权威语义以 JSON 输出为准：

- `run-task --dry-run --json` 的结构化结果是事实源
- `command` 是主要预览载体
- `output` 是否为空是兼容细节，不应在其他文档重复定义

非 JSON 模式：

- 是否打印可读预览命令属于 UX 行为
- 如果实现与 UX 期望不完全一致，应在对应 UX 文档或 backlog 中说明
- 非 JSON 预览不属于执行合同真相源

当前实现分层：

- 对 `adapter-backed known agents`，dry-run 可走确定性 adapter 预览
- 对 `descriptor-known but adapter-incomplete` 与 `unknown/fallback agents`，当前仍可能返回 fallback 预览命令

### 3.3 正常执行

只有正常执行分支允许进入下列阶段：

```text
command generation
-> risk assessment
-> runtime bootstrap
-> agent preflight
-> spawn
-> collect gitChanges
-> verification
-> JSON closeout
```

## 4. 正常执行生命周期

### 4.1 命令生成

- `adapter-backed known agents` 必须优先走 adapter
- `descriptor-known but adapter-incomplete agents` 当前实现仍允许落入 `llm-fallback`
- `unknown/fallback agents` 允许走 help/LLM fallback
- fallback 结果必须显式标记 `commandGenerationPath='llm-fallback'`

### 4.2 风险评估

至少要区分两类：

- 主命令风险评估
- 验证命令风险评估

主命令风险评估合同：

- `critical`：必须 fail-closed，不能继续执行
- `high`：必须进入执行前确认；无确认能力时不得继续执行
- `medium/low/safe`：按实现允许继续

验证命令风险评估合同：

- 风险判断仍然属于执行前确认范畴，因为验证命令尚未运行
- 如果调用方没有确认能力，必须停止在验证前，而不是静默执行

当前实现边界：

- 主命令风险评估已在 `spawn` 前执行
- 验证命令的高风险确认目前主要由上层交互处理；本合同将其定义为必须前置的执行前确认语义，后续实现必须向此收敛

### 4.3 Runtime Bootstrap

对已知 Agent：

- bootstrap 的目标是提供可写运行态，而不是改变用户默认 provider/auth/model 语义
- 不能把空目录当作新的权威配置源
- 缺少必要配置时必须按配置类失败收口

### 4.4 Agent Preflight

preflight 必须在 runtime bootstrap 之后执行。

分层事实：

- `installed`
- `invocable`
- `ready`

`ready=true` 只表示 VectaHub 已知的外层入口就绪，不等于任务一定成功，也不覆盖下游 Agent 自身的二级沙箱、approval policy、远程插件同步或本地命令能力。

### 4.5 Spawn 与执行产物

`spawn` 后系统开始采集：

- Agent 输出摘要
- `gitChanges`
- 软系统失败信号

Agent 输出不是最终状态真相源，只是执行材料。最终状态由 VectaHub 收口。

### 4.6 `gitChanges`

`gitChanges` 表示已观测到仓库副作用。

约束：

- `gitChanges` 存在不等于任务成功
- `gitChanges` 不存在也不等于 Agent 没执行
- `gitChanges` 一旦存在，后续失败分类与恢复策略必须承认已有副作用

### 4.7 `verification`

只有在以下条件同时满足时才允许进入 `verification`：

- Agent 已完成正常执行收口
- 未命中软系统失败短路
- 不属于未收口执行
- 验证命令风险未卡在执行前确认

以下情况一律不得进入 `verification`：

- `failed_timeout`
- 未收口执行
- Agent 软系统失败
- 执行前确认未完成

如果最终返回时 `verification` 缺失，上层必须结合失败分类与 `gitChanges` 解读，不得把“缺失 verification”自动视为“无需验证”。

## 5. 完成边界合同

### 5.1 权威收口信号

`run-task` 的完成边界不是单一 `close`。

权威完成信号应按如下组合理解：

- `close`
- `exit + 流写入排空`
- `exit + 有界 flush grace`
- 总超时

当前代码事实已支持：

- `close`
- `exit-stream-drain`
- `exit-flush-grace`
- `timeout`

因此，任何文档都不得再把 `close` 描述为唯一完成信号。

### 5.2 未收口执行判定

满足以下条件时，必须视为未收口执行：

```text
最终结果失败
且 gitChanges.changedFileCount > 0
且 verification 缺失
```

推荐同时记录：

- 完成信号：`timeout` / `exit-stream-drain` / `exit-flush-grace` / `close`
- 是否已有 `gitChanges`
- 是否已进入 `verification`

### 5.3 JSON 收口要求

如果发生未收口执行：

- `ok` 必须为 `false`
- 必须保留已观测到的 `gitChanges`
- 必须保留可安全输出的 Agent 摘要
- `verification` 必须缺失
- 禁止把该次执行描述为“未执行”

## 6. 失败分类合同

### 6.1 `failed_agent`

用于：

- Agent 子进程或外部 CLI 普通执行失败
- 其他不属于配置、协议、超时、系统内部、测试失败的 Agent 层失败

### 6.2 `failed_timeout`

用于：

- 明确超时
- 包括“无副作用超时”和“有副作用但未收口超时”

附加约束：

- 如果伴随 `gitChanges.changedFileCount > 0` 且 `verification` 缺失，必须同时视为未收口执行

### 6.3 `failed_system_internal`

用于：

- Agent 已启动，但被本地命令层、工具层、文件访问层或运行时环境阻断
- 输出出现 `sandbox-exec: sandbox_apply` 等下游环境阻塞信号
- 无法读取代码、无法执行本地修改、本地命令入口不可用
- 验证命令因 `ENOENT`/`EACCES`/`EPERM` 等系统原因无法执行

### 6.4 `failed_test`

用于：

- `verification` 已运行
- 验证命令返回断言失败或非零退出
- 失败原因是业务/测试不通过，而非系统环境阻断

### 6.5 `needs_confirmation`

`needs_confirmation` 不是单一来源状态，必须拆分解释：

- 执行前确认
  - 来源：主命令风险达到 `high`，或验证命令风险达到 `high/critical`
  - 时机：`spawn` 前或验证前
  - 副作用：无仓库副作用
  - 规范状态路径：`preflight/securityCheck -> needs_confirmation`
  - 排除：主命令 `critical` 不得落入该分支，必须按 fail-closed/security blocked 处理
- 执行后确认
  - 来源：越界修改、forbidden files、副作用后人工接管
  - 时机：`gitChanges` 已存在后
  - 副作用：已有仓库副作用
  - 规范状态路径：`changed -> needs_confirmation`

同名状态不得掩盖这两类来源的差异。

## 7. 恢复入口合同

### 7.1 可直接重试

只有以下场景默认可视为 `retry_direct` 候选：

```text
failed_timeout
且 gitChanges.changedFileCount = 0
且 verification 缺失
```

或

```text
failed_json_protocol
且 gitChanges.changedFileCount = 0
且缺少 Agent 成功执行迹象
```

### 7.2 必须转修复任务

以下场景默认转为 `suggest_fix + confirm_required`：

```text
failed_timeout
且 gitChanges.changedFileCount > 0
且 verification 缺失
```

或

```text
failed_agent
且存在 gitChanges
```

或

```text
failed_test
```

理由：

- 已有仓库副作用
- 不适合盲重试
- 应基于现有 diff 和失败上下文继续处理

### 7.3 必须人工处理

以下场景默认不是自动恢复入口：

- `failed_conflict`
- `failed_system_internal`
- `instructionHash` 不匹配
- authoritative hash unavailable

### 7.4 `needs_confirmation` 的恢复差异

执行前确认：

- 可在确认后继续原路径
- 因为尚无副作用，不应被解释为修复任务

执行后确认：

- 应先承认已存在副作用
- 默认走人工确认后的接管、审查或 bounded fix
- 不得被写成“只需补一次同意就和预检确认一样”

## 8. 文档使用规则

以下文档如果涉及 `run-task`：

- `cli-command-surface`
- `doc-task-state-machine`
- `verification-loop`
- `trace-execution`
- `recovery-loop`
- `tools-security-management`
- `agent-cli-adapter-architecture`

则必须遵循：

- 完整执行链路语义引用本文
- 只在本文件外补充局部模块约束
- 不得另起一套 dry-run、完成边界、`needs_confirmation`、Agent 分层或未收口执行定义

## 9. 当前实现与后续 hardening

已确认事实：

- `--contract-preview` 与 `--dry-run` 已分支化
- `adapter-backed known agents` 当前为 `codex`、`gemini`、`aider`
- `claude` 当前已升级为 `adapter-backed known agent`
- 完成边界代码已支持 `close`、`exit-stream-drain`、`exit-flush-grace`、`timeout`
- `timeout + gitChanges + verification 缺失` 已被代码和测试识别为失败且保留副作用摘要

仍需 hardening：

- 验证命令高风险确认需完全收敛到统一执行前确认合同
- 插件侧 trace 仍需补强“已写盘但未收口”的表达能力
- 文档与实现应继续收敛到同一套完成边界与恢复矩阵
