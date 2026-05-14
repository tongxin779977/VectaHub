# VectaHub Agent 执行系统整体计划大纲

## 1. 目标

VectaHub 不与底层 Agent 比“聪明”，而是把 Agent 执行系统做到可追踪、可约束、可恢复、可验证、低开销。

核心定位：

```text
Agent = Worker
VectaHub = Orchestrator
```

Agent 只负责边界清楚的小任务。VectaHub 负责拆解、调度、状态、追踪、安全、验证和失败恢复。

## 2. 当前状态

### 已完成：P0 Trace v1

状态：已实现，待二次 hardening 后进入稳定基线。

已具备能力：

- 插件与 CLI 之间传递 `traceId` / `parentSpanId`。
- CLI 侧有轻量 Trace Core。
- 插件侧有轻量 Trace Core。
- `run-task` 关键阶段已埋点。
- 插件 `runCli`、JSON 解析、取消、spawn error 已埋点。
- `vectahub trace list` 和 `vectahub trace show <traceId>` 已实现。
- trace 不写 stdout，不破坏现有 JSON 协议。

第一步后续 hardening：

- 所有 span 生命周期必须闭合，包括用户确认取消。
- trace env 必须最后注入，避免被调用方覆盖。
- `trace list/show` 增加 limit，避免全量读大文件。
- trace 总耗时改为 `max(endTime) - min(startTime)`。
- 增加插件到 CLI 的端到端 trace 测试。
- 提交后记录 commit hash。

### 已完成：P1 文档任务状态机

状态：已提交为稳定阶段基线。

已具备能力：

- CLI 和插件端都能创建任务运行记录。
- 每个任务运行有独立 `taskRunId`、`traceId`、状态和失败分类。
- 批量执行能记录单任务成功、失败、取消和 git diff 摘要。
- 插件任务列表能展示任务状态并读取最近运行记录。

提交记录：

```text
e7c4e51 [doc-tasks] add task run state machine
```

### 已完成第一版：P2 Agent Worker 化

状态：Stage 1/2/3/4 已完成第一版，进入后续 hardening backlog。

已具备能力：

- 定义 `AgentTaskContract`、任务边界和并发判定类型。
- 能从任务文档片段中提取最小上下文，不默认传递完整大文档。
- 能确定性提取允许修改文件、默认禁止修改范围和建议验证命令。
- `run-task` 能构造 Agent 任务合同，并在 JSON 中只输出合同摘要。
- trace 只记录合同摘要计数和提取策略，不记录完整文档片段。
- 插件批量执行前会读取文档一次，生成任务边界摘要。
- 边界未知或文件范围重叠时，插件会把批量执行降级为串行。
- 任务运行记录只保存合同计数摘要，不保存完整 `docExcerpt`。
- `run-task --contract-preview --json` 可只生成合同摘要，不加载 LLM、不执行 Agent。
- 插件 lint 已清理为 0 warning / 0 error。
- 插件批量预检已建立文档 heading 索引，避免每个任务重复拆文档标题。
- 任务运行记录写入已增加实例内队列，降低并发写 `latest.json` 的竞争风险。

性能结论：

- 合同预览路径只读目标文档一次，不走 LLM 配置、工具发现和 Agent spawn。
- 插件批量预检只共享一次 `docContent`，并复用文档索引提取任务片段。
- 任务记录只保存计数摘要，避免把文档片段和大输出写入持久化记录。
- 同一插件进程内运行记录写入串行化，避免并发任务同时覆盖 latest 临时文件。

P2 剩余 hardening backlog：

- 插件执行阶段复用合同预览结果，避免每个 CLI 子进程重复读取和提取文档。
- 为常见 Agent CLI 增加确定性命令模板，模板命中时跳过 LLM 命令生成。
- 引入 git diff baseline 或 worktree 隔离，解决并发任务 diff 归因问题。
- 把 CLI 和插件端合同推导规则合并为单一来源，避免长期规则漂移。

## 3. 总体阶段

```text
P0  可观测性基线        已完成第一版
P1  文档任务状态机      已完成
P2  Agent Worker 化     已完成第一版
P3  验证闭环            已完成第一版
P4  安全与权限闭环      已完成第一版
P5  性能与资源控制      已完成第一版
P6  自愈与恢复          主链路第一版已成型（进入 hardening）
P7  插件可视化体验
```

