# Trace Execution Spec: 插件与 CLI 统一链路追踪

## 1. 任务目标

为 VectaHub 增加跨 VS Code 插件和 CLI 的轻量链路追踪能力。一次用户操作必须能追踪到插件入口、CLI 调用、CLI 内部关键步骤、Agent 子进程执行、JSON 解析和任务状态更新。

`run-task` 的完整执行合同、完成边界和“未收口执行”术语，以 [Run-Task 执行合同规格](./run-task-execution-contract.md) 为准。本文只定义 trace 必须如何观测这些事实。

核心目标不是替换现有日志，而是让失败可定位：

- 一个命令执行了哪些步骤。
- 每一步耗时多少。
- 卡住或失败发生在哪个 span。
- 插件端和 CLI 端是否属于同一次用户操作。
- 失败是配置问题、LLM 问题、Agent CLI 问题、JSON 协议问题、测试失败还是代码冲突。

## 2. 当前问题

- 插件端只能看到 CLI stdout/stderr，看不到 CLI 内部阶段。
- CLI 端没有统一 `traceId` / `spanId`，无法把函数调用串成链路。
- `run-task` 内部的 LLM 命令生成、安全检查、Agent 执行、git diff 收集没有结构化耗时记录。
- 批量文档任务失败时，只能看到任务失败，不能快速定位失败阶段。
- JSON 输出和普通日志需要严格隔离，trace 不能污染 stdout。

## 3. 实现范围

### 需要实现

- CLI 侧 Trace Core。
- VS Code 插件侧轻量 Trace Core。
- 插件调用 CLI 时传递 trace 环境变量。
- `run-task` 关键步骤埋点。
- 插件 `runCli` 和 JSON 解析阶段埋点。
- trace 事件以 JSONL 形式落盘。
- 新增 CLI 命令查看最近 trace 或指定 trace。
- 补充单元测试和最小集成验证。

### 暂不实现

- 不接 OpenTelemetry。
- 不做完整 VS Code 时间线 UI。
- 不重构 Agent 执行架构。
- 不改变现有 CLI JSON 输出协议。
- 不新增数据库。
- 不新增第三方依赖。

## 4. 总体设计

插件和 CLI 都是 trace 事件生产者。插件发起用户操作时创建根 span，并通过环境变量把 trace 上下文传给 CLI。CLI 如果收到上下文，就继续创建 child span；如果用户直接从终端执行 CLI，则 CLI 自己创建新的 trace。

```text
VS Code command
  -> create traceId
  -> start span vscode.runDocTask
  -> runCli passes env
       VECTAHUB_TRACE_ID
       VECTAHUB_PARENT_SPAN_ID
       VECTAHUB_TRACE_SOURCE=vscode
  -> CLI reads env
  -> start span cli.run-task
  -> child spans
       cli.run-task.loadConfig
       cli.run-task.discoverToolHelp
       cli.run-task.generateCommand
       cli.run-task.securityCheck
       cli.run-task.spawnAgent
       cli.run-task.collectGitChanges
       cli.run-task.formatJson
  -> write JSONL
  -> plugin parses CLI JSON
  -> end vscode span
```

trace 文件统一写入：

```text
~/.vectahub/logs/traces/YYYY-MM-DD.jsonl
```

每行是一条 span 完成事件。第一版只要求写完成事件，不要求写 running 事件。

## 5. 数据模型

新增共享语义，CLI 和插件各自实现本地类型，字段保持一致。

```ts
export type TraceSource = 'cli' | 'vscode';

export type TraceSpanStatus = 'completed' | 'failed';

export interface TraceError {
  message: string;
  name?: string;
  stack?: string;
}

export interface TraceSpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  source: TraceSource;
  status: TraceSpanStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  attributes?: Record<string, unknown>;
  error?: TraceError;
}

export interface TraceContext {
  traceId: string;
  parentSpanId?: string;
  source?: TraceSource;
}
```

ID 格式建议：

```text
traceId: tr_<timestamp>_<random>
spanId: sp_<timestamp>_<random>
```

不要引入 UUID 依赖。使用 `Date.now()`、`process.hrtime.bigint()` 和 `Math.random()` 足够。

## 6. 环境变量协议

插件调用 CLI 时必须传递：

```text
VECTAHUB_TRACE_ID=<traceId>
VECTAHUB_PARENT_SPAN_ID=<spanId>
VECTAHUB_TRACE_SOURCE=vscode
```

CLI 读取规则：

