# Doc Task State Machine Spec

## 1. 任务目标

把文档任务执行从“插件按钮触发 CLI”升级为轻量、可持久化、可恢复、可分类失败的状态机。

P1 的核心目标：

- 每个文档任务有独立运行记录。
- 每个任务运行记录关联 `traceId`。
- 每个任务失败能被分类，而不是只有 `failed`。
- 批量任务可以继续、恢复、跳过无意义失败。
- 插件只保存摘要，不常驻大日志。
- 状态读写要快，内存占用要小。

## 2. 当前基线

当前实现状态：

- `src/types/doc-task.ts` 中 `DocTask` 只有 `id` 和 `label`。
- 插件侧 `DocTaskStatus` 只有 `pending | running | success | failed`。
- `runDocTasks.ts` 中任务状态主要存在内存里。
- `taskHistory.ts` 只保存最近运行记录，且为进程内数组，重启后丢失。
- `run-task` 已能返回 `ok`、`command`、`output`、`gitChanges`。
- Trace v1 已提供 traceId/span 贯通能力。

P1 不重写任务解析，不重构 workflow engine，不引入数据库。

## 3. In Scope

- 新增文档任务状态模型。
- 新增轻量持久化 task run store。
- 单任务和批量任务接入状态机。
- 任务运行记录关联 traceId。
- 任务运行记录保存 git change summary。
- 任务失败分类。
- 支持恢复/继续执行未完成任务。
- 插件视图展示更细状态。
- 补充状态机单元测试和插件逻辑测试。

## 4. Out of Scope

- 不做完整 UI 时间线。
- 不做 OpenTelemetry。
- 不引入 SQLite。
- 不做 worktree 隔离并行。
- 不做自动修复。
- 不重写 `parse-doc` 的 LLM 提取逻辑。
- 不改变现有 `run-task --json` 字段语义。
- 不把完整 stdout/stderr 存入 task run 记录。

## 5. 状态模型

### 5.1 任务定义状态

文档解析出来的任务本身是定义，不等于一次运行。

```ts
export interface DocTask {
  id: string;
  label: string;
  status?: DocTaskDisplayStatus;
  lastRunId?: string;
  lastTraceId?: string;
  lastFailureKind?: DocTaskFailureKind;
}
```

`status` 只用于插件展示摘要，不作为完整运行记录来源。

### 5.2 运行状态

```ts
export type DocTaskRunStatus =
  | 'parsed'
  | 'ready'
  | 'preflight'
  | 'running'
  | 'changed'
  | 'verifying'
  | 'success'
  | 'failed_config'
  | 'failed_agent'
  | 'failed_json_protocol'
  | 'failed_timeout'
  | 'failed_test'
  | 'failed_conflict'
  | 'cancelled'
  | 'needs_confirmation';
```

第一版 P1 必须实现：

```text
ready
preflight
running
changed
success
failed_config
failed_agent
failed_json_protocol
failed_timeout
failed_conflict
cancelled
needs_confirmation
```

`verifying` 和 `failed_test` 可以先保留类型，P3 验证闭环再完整接入。

### 5.4 插件端指纹校验与状态回滚 (Hash Validation)

为了确保文档内容变更后任务状态能实时响应，插件端必须实现以下逻辑：

1.  **同算法实现**：插件端必须实现与 CLI 完全一致的 `computeInstructionHash` 算法。
2.  **加载时校验**：插件在从 `latest.json` 或 `.jsonl` 加载 `DocTaskRunRecord` 时，必须立即根据当前文档内容重新计算 Hash。
3.  **状态失效处理**：
    *   若 `calculatedHash !== record.instructionHash`，则视为该次运行记录已失效。
    *   系统必须将该任务的显示状态回滚为 `ready`（或 `pending`），并在 UI 上清除旧的 `gitChanges` 摘要。
    *   失效的记录不得被用于 `resume` 或 `rerun` 逻辑。

**DoD**：用户在 Markdown 文档中修改任一任务描述后，保存文档，VS Code 任务树中对应的 `success` 图标应立即变回待执行状态。

插件树视图不需要展示所有内部状态。映射为：