## 4. P0：可观测性基线

### 目标

所有用户操作、CLI 命令、Agent 执行、JSON 协议解析都能被追踪。

### 已完成范围

- Trace Core。
- 插件到 CLI trace env 传递。
- `run-task` 核心 span。
- trace JSONL 落盘。
- trace 查询命令。

### 完成定义

- 每次插件触发文档任务都有唯一 trace。
- CLI 直接运行也能生成 trace。
- `--json` stdout 保持纯 JSON。
- trace 写入失败不影响主流程。
- 能通过 trace 定位失败阶段。

### 后续边界

P0 只做链路追踪，不做完整 UI 时间线、不接 OpenTelemetry、不引入数据库。

## 5. P1：文档任务状态机

### 目标

把文档任务从“按钮触发 CLI”升级为可持久化、可恢复、可分类失败的任务状态机。

### 建议状态

```text
parsed
ready
preflight
running
changed
verifying
success
failed_config
failed_agent
failed_json_protocol
failed_timeout
failed_test
failed_conflict
cancelled
needs_confirmation
```

### 关键能力

- 每个任务有独立 `taskRunId`。
- 每个任务关联 `traceId`。
- 每个任务关联 git diff 摘要。
- 每个任务记录当前状态、失败原因、下一步建议。
- 支持失败后继续执行剩余任务。
- 支持从某个失败任务恢复。

### 文件边界

优先修改：

```text
src/types/doc-task.ts
src/commands/run-task.ts
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/src/project/taskHistory.ts
packages/vectahub-vscode-extension/src/project/taskModel.ts
```

暂不修改：

```text
workflow engine
database schema
LLM prompt 大结构
```

### 验收标准

- 批量任务不再只有 success/failed。
- 配置失败、Agent 失败、JSON 失败、测试失败能区分。
- 插件能展示任务当前状态和失败分类。
- 每个任务都能跳转到对应 trace。

## 6. P2：Agent Worker 化

### 目标

限制 Agent 输入、输出和修改范围，降低“一次任务过大”导致的失败率。

### 关键能力

- 每个 Agent 任务必须有明确输入：
  - task id
  - task label
  - **instructionHash (用于检测需求变更)**
  - 文档片段
  - 允许修改范围
  - 禁止修改范围
  - 验收命令
- 默认串行。
- 并行只允许在文件范围不重叠或隔离 worktree 下开启。

- Agent 输出不作为系统状态来源，系统状态由 VectaHub 自己记录。

### 任务输入合同

```ts
interface AgentTaskContract {
  taskId: string;
  label: string;
  docPath: string;
  docExcerpt?: string;
  allowedFiles?: string[];
  forbiddenFiles?: string[];
  validationCommands: string[];
  timeoutMs: number;
}
```

### 验收标准

- Agent 不再拿整份大文档作为唯一上下文。
- 执行前能看到任务修改边界。
- 多任务并发前必须通过边界检查。
- Agent 失败后 VectaHub 能给出结构化失败原因。

## 7. P3：验证闭环

### 目标

让每个任务完成后自动进入验证阶段，不再只依赖 Agent 自述。

### 状态

**已完成第一版开发与验证**

已具备能力：
- CLI `run-task` 在 Agent 成功后顺序执行合同里的验证命令。
- JSON 返回包含 `verification` 摘要。
- 插件能根据验证结果自动标记 `failed_test`。
- 任务运行记录保存验证命令计数、耗时及失败命令摘要。
- 验证过程已接入 Trace，可追踪每条验证命令的执行详情。

### 验收标准

- 任务成功必须有验证记录。
- 验证失败进入 `failed_test` 或对应失败状态。
- 验证命令、退出码、耗时、stdout/stderr 引用都可追踪。
- 不把完整 stdout/stderr 放入 JSON 协议。

## 8. P4：安全与权限闭环

### 目标

所有 Agent 生成命令和系统执行命令都必须经过统一安全策略。

### 状态

**已完成第一版开发与验证**

已具备能力：
- Agent CLI 可用性与权限 `preflight`。
- 命令风险评估 (Risk Assessment)。
- 高风险命令拦截与用户二次确认逻辑。
- Trace 与 Record 敏感信息脱敏 (Redaction)。
- 安全规则库单例化与高性能扫描。