- 如果存在 `VECTAHUB_TRACE_ID`，沿用该 trace。
- 如果不存在，CLI 创建新的 trace。
- 如果存在 `VECTAHUB_PARENT_SPAN_ID`，CLI 命令 span 的 parent 指向它。
- `VECTAHUB_TRACE_SOURCE` 只用于判断来源，不得作为安全决策依据。

## 7. 文件修改清单

### CLI 侧

新增：

```text
src/infrastructure/trace/types.ts
src/infrastructure/trace/context.ts
src/infrastructure/trace/writer.ts
src/infrastructure/trace/tracer.ts
src/infrastructure/trace/index.ts
src/commands/trace.ts
src/infrastructure/trace/tracer.test.ts
```

修改：

```text
src/cli.ts
src/commands/index.ts
src/commands/run-task.ts
src/commands/run-task.test.ts
```

### VS Code 插件侧

新增：

```text
packages/vectahub-vscode-extension/src/trace/types.ts
packages/vectahub-vscode-extension/src/trace/context.ts
packages/vectahub-vscode-extension/src/trace/writer.ts
packages/vectahub-vscode-extension/src/trace/tracer.ts
packages/vectahub-vscode-extension/src/trace/index.ts
packages/vectahub-vscode-extension/test/trace.test.ts
```

修改：

```text
packages/vectahub-vscode-extension/src/cli/adapter.ts
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/package.json
```

如果编译产物已入库，运行扩展编译后同步：

```text
packages/vectahub-vscode-extension/out/**
```

## 8. CLI Trace Core 要求

### `context.ts`

提供：

```ts
export function createTraceId(): string;
export function createSpanId(): string;
export function getTraceContextFromEnv(env?: NodeJS.ProcessEnv): TraceContext | null;
export function createRootTraceContext(): TraceContext;
export function createChildEnv(context: TraceContext, parentSpanId: string): NodeJS.ProcessEnv;
```

要求：

- 不读取 secrets。
- 不把完整 env 写入 trace。
- 只识别 `VECTAHUB_TRACE_ID`、`VECTAHUB_PARENT_SPAN_ID`、`VECTAHUB_TRACE_SOURCE`。

### `writer.ts`

提供：

```ts
export async function writeTraceSpan(record: TraceSpanRecord): Promise<void>;
```

要求：

- 写入 `getVectaHubPath('logs', 'traces', '<date>.jsonl')`。
- 使用 `mkdir(..., { recursive: true })`。
- 写入失败不能影响主流程。
- 不写 stdout。

### `tracer.ts`

提供：

```ts
export interface SpanHandle {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  end(attributes?: Record<string, unknown>): Promise<void>;
  fail(error: unknown, attributes?: Record<string, unknown>): Promise<void>;
}

export function startSpan(
  name: string,
  options?: {
    context?: TraceContext;
    parentSpanId?: string;
    source?: TraceSource;
    attributes?: Record<string, unknown>;
  }
): SpanHandle;

export async function withSpan<T>(
  name: string,
  fn: (span: SpanHandle) => Promise<T>,
  options?: Parameters<typeof startSpan>[1]
): Promise<T>;
```

要求：

- `withSpan` 成功时记录 completed。
- `withSpan` 抛错时记录 failed，然后继续抛出原错误。
- `durationMs` 使用单调时间计算，时间戳使用 ISO 字符串。

## 9. 插件 Trace Core 要求

插件侧实现同名轻量模块，行为与 CLI 侧一致，但路径计算使用现有插件方式：

```text
packages/vectahub-vscode-extension/src/cli/adapter.ts
getVectaHubHome()
```

插件侧必须支持：

- 创建 root span。
- 写 JSONL。
- 给 CLI 子进程注入 trace env。
- 在 `runCli` 中记录：
  - `vscode.cli.spawn`
  - `vscode.cli.parseJson`
  - `vscode.cli.cancel`
  - `vscode.cli.spawnError`

## 10. `run-task` 埋点要求

在 `src/commands/run-task.ts` 中增加 span：

```text
cli.run-task
cli.run-task.loadLlmConfig
cli.run-task.discoverToolHelp
cli.run-task.generateCommand
cli.run-task.securityCheck
cli.run-task.spawnAgent
cli.run-task.collectGitChanges
cli.run-task.formatJson
```

每个 span 至少记录以下 attributes：

```text
taskId
tool
dryRun
```

特定步骤额外记录：