```ts
export type DocTaskDisplayStatus =
  | 'pending'
  | 'ready'
  | 'preflight'
  | 'running'
  | 'changed'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'needs-confirmation';
```

映射规则：

```text
ready -> ready
preflight -> preflight
running -> running
changed -> changed
success -> success
cancelled -> cancelled
needs_confirmation -> needs-confirmation
failed_* -> failed
```

## 6. 失败分类

```ts
export type DocTaskFailureKind =
  | 'config'
  | 'agent'
  | 'json_protocol'
  | 'timeout'
  | 'test'
  | 'conflict'
  | 'cancelled'
  | 'unknown';
```

分类规则：

```text
failed_config:
  - LLM 未配置
  - Agent CLI 未安装
  - Agent CLI 未启用
  - Agent CLI 无权限
  - docPath 缺失或不可读

failed_json_protocol:
  - CLI exitCode=0 但 JSON 解析失败
  - result.error.code=INVALID_JSON

failed_timeout:
  - result.error.code=TIMEOUT
  - error message 包含 timeout / timed out

failed_conflict:
  - git diff 中存在未预期冲突标记
  - 输出包含 merge conflict / conflict marker

failed_agent:
  - run-task ok=false
  - Agent 子进程执行失败
  - 其他外部 CLI 错误

cancelled:
  - 用户取消
  - token cancellation

unknown:
  - 无法分类的错误
```

## 7. 数据合同

### 7.1 Task Run Record

新增共享类型，CLI 和插件字段保持一致。建议放在插件侧 task model，并在 CLI `src/types/doc-task.ts` 保留兼容类型。

```ts
export interface DocTaskRunRecord {
  runId: string;
  batchRunId?: string;
  taskId: string;
  taskLabel: string;
  docPath?: string;
  agentCli: string;
  status: DocTaskRunStatus;
  failureKind?: DocTaskFailureKind;
  errorMessage?: string;
  command?: string;
  traceId?: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  durationMs?: number;
  gitChanges?: {
    changedFileCount: number;
    changedFiles: string[];
    shortStat?: string;
  };
  outputSummary?: string;
  outputTruncated?: boolean;
  retryOfRunId?: string;
}
```

### 7.2 Batch Run Record

```ts
export interface DocTaskBatchRunRecord {
  batchRunId: string;
  docPath?: string;
  agentCli: string;
  traceId?: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}
```

### 7.3 大字段限制

禁止在 task run record 中保存：

- 完整 stdout。
- 完整 stderr。
- 完整 Agent 输出。
- 完整 prompt。
- 完整 env。

字段长度限制：

```text
errorMessage: <= 1000 chars
outputSummary: <= 2000 chars
changedFiles: <= 100 items
single record serialized size: <= 16KB
```

超过限制必须截断，并设置 `outputTruncated=true`。

## 8. 存储设计

### 8.1 存储位置

按项目隔离，避免不同项目互相污染。

```text
~/.vectahub/projects/<projectHash>/doc-task-runs/
  batches.jsonl
  runs-YYYY-MM-DD.jsonl
  latest.json
```

`projectHash` 使用现有 `djb2Hash(projectRoot)` 逻辑，与 diagnostic queue 保持一致。

### 8.2 写入策略

第一版使用 append-only JSONL。

```text
runs-YYYY-MM-DD.jsonl:
  每次状态变化 append 一条最新 record snapshot (唯一真理来源)

latest.json:
  只保存每个 taskId 的最新 run 摘要 (快照索引/热缓存)
```

**索引一致性保障**：
- `latest.json` 写入必须使用临时文件再 rename。
- **自愈机制**：如果 `latest.json` 损坏、缺失或与 `.jsonl` 状态严重不一致，系统必须具备从 `.jsonl` 尾部回溯解析并重建 `latest.json` 的能力。

JSONL append 失败应返回错误；插件需要展示状态写入失败，但不能让进程崩溃。

### 8.4 读取策略

插件视图默认只读：

```text
latest.json
```

历史列表读取：

```text
最近 7 天 JSONL
默认 limit=100
最大 limit=500
```

禁止：

- 启动时扫描所有历史文件。
- 一次性把所有 JSONL 读入内存。
- 在 tree view 每次刷新时读取大日志。