### 验收标准

- 未安装、未启用、无权限 Agent 不进入执行队列。
- 高风险命令不会静默执行。
- trace 记录安全判定，但不记录 secrets。
- 插件端和 CLI 端安全结果一致。

## 9. P5：性能与资源控制

### 目标

保证执行系统长期运行时速度快、内存小、不会因日志和 trace 膨胀拖垮，并实现 LLM 消耗成本审计。

### 状态

**已完成第一版开发，进入 hardening backlog**

已具备能力：
- 插件端已建立 `DocTaskDocIndex`，批量合同预检可复用一次文档读取结果。
- 任务运行记录已限制摘要大小，并通过实例内写队列降低 `latest.json` 并发覆盖风险。
- `trace list/show` 已采用流式读取，并支持 `--limit` 控制返回规模。
- `run-task` 已对 Agent 输出做实时脱敏、输出截断和 Token 使用量捕获。
- CLI 已拆分为 `cli.ts -> cli-bootstrap.ts -> cli-main.ts` 启动链路，轻量命令可绕过主命令装载。

仍需 hardening：
- 文档索引仍保留完整 `content`，大文档场景下仍有插件内存峰值压力。
- CLI 启动链路仍存在顶层入口执行，不满足最严格的“顶级作用域零副作用”约束。
- `DocTaskRunStore` 目前是写队列串行化，不等于批量 flush；高频状态变更下 IO 仍可能偏高。
- 插件预检与 CLI 执行阶段尚未共享合同推导结果，仍存在跨进程重复读取文档。
- 仍缺少性能基准、冷启动测量和大文档回归测试，无法正式宣告 P5 稳定完成。

### 性能边界

```text
CLI 轻量命令冷启动：< 250ms
trace 单 span 写入：不阻塞主流程
trace list 默认 limit：20
单任务 Token 审计记录：必选
批量任务 Token 预算预警：可选
插件常驻增量内存：尽量 < 20MB
普通 CLI 峰值内存：尽量 < 120MB
```

### 关键策略

- 顶层 import 保持轻。
- 命令 lazy load。
- stdout/stderr 超限落盘。
- trace 查询流式读取。
- task 只保存摘要和引用。
- Agent 不可用时批量任务短路。

### 验收标准

- trace 文件变大时 list/show 不明显卡顿。
- 插件任务树不保存大日志。
- 大文档解析走分块。
- 批量任务失败不会重复跑无意义 Agent 调用。

## 10. P5.5：工作区隔离层 (Isolated Exec)

### 目标
解决并发任务的 Git 状态污染和 Diff 归因冲突。

### 关键能力
- 基于 `git worktree` 的轻量环境克隆。
- 任务执行与主目录隔离。
- 并发任务间的物理文件隔离。
- 自动清理过期临时工作区。

### 验收标准
- 多个任务同时修改同一组文件时，不再产生 Git Merge 冲突。
- 并发任务的 Diff 归因准确率 100%。

## 11. P6：自愈与恢复

### 目标

基于 trace、失败分类、stderr、diff 和验证结果生成修复任务，但不自动越权执行。

### 状态

**主链路第一版已成型，当前进入 hardening 阶段**

当前已具备基础：
- workflow/execution 链路已有 `rerun`、`resume`、失败点继续执行能力。
- 插件侧已有恢复入口与恢复决策主链路（含 hash guard、恢复记录持久化）。
- CLI 侧已有 `recover-task` 命令与对应测试覆盖。
- 文档任务状态机已能保存失败分类、traceId、验证摘要和重试来源字段。

当前缺口：
- authoritative hash/digest 来源尚未完整闭环。
- 在 currentHash unavailable 场景，恢复链路会保守阻断，状态刷新会跳过 drift reset。
- 恢复 UX、提示与可视化仍需 hardening。
- no-full-read 仍是 P5/P2 hardening gap。

### 关键能力

- 失败根因分类。
- 修复建议生成。
- 用户确认后重试。
- 从失败步骤继续。
- 保留原始失败 trace。

### 验收标准