```text
discoverToolHelp:
  helpLength

generateCommand:
  fallbackUsed
  command

securityCheck:
  dangerous
  severity
  ruleName

spawnAgent:
  command
  timeoutMs
  stdoutLength
  stderrLength
  exitCode
  completionSignal

collectGitChanges:
  changedFileCount
```

补充要求：

- `spawnAgent` 的完成边界不能只靠一个布尔“是否结束”。实现必须区分 `exit`、`close`、总超时杀进程、以及 `exit` 后的有界流刷新收口。
- 已确认的真实场景是：某些 Agent CLI 会在仓库已写盘后长时间不 `close`。trace 不得仅凭“尚未 close”推断“尚未执行”。
- 至少应能从 trace 上区分“Agent 没执行”“Agent 已写盘但未收口”“Agent 正常完成并返回”这三类链路。其中“Agent 已写盘但未收口”对应执行合同中的“未收口执行”。

禁止记录：

- API key。
- 完整环境变量。
- 完整 Agent 输出。
- 过长 prompt。

如果需要记录文本，长度限制为 500 字符以内。

## 11. CLI `trace` 命令

新增命令：

```text
vectahub trace list
vectahub trace show <traceId>
```

### `trace list`

输出最近 trace 概览。

JSON 模式：

```text
vectahub trace list --json
```

返回：

```json
{
  "ok": true,
  "traces": [
    {
      "traceId": "tr_xxx",
      "spanCount": 12,
      "failedCount": 1,
      "durationMs": 82000,
      "lastSeen": "2026-05-13T03:20:00.000Z"
    }
  ]
}
```

### `trace show <traceId>`

输出该 trace 的 span 列表，按开始时间排序。

JSON 模式：

```text
vectahub trace show tr_xxx --json
```

返回：

```json
{
  "ok": true,
  "traceId": "tr_xxx",
  "spans": []
}
```

非 JSON 模式输出简洁树形文本即可。

## 12. 插件调用链埋点要求

修改 `packages/vectahub-vscode-extension/src/cli/adapter.ts`：

- `runCli` 开始时，如果 options 没有 trace context，就创建一个 span。
- spawn CLI 前把 trace env 合并到 env。
- 插件侧当前第一版仍主要依赖 child 生命周期做聚合记录；该层对“未收口执行”的表达能力仍弱于 CLI 主链路，需要后续补强，不能反向覆盖 CLI 的权威完成边界。
- JSON 解析单独建 span。
- cancellation 单独记录 failed span，error message 为 `Command was cancelled by user`。
- spawn error 单独记录 failed span。

修改 `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts`：

- 单任务执行命令创建 `vscode.docTask.runSingle` span。
- 批量执行创建 `vscode.docTask.runBatch` span。
- 单个任务状态变化记录 attributes：
  - `taskId`
  - `taskLabel`
  - `status`
  - `agentCli`

## 13. 验收标准

- 直接运行 CLI 命令时，如果没有 trace env，也会生成 trace。
- 插件调用 CLI 时，插件 span 和 CLI span 使用同一个 `traceId`。
- `vectahub run-task --json` stdout 仍然是纯 JSON。
- trace 写入失败不影响命令执行结果。
- Agent CLI 执行失败时，trace 中有 failed span，包含错误 message 和耗时。
- JSON 解析失败时，插件 trace 中有 `vscode.cli.parseJson` failed span。
- 批量文档任务中每个任务都有独立 child span。
- `vectahub trace show <traceId> --json` 可以读取并返回该 trace 的 spans。
- 不记录 secrets、完整 env、完整 Agent 输出。

## 14. 测试计划

必须运行：

```text
npm test -- src/infrastructure/trace/tracer.test.ts --run
npm test -- src/commands/run-task.test.ts --run
npm test -- src/infrastructure/logger/json-mode.test.ts --run
npm run typecheck
npm run compile -w packages/vectahub-vscode-extension
npx vitest run test/trace.test.ts
```

如果扩展 lint 仍存在历史问题，不要混入无关修复；在最终说明中明确当前阻塞文件和错误。

## 15. 实施顺序

### 阶段 1：CLI Trace Core

实现 CLI 侧 trace 类型、上下文、writer、tracer 和测试。

完成标准：

- 能创建 span。
- 能写 JSONL。
- `withSpan` 成功和失败都有记录。
- 写入失败不会抛出到业务层。

### 阶段 2：CLI 命令接入

接入 `run-task` 和 `trace` 命令。

完成标准：

- `run-task` 有关键步骤 span。
- `trace list` 和 `trace show` 可用。
- `--json` 输出不被 trace 污染。