## 9. 性能与内存预算

### 9.1 性能目标

```text
任务状态更新写入: < 10ms，不含磁盘异常
latest.json 读取: < 20ms for 100 tasks
插件 refresh 额外开销: < 30ms for 100 tasks
批量 100 个任务状态初始化: < 100ms
单条 run record 序列化: < 16KB
默认历史读取: <= 100 records
```

### 9.2 内存目标

```text
插件常驻只保存当前文档任务摘要
不在内存保存完整 run 历史
不在内存保存完整 stdout/stderr
run history 查询最多保留 limit 条
```

### 9.3 快速失败

以下情况必须在进入 Agent 执行前短路：

- 没有 docPath。
- docPath 不存在。
- 未选择 agentCli。
- agentCli 不可用。
- LLM 配置缺失导致 run-task 必然失败。
- 当前已有任务 running。

批量执行中，如果 preflight 判断 Agent 不可用，所有未开始任务标记为 `failed_config`，不要逐个 spawn CLI。

## 10. 状态转换

### 10.1 单任务

```text
ready
-> preflight
-> running
-> changed
-> success
```

失败分支：

```text
preflight -> failed_config
running -> failed_agent
running -> failed_json_protocol
running -> failed_timeout
running -> failed_conflict
running -> cancelled
changed -> needs_confirmation
```

### 10.2 批量任务

```text
batch running
  task ready
  task preflight
  task running
  task success / failed_* / cancelled
batch success / failed / cancelled
```

批量执行原则：

- 默认串行。
- 并发值来自配置，但 P1 不引入 worktree 隔离。
- 失败任务不阻塞后续任务，除非属于全局配置失败。
- 用户取消时：
  - running 任务标记 cancelled。
  - 未开始任务保持 ready 或标记 cancelled，二选一必须在文档和代码中一致。

推荐：未开始任务标记 `cancelled`，方便用户知道本批次没有执行。

## 11. 文件修改清单

### CLI 侧

新增：

```text
src/commands/doc-task-runs.ts
src/commands/doc-task-runs.test.ts
```

修改：

```text
src/types/doc-task.ts
src/types/index.ts
src/commands/index.ts
src/cli.ts
src/commands/run-task.ts
src/commands/run-task.test.ts
```

### 插件侧

新增：

```text
packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts
packages/vectahub-vscode-extension/test/docTaskRunStore.test.ts
packages/vectahub-vscode-extension/test/docTaskStateMachine.test.ts
```

修改：

```text
packages/vectahub-vscode-extension/src/views/tasksView.ts
packages/vectahub-vscode-extension/src/views/treeItems.ts
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/src/project/taskModel.ts
packages/vectahub-vscode-extension/src/project/taskHistory.ts
packages/vectahub-vscode-extension/package.json
```

如果 `out/` 已入库，运行编译后同步：

```text
packages/vectahub-vscode-extension/out/**
```

## 12. CLI 命令设计

新增命令：

```text
vectahub doc-task-runs list --json
vectahub doc-task-runs show <runId> --json
vectahub doc-task-runs latest --json
```

### 12.1 `list`

参数：

```text
--project <path>
--limit <n>          default=50 max=500
--status <status>
--failure-kind <kind>
--json
```

JSON 返回：

```json
{
  "ok": true,
  "runs": [],
  "hasMore": false
}
```

### 12.2 `show`

只返回摘要和引用，不返回完整日志。

```json
{
  "ok": true,
  "run": {}
}
```

### 12.3 `latest`

返回当前项目每个 taskId 的最新摘要。

```json
{
  "ok": true,
  "tasks": []
}
```

## 13. 插件实现要求

### 13.1 `docTaskRunStore.ts`

提供：

```ts
export function createDocTaskRunStore(projectRoot: string): DocTaskRunStore;

export interface DocTaskRunStore {
  startBatch(input: StartBatchInput): Promise<DocTaskBatchRunRecord>;
  updateBatch(record: DocTaskBatchRunRecord): Promise<void>;
  startRun(input: StartRunInput): Promise<DocTaskRunRecord>;
  updateRun(record: DocTaskRunRecord): Promise<void>;
  getLatestByTaskId(taskId: string): Promise<DocTaskRunRecord | undefined>;
  getLatestMap(): Promise<Map<string, DocTaskRunRecord>>;
  listRuns(options?: ListRunsOptions): Promise<DocTaskRunRecord[]>;
}
```