- 系统能区分“可自动重试”和“需要人工确认”。
- 自愈任务有新的 trace，并关联原始 trace。
- 不在无确认情况下执行高风险修复。

## 11. P7：插件可视化体验

### 目标

让用户在插件端看到任务执行时间线、失败阶段和下一步操作。

### 关键能力

- 任务状态分组。
- trace 时间线展示。
- 失败原因摘要。
- 一键打开 trace detail。
- 一键重试失败任务。
- 一键运行验证。

### 验收标准

- 用户不用看终端日志也能定位失败阶段。
- 插件 UI 只展示摘要，不加载大日志。
- 点击任务能看到 traceId、状态、耗时、失败分类。

## 12. 横向边界

### 数据边界

允许记录：

- taskId。
- command name。
- exitCode。
- durationMs。
- stdoutLength / stderrLength。
- changedFileCount。
- traceId。

禁止记录：

- API key。
- token。
- 完整 env。
- 完整 prompt。
- 完整 stdout/stderr。
- 未脱敏敏感路径或凭据。

### 生命周期边界

所有 span 必须闭合：

```text
success -> end
failure -> fail
cancel -> fail (全局中断，停止后续所有待执行任务)
user dismiss before execution -> end or fail
spawn error -> fail
```

### 兼容边界

- `--json` stdout 必须保持纯 JSON。
- 不改变已有 JSON 字段语义。
- trace 写入失败不能改变 exitCode。
- 插件旧调用不传 `traceContext` 时仍能正常运行。

### 提交边界

每阶段完成必须满足：

- 代码实现完成。
- 测试通过。
- 类型检查通过。
- 文档更新。
- 无关用户改动不被提交。
- 提交 commit，并在对应文档记录 commit hash。

## 13. 推荐执行顺序

### 当前立即处理

```text
P6 自愈与恢复设计收口
P2/P5 单一事实源与性能 hardening
```

理由：
- P3/P4/P5 均已完成第一版，当前主要问题不是“缺功能”，而是专项文档、路线图和代码现状仍有漂移。
- P6 主链路第一版已成型，当前重点是 hardening（hash/digest 权威来源、恢复 UX 与可视化）。
- P2/P5 仍有跨进程重复计算、规则双份实现和性能预算缺少实测的问题，需要收口后才能作为稳定基线。

### 下一阶段

```text
P5.5 工作区隔离层 (Worktree Isolation)
P7 插件可视化体验
```

建议先补充一份基于代码现状的任务分配文档，作为后续阶段执行入口：

```text
docs/v2/next-task-allocation.md
```


## 14. 文档拆分建议

后续每个阶段单独输出执行规格：

```text
docs/v2/trace-execution-spec.md
docs/v2/doc-task-state-machine-spec.md
docs/v2/agent-worker-contract-spec.md
docs/v2/task-verification-loop-spec.md
docs/v2/security-permission-loop-spec.md
docs/v2/performance-resource-budget-spec.md
docs/v2/self-healing-recovery-spec.md
docs/v2/vscode-trace-ui-spec.md
```

每份执行规格必须包含：

- Goal。
- Current Problems。
- In Scope。
- Out of Scope。
- Data Contract。
- Lifecycle Contract。
- Performance Contract。
- Security/Privacy Contract。
- Compatibility Contract。
- File Changes。
- Implementation Steps。
- Acceptance Criteria。
- Test Plan。
- Completion Definition。
- Hardening TODO。

## 15. Agent 实施文档设计方法论

后续所有详细 Agent 实施文档必须先完成方法论检查，再进入代码实现。目标是避免“文档看起来完整，但执行后暴露性能、内存、并发、状态归因问题”。

### 15.1 先画执行链路

每份实施文档必须明确从用户动作到最终状态落盘的完整链路：

```text
用户动作
-> 插件命令
-> CLI 命令
-> Agent/工具调用
-> git diff / 验证
-> 状态记录
-> trace / UI 展示
```

必须回答：

- 哪些步骤在插件进程执行。
- 哪些步骤在 CLI 子进程执行。
- 哪些步骤会启动 Agent 或 LLM。
- 哪些步骤会读写磁盘。
- 哪些步骤可能重复执行。

如果链路中存在跨进程重复计算，必须写出为什么暂时接受，以及后续如何收敛。

