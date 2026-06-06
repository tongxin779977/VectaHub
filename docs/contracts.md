# 核心合同

本文档保留为根级合同入口兼容页。新的合同索引见 [docs/contracts/README.md](./contracts/)。

> Document Status: Current Implementation / Migration Contract
> Authority: Contract index only. Field-level behavior is owned by the linked contract files.
> Traceability: See `docs/contracts/implementation-traceability.md` before treating a cross-module target as implemented.
> Recommended Usage: Read this after [Capability Reference](./capabilities-reference.md) when you need protocol, storage, recovery, or JSON contract detail.

## 合同边界

VectaHub 的关键合同如下：

| 合同 | 目标 | 详细规格 |
|------|------|----------|
| CLI JSON | 让插件、脚本和未来 SDK 不解析人类日志。 | [插件/CLI 边界设计](./design/plugin-cli-boundary.md) |
| Orchestration Plan | 约束自然语言编排输出、计划状态、安全审查和验证计划。 | [编排计划合同](./contracts/orchestration-plan.md) |
| Workflow Draft | 约束计划到可审查 workflow 的生命周期、确认、snapshot/hash 和执行前阻断。 | [Workflow Draft 合同](./contracts/workflow-draft.md) |
| Doc Task Run | 记录文档任务运行状态、失败分类和恢复信息。 | [文档任务状态机规格](./contracts/doc-task-state-machine.md) |
| Agent Task Contract | 限制 Agent 输入、修改范围和验证命令。 | [Agent Worker 合同规格](./contracts/agent-worker-contract.md) |
| Trace | 贯通插件、CLI、Agent、验证和恢复链路。 | [Trace 执行规格](./contracts/trace-execution.md) |
| Security | 统一风险评估、确认拦截和脱敏。 | [安全与权限闭环规格](./contracts/security-permission-loop.md) |
| Recovery | 对失败分类、需求变更和恢复路径建立合同。 | [恢复闭环规格](./contracts/recovery-loop.md) |
| Workflow Lifecycle | 管理工作流执行、历史、详情、重跑、恢复和归档。 | [工作流生命周期规格](./contracts/workflow-lifecycle.md) |
| Storage | 约束配置、执行记录、输出、trace、队列等落点。 | [配置与数据存储规格](./contracts/config-data-storage.md) |
| Tools / Security Rules | 管理 CLI 工具、命令规则和安全规则。 | [工具与安全规则规格](./contracts/tools-security-management.md) |
| Implementation Traceability | 关联目标能力、权威文档、代码入口、测试入口和已知缺口。 | [实现追踪矩阵](./contracts/implementation-traceability.md) |

已降级的 service、daemon、template、schedule、monitor、debug 等能力不再保留独立合同文档。后续若重新进入主线，必须先补充 `docs/contracts/` 下的权威合同和实现追踪矩阵。

## CLI JSON 合同

机器调用命令必须返回稳定 JSON。通用形态：

```ts
interface CLIResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  diagnostics?: DiagnosticMessage[];
  metadata: {
    version: string;
    command: string;
    cwd: string;
    vectahubHome?: string;
    durationMs: number;
  };
}
```

要求：

- `--json` stdout 必须保持纯 JSON。
- trace、debug、人类日志不能混入 JSON stdout。
- 大输出必须通过引用或摘要传递，不能直接塞入协议。
- 错误必须有稳定 `code`，不能只返回自由文本。

## Agent Task Contract

Agent 任务必须被收敛为小合同：

```ts
interface AgentTaskContract {
  taskId: string;
  label: string;
  instructionHash: string;
  docPath?: string;
  docExcerpt?: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  timeoutMs: number;
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  notes?: string[];
}
```

禁止进入合同：

- API key、token、password、private key。
- 完整环境变量。
- 完整 stdout/stderr。
- 完整 trace。
- 完整 git diff。
- 超大文档全文。

## Instruction Hash

`instructionHash` 用于判断任务需求是否变化。当前共享合同包 `@vectahub/doc-task-contract-core` 已提供 `computeInstructionHash`、`buildGlobalConfigDigest`、文档片段提取、文件边界归一化、验证命令推导和并发判定等纯函数，是合同收敛的权威方向。

当前已知 hardening 目标：

- CLI 与插件端合同推导必须继续收敛到共享包或 CLI 结构化预览，避免长期双份规则。
- authoritative digest/hash unavailable 时必须保守降级。
- 不得用 guessed digest 触发状态 reset 或恢复判断。

## Doc Task Run 状态

文档任务运行状态至少覆盖：

```text
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
failed_system_internal
cancelled
needs_confirmation
```

插件展示状态可以更粗，但持久化记录必须保留足够信息支持失败分类、trace 定位和恢复。

## Trace 合同

Trace 必须能回答：

- 用户触发了什么任务。
- 插件调用了哪个 CLI 命令。
- CLI 哪个阶段失败。
- Agent 是否执行成功。
- 验证命令是否运行、是否失败。
- 恢复链路是否因 hash、权限或冲突被阻断。

要求：

- trace 写入失败不能破坏主流程。
- trace 不能污染 JSON stdout。
- trace 和运行记录不得保存明文敏感信息。

## Security 合同

所有 Agent 生成命令和验证命令都必须经过风险评估。

```ts
type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

interface CommandRiskAssessment {
  level: RiskLevel;
  ruleName?: string;
  reason?: string;
  suggestion?: string;
  needsConfirmation: boolean;
}
```

要求：

- `high` 及以上需要用户确认。
- `critical` 默认阻断。
- 安全引擎不可用时进入保守模式。
- 敏感输出必须在写文件、写 trace、写摘要前脱敏。

## Verification 合同

Agent 成功不等于任务成功。任务完成后必须执行合同中的验证命令，验证结果进入 task run record。

详细规格见 [任务验证闭环规格](./contracts/verification-loop.md)。

## Performance 合同

文档任务执行路径必须避免无意义全量读取、重复解析和大对象常驻。

详细规格见 [性能与资源预算规格](./contracts/performance-budget.md)。

## CLI 命令合同

CLI 命令面以 [CLI 命令面规格](./contracts/cli-command-surface.md) 为索引。命令实现新增或删除时，必须同步更新该索引，特别是：

- 是否支持 `--json`。
- 是否会写入 `VECTAHUB_HOME`。
- 是否触发审计、trace、执行记录或队列变更。
- 是否需要用户确认或安全评估。