要求：

- 内部维护小型 LRU 或 Map 缓存，只缓存 `latest.json`。
- 缓存最多 200 个 task summary。
- 文件 watcher 或显式 update 后刷新缓存。
- 所有写入必须截断大字段。

### 13.2 `runDocTasks.ts`

单任务执行流程：

```text
create run record: ready
preflight
update: preflight
runCli
update: running
classify result
update: changed/success/failed_*
refresh tree
```

批量执行流程：

```text
create batch
preflight global agent
if global failure:
  mark all ready tasks failed_config
  end batch failed
else:
  run queue
  update each task independently
  end batch success/failed/cancelled
```

### 13.3 `tasksView.ts`

展示要求：

- 每个文档任务展示最新状态图标。
- failed 状态 description 显示 failureKind。
- changed 状态使用不同 icon。
- needs-confirmation 状态可以右键后续接入确认命令，P1 只展示。
- tree refresh 不读取历史 JSONL，只读 latest summary。

## 14. 失败分类函数

新增纯函数，便于测试：

```ts
export function classifyDocTaskFailure(input: {
  resultOk: boolean;
  exitCode?: number | null;
  errorCode?: string;
  errorMessage?: string;
  output?: string;
}): {
  status: DocTaskRunStatus;
  failureKind?: DocTaskFailureKind;
  errorMessage?: string;
};
```

测试覆盖：

- `INVALID_JSON` -> `failed_json_protocol`
- `CANCELLED` -> `cancelled`
- timeout message -> `failed_timeout`
- LLM 未配置 -> `failed_config`
- Agent CLI not found -> `failed_config`
- conflict marker -> `failed_conflict`
- unknown non-ok -> `failed_agent`

## 15. 安全与隐私边界

禁止记录：

- API key。
- token。
- 完整 env。
- 完整 stdout/stderr。
- 完整 Agent prompt。
- 未截断的报错堆栈。

允许记录：

- taskId。
- taskLabel。
- agentCli。
- command 摘要。
- traceId。
- changed file names。
- stdout/stderr 长度。
- error message 摘要。

所有字符串字段写入前必须经过长度限制。

## 16. 兼容边界

- 保持 `run-task --json` 现有字段兼容。
- 插件内存中的旧 `DocTask.status` 仍能工作。
- 如果 `doc-task-runs/latest.json` 不存在，插件回退到当前内存状态。
- 如果 run store 写入失败，任务执行仍继续，但展示 warning。
- 不影响 Git & CI diagnostic queue。

## 17. 测试计划

必须新增或更新：

```text
packages/vectahub-vscode-extension/test/docTaskRunStore.test.ts
packages/vectahub-vscode-extension/test/docTaskStateMachine.test.ts
src/commands/doc-task-runs.test.ts
```

必须运行：

```text
npm test -- src/commands/run-task.test.ts --run
npm test -- src/commands/doc-task-runs.test.ts --run
npm run typecheck
npm run compile -w packages/vectahub-vscode-extension
npx vitest run test/docTaskRunStore.test.ts
npx vitest run test/docTaskStateMachine.test.ts
```

如果扩展 lint 存在历史错误，不要混入无关修复。最终说明要列出阻塞文件和错误。

## 18. 性能测试建议

新增轻量性能测试或基准脚本，不要求进入 CI 硬门禁，但本地必须跑一次。

场景：

```text
100 tasks latest.json load
100 task run updates append JSONL
500 historical records list limit=100
large output summary truncation
```

验收：

```text
100 tasks latest load < 20ms
100 updates < 300ms
history list limit=100 < 50ms
single record <= 16KB
```

## 19. 实施顺序

### 阶段 1：类型和纯函数

- 扩展 DocTask 类型。
- 增加 run status / failure kind。
- 实现 `classifyDocTaskFailure`。
- 测试失败分类。

完成标准：