### 15.2 数据生命周期必须闭环

每一种数据都要标注生命周期：

```text
来源 -> 传输 -> 使用 -> 摘要 -> 持久化 -> 清理
```

必须区分：

- 可进入 prompt 的数据。
- 可进入 JSON 协议的数据。
- 可进入 trace 的数据。
- 可进入 task run record 的数据。
- 只能在内存中短期存在的数据。

文档全文、完整 stdout/stderr、完整 prompt、完整 diff 默认不得持久化。确需保存时必须给出上限、截断策略和引用路径。

### 15.3 性能预算必须可论证

每份实施文档必须给出复杂度和预算，不允许只写“性能要好”。

必须包含：

- 对文档大小的假设，例如 50KB、500KB、5MB。
- 对任务数量的假设，例如 10、100、500。
- 关键函数复杂度，例如 `O(docSize)`、`O(taskCount * docSize)`。
- 是否会重复读取同一文件。
- 是否会重复启动 CLI、LLM 或 Agent。
- 是否会在 UI 线程做大计算。

凡是出现 `taskCount * docSize`、每任务重复 spawn、每任务重复全量 diff、每状态重复写大文件，都必须明确优化策略。

### 15.4 并发与共享状态必须先设计

只要允许并发，文档必须回答：

- 并发单位是什么：任务、文件、worktree、进程还是验证命令。
- 哪些资源是共享的：worktree、latest cache、trace 文件、日志、git diff。
- 是否有写队列、锁、唯一临时文件或幂等写入。
- 取消时未开始、运行中、已完成任务分别如何收敛。
- 多个任务同时失败时状态如何归档。

没有隔离时默认串行。允许并发必须证明文件边界不重叠，并说明 git diff 归因方式。

### 15.5 状态来源必须由系统掌控

Agent 输出只能作为参考，不能作为系统状态唯一来源。

实施文档必须定义：

- 系统如何判断 `success`、`changed`、`failed_*`。
- git diff 如何收集和归因。
- 验证命令如何选择、执行、记录。
- 失败如何分类。
- Agent 自述和系统检测冲突时谁优先。

默认优先级：

```text
系统验证结果 > git diff / exitCode > Agent 输出文本
```

### 15.6 观测与调试必须可定位

每份实施文档必须定义 trace span：

- span 名称。
- parent/child 关系。
- 记录哪些摘要属性。
- 明确禁止记录哪些大字段和敏感字段。
- 失败时 span 如何闭合。

必须能通过 trace 回答：

- 命令卡在哪一步。
- 哪一步耗时最长。
- 哪个任务导致批量降级。
- 哪个验证命令失败。

### 15.7 兼容性与回滚必须明确

新增字段、命令参数和状态必须说明：

- 是否破坏现有 JSON 字段语义。
- 老插件调用新 CLI 是否可用。
- 新插件调用老 CLI 时如何降级。
- 新功能失败时是否影响主流程。
- 是否需要迁移历史 task run record。

默认策略：

- JSON 只增可选字段，不改旧字段含义。
- trace / record 写入失败不影响主流程。
- 预检失败降级串行，不阻断执行。

### 15.8 Agent 文档输出模板

后续让 Agent 实施某阶段前，详细文档必须按以下顺序输出：

```text
1. 用户目标和禁止事项
2. 当前链路事实
3. 根因分析
4. In Scope / Out of Scope
5. 数据合同
6. 生命周期合同
7. 并发和共享状态设计
8. 性能与内存预算
9. 安全与隐私边界
10. 兼容和降级策略
11. 文件修改清单
12. 实施步骤
13. 测试计划
14. 验收标准
15. Hardening backlog
```

其中第 2、3、7、8 项必须基于当前代码事实，不允许只写目标状态。

### 15.9 设计评审 Gate

详细 Agent 实施文档进入编码前必须通过以下 Gate：

- 是否列出跨进程重复处理。
- 是否列出共享状态写入。
- 是否列出 UI 线程计算。
- 是否列出 stdout/stderr、prompt、diff、doc 的大小上限。
- 是否列出并发降级策略。
- 是否列出失败分类和恢复策略。
- 是否列出性能预算和测试方法。
- 是否列出不做事项和后续 hardening。

任一项缺失，不进入实现阶段。