### 阶段 3：插件侧接入

实现插件 trace 模块并接入 `runCli`。

完成标准：

- 插件能创建 root span。
- CLI 子进程收到 trace env。
- 插件 JSON 解析失败有 trace。

### 阶段 4：文档任务链路

接入 `runDocTasks` 单任务和批量任务。

完成标准：

- 批量任务 trace 能看到每个 task 的 span。
- 单个任务失败能定位到 CLI 或插件阶段。

## 16. 禁止事项

- 不要把 trace 写到 stdout。
- 不要在 trace 中记录 API key、token、完整 env。
- 不要新增第三方依赖。
- 不要重构无关模块。
- 不要修改数据库或引入 schema 迁移。
- 不要改变现有 CLI JSON 响应字段语义。
- 不要把所有函数都自动埋点；只埋关键边界。

## 17. 给执行 Agent 的注意事项

- 先读现有 `src/infrastructure/trace-audit/` 和 `src/infrastructure/logger/`，复用路径和写入风格，但不要把 trace-audit 大改成新系统。
- 优先小步提交，先让 CLI trace 独立跑通。
- 如果发现 `out/` 编译产物被仓库跟踪，运行扩展编译并把对应产物一起提交。
- 如果遇到历史 lint 错误，只报告，不要顺手修无关文件。
- 最终回复必须列出改动文件、验证命令、未解决风险。

---

## 18. 执行结果（已完成）

状态：**已完成**

### 18.1 实际改动文件

CLI 侧新增：

- `src/infrastructure/trace/types.ts`
- `src/infrastructure/trace/context.ts`
- `src/infrastructure/trace/writer.ts`
- `src/infrastructure/trace/tracer.ts`
- `src/infrastructure/trace/index.ts`
- `src/infrastructure/trace/tracer.test.ts`
- `src/commands/trace.ts`

CLI 侧修改：

- `src/commands/run-task.ts`
- `src/commands/index.ts`
- `src/cli.ts`

VS Code 插件侧新增：

- `packages/vectahub-vscode-extension/src/trace/types.ts`
- `packages/vectahub-vscode-extension/src/trace/context.ts`
- `packages/vectahub-vscode-extension/src/trace/writer.ts`
- `packages/vectahub-vscode-extension/src/trace/tracer.ts`
- `packages/vectahub-vscode-extension/src/trace/index.ts`
- `packages/vectahub-vscode-extension/test/trace.test.ts`

VS Code 插件侧修改：

- `packages/vectahub-vscode-extension/src/cli/adapter.ts`
- `packages/vectahub-vscode-extension/src/cli/types.ts`
- `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts`

编译产物同步：

- `packages/vectahub-vscode-extension/out/**`（包含 `out/trace/**` 及受影响模块）

### 18.2 功能完成情况

- CLI Trace Core 已实现，支持 root/child span、失败记录、JSONL 落盘。
- 插件调用 CLI 时已传递 `VECTAHUB_TRACE_ID` / `VECTAHUB_PARENT_SPAN_ID` / `VECTAHUB_TRACE_SOURCE`。
- `run-task` 关键步骤已按规范埋点，含耗时与核心 attributes。
- 插件 `runCli` 已覆盖 `vscode.cli.spawn` / `vscode.cli.parseJson` / `vscode.cli.cancel` / `vscode.cli.spawnError`。
- 文档任务单任务与批量执行已接入 trace span。
- `vectahub trace list` 与 `vectahub trace show <traceId>` 已实现（含 `--json`）。
- trace 不写 stdout，不影响现有 CLI JSON 输出协议。

### 18.3 验证结果

已执行并通过：

- `npm test -- src/infrastructure/trace/tracer.test.ts --run`
- `npm test -- src/commands/run-task.test.ts --run`
- `npm test -- src/infrastructure/logger/json-mode.test.ts --run`
- `npm run typecheck`
- `npm run compile -w packages/vectahub-vscode-extension`
- `npx vitest run test/trace.test.ts`

### 18.4 风险与说明

- 本次未处理无关历史改动或无关文件问题，仅完成本任务范围内改动。
- trace 写入失败按设计静默，不影响主流程。

### 18.5 后续优化（P1）

- `trace list/show` 当前已改为流式逐行读取，并新增 `trace list --limit` 控制返回量。
- 后续可继续增强：
  - `trace show <traceId>` 增加可配置扫描天数与更激进的早停策略。
  - 针对超大 trace 文件增加单文件扫描上限和分页参数。
