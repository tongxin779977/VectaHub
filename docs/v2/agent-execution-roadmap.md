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

### 进行中：P2 Agent Worker 化

状态：Stage 1/2/3 已完成，Stage 4 文档和 hardening 进行中。

已具备能力：

- 定义 `AgentTaskContract`、任务边界和并发判定类型。
- 能从任务文档片段中提取最小上下文，不默认传递完整大文档。
- 能确定性提取允许修改文件、默认禁止修改范围和建议验证命令。
- `run-task` 能构造 Agent 任务合同，并在 JSON 中只输出合同摘要。
- trace 只记录合同摘要计数和提取策略，不记录完整文档片段。
- 插件批量执行前会读取文档一次，生成任务边界摘要。
- 边界未知或文件范围重叠时，插件会把批量执行降级为串行。
- 任务运行记录只保存合同计数摘要，不保存完整 `docExcerpt`。

## 3. 总体阶段

```text
P0  可观测性基线        已完成第一版
P1  文档任务状态机      已完成
P2  Agent Worker 化     进行中
P3  验证闭环
P4  安全与权限闭环
P5  性能与资源控制
P6  自愈与恢复
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

### 最小闭环

```text
Agent 执行
-> collect git diff
-> run targeted tests
-> run typecheck
-> classify result
-> update task state
```

### 验证类型

- targeted test。
- typecheck。
- lint。
- build。
- secret scan。
- diff summary。

### 验收标准

- 任务成功必须有验证记录。
- 验证失败进入 `failed_test` 或对应失败状态。
- 验证命令、退出码、耗时、stdout/stderr 引用都可追踪。
- 不把完整 stdout/stderr 放入 JSON 协议。

## 8. P4：安全与权限闭环

### 目标

所有 Agent 生成命令和系统执行命令都必须经过统一安全策略。

### 关键能力

- Agent CLI 可用性 preflight。
- Agent 权限状态检查。
- 命令风险评估。
- 高风险命令拦截或要求确认。
- env 白名单传递。
- secrets redaction。

### 验收标准

- 未安装、未启用、无权限 Agent 不进入执行队列。
- 高风险命令不会静默执行。
- trace 记录安全判定，但不记录 secrets。
- 插件端和 CLI 端安全结果一致。

## 9. P5：性能与资源控制

### 目标

保证执行系统长期运行时速度快、内存小、不会因日志和 trace 膨胀拖垮。

### 性能边界

```text
CLI 轻量命令冷启动：< 300ms
trace 单 span 写入：不阻塞主流程
trace list 默认 limit：20
trace list 最大 limit：100
单 span JSON 建议上限：8KB
插件常驻增量内存：尽量 < 30MB
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

## 10. P6：自愈与恢复

### 目标

基于 trace、失败分类、stderr、diff 和验证结果生成修复任务，但不自动越权执行。

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
cancel -> fail
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
P0 hardening
```

处理 Trace v1 的边界问题，确保它成为可靠基线。

### 下一阶段

```text
P1 文档任务状态机
```

这是后续 Agent Worker 化和验证闭环的前置条件。

### 再下一阶段

```text
P2 Agent Worker 化
P3 验证闭环
```

这两步可以并行设计，但实现上应先 P2 后 P3。

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