- 不接 UI。
- 不接文件存储。
- 纯函数测试通过。

### 阶段 2：Run Store

- 实现 `docTaskRunStore.ts`。
- 实现 append JSONL。
- 实现 latest.json 原子写。
- 实现 limit 读取。
- 测试性能边界和截断。

完成标准：

- 100 tasks 读取和写入满足预算。
- 写入大字段会截断。

### 阶段 3：单任务接入

- `runDocTask` 接入 run store。
- 单任务关联 traceId。
- 单任务状态落盘。
- 单任务失败分类。

完成标准：

- 单任务成功/失败/取消都有 run record。
- 插件刷新后能看到最新状态。

### 阶段 4：批量任务接入

- batch run record。
- 全局 preflight。
- 未开始任务取消处理。
- 失败分类和继续执行。

完成标准：

- 批量任务每个 task 都有 run record。
- Agent 不可用时快速短路。
- 用户取消后无 running 悬挂状态。

### 阶段 5：CLI 查询命令

- `doc-task-runs list/show/latest`。
- JSON 模式。
- limit 和过滤。

完成标准：

- CLI 可查看当前项目最新文档任务状态。
- 查询不全量加载无限历史。

## 20. 完成定义

P1 完成必须满足：

- 文档任务状态不再只依赖内存。
- 每个任务运行有 `runId` 和可选 `traceId`。
- 失败能分类。
- 批量任务可继续执行，配置类失败能短路。
- 插件 tree view 展示最新状态摘要。
- 查询命令可读取 run records。
- 大输出不会进入 run record。
- 性能预算达标。
- 测试计划通过。
- 文档更新执行结果和 commit hash。

## 21. Hardening TODO

P1 实现完成后再处理：

- 将 `changed` 状态和 P3 验证闭环连接。
- 增加 retry failed task 命令。
- 增加 open trace detail 命令。
- 增加 clear old doc task runs 命令。
- 根据真实使用数据调整历史保留策略。

---

## 22. 执行结果

状态：**已实现，待提交前最终审查**

完成范围：

- 阶段 1：类型和失败分类纯函数。
- 阶段 2：插件侧 `DocTaskRunStore` 存储层。
- 阶段 3：单任务 `runDocTask` 接入运行记录。
- 阶段 4：批量任务 `runAllDocTasks` 接入运行记录。
- 阶段 5：CLI 查询命令 `doc-task-runs`。
- Hardening：`runDocTasks.ts` 状态机辅助逻辑已拆到 `docTaskRunHelpers.ts`。

新增能力：

- 文档任务支持 `ready`、`preflight`、`running`、`changed`、`success`、`failed_*`、`cancelled`、`needs_confirmation` 等运行状态。
- 失败分类支持 `config`、`agent`、`json_protocol`、`timeout`、`test`、`conflict`、`cancelled`、`unknown`。
- 插件侧任务运行记录写入：
  - `~/.vectahub/projects/<projectHash>/doc-task-runs/runs-YYYY-MM-DD.jsonl`
  - `~/.vectahub/projects/<projectHash>/doc-task-runs/latest.json`
  - `~/.vectahub/projects/<projectHash>/doc-task-runs/batches.jsonl`
- 单任务和批量任务都关联 `traceId`。
- 执行输出只保存短摘要，不保存完整 stdout/stderr。
- `latest.json` 使用临时文件 rename 原子写入。
- CLI 支持：
  - `vectahub doc-task-runs list --json`
  - `vectahub doc-task-runs show <runId> --json`
  - `vectahub doc-task-runs latest --json`

已执行验证：

```text
npm test -- src/commands/doc-task-runs.test.ts --run
npm test -- src/commands/run-task.test.ts --run
npm test -- src/infrastructure/logger/json-mode.test.ts --run
npm run typecheck
npm run compile -w packages/vectahub-vscode-extension
npx vitest run test/docTaskStateMachine.test.ts test/docTaskRunStore.test.ts test/docTaskRunHelpers.test.ts
```

验证结果：全部通过。

提交前仍需确认：

- 是否需要把本阶段新增文档与实现拆成独立 commit。
- 是否需要先处理扩展历史 lint 问题。
