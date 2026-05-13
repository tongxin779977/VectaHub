# Self-Healing & Recovery Spec (P6)

## 0. 开发入口

本文件不是概念文档，而是 **P6 可直接开发的执行规格**。

如果你是实现该阶段的 Agent，先按以下顺序阅读：

1. 本文档：确定 P6 目标、边界、恢复决策模型、模块职责。
2. `docs/v2/doc-task-state-machine-spec.md`：看任务状态、失败分类、运行记录结构。
3. `docs/v2/task-verification-loop-spec.md`：看验证结果如何产生、`failed_test` 如何进入状态机。
4. `docs/v2/security-permission-loop-spec.md`：看什么修复动作必须拦截、确认、脱敏。
5. `docs/v2/agent-worker-contract-spec.md`：看任务边界、允许修改范围、验证命令来源。
6. `docs/v2/trace-execution-spec.md`：看新恢复 trace 如何关联原始 trace。
7. `docs/v2/performance-resource-budget-spec.md`：看 P6 不能破坏的性能边界。

开发时遇到问题，按下面索引处理：

- 不知道失败后状态该怎么写：看 `doc-task-state-machine-spec.md`
- 不知道验证失败该怎么分类：看 `task-verification-loop-spec.md`
- 不知道修复命令能不能自动执行：看 `security-permission-loop-spec.md`
- 不知道恢复 trace 怎么关联原 trace：看 `trace-execution-spec.md` 和本文第 6 节
- 不知道能不能修改任务边界外的文件：看 `agent-worker-contract-spec.md`
- 不知道哪些实现方式会超预算：看 `performance-resource-budget-spec.md`

## 1. 用户目标和禁止事项

目标：在文档任务失败后，由 VectaHub 产生**结构化恢复建议**，并在明确边界下支持重试、恢复或人工确认后的修复执行，而不是只显示失败日志。

禁止事项：

- 不允许把 P6 做成“失败后自动让 Agent 再试一次”的黑箱循环。
- 不允许在未评估风险的情况下自动执行修复命令。
- 不允许把完整 stdout/stderr、完整 env、secret、完整 prompt 写入 JSON、trace 或 task run record。
- 不允许把 workflow 通用恢复能力和 doc-task 恢复链路混成一个实现。
- 不允许在 P6 第一版直接引入 worktree 隔离、自动 code review、自动 merge。

## 2. 当前链路事实

当前文档任务主链路：

```text
插件 runDocTask/runAllDocTasks
-> CLI run-task
-> Agent CLI
-> collect git diff
-> verification
-> JSON 返回 output/gitChanges/verification/agentTaskContract
-> 插件更新 task run record
```

当前代码已存在但尚未接入主链路的能力：

- workflow/execution 层已有 `rerun` / `resume`。
- 存在独立的 `src/commands/self-healing.ts` 原型。
- 已有智能诊断模块 `src/skills/ai-modules/intelligent-diagnosis/`。
- 文档任务运行记录已保存：
  - `failureKind`
  - `traceId`
  - `gitChanges`
  - `verification`
  - `retryOfRunId`

当前缺口：

- 文档任务失败后没有统一的恢复决策结构。
- 插件端没有“建议重试 / 建议人工确认 / 禁止自动修复”的稳定分流。
- 原始失败 trace 与恢复 trace 没有正式关联合同。
- `self-healing` 原型仍是 workflow 视角，不是 doc-task 视角。

## 3. 根因分析

当前失败后的核心问题不是“看不到日志”，而是**系统没有把失败解释成可执行恢复动作**：

- `failed_config`、`failed_agent`、`failed_test`、`failed_conflict` 的恢复路径完全不同，但当前主链路没有显式模型。
- 插件虽然能展示失败状态，但不知道该给用户展示“重试”、“修复后再跑”还是“必须人工处理”。
- `self-healing` 原型会直接走诊断和命令建议，但没有接入文档任务边界、安全确认和 trace 关联。
- 没有统一数据合同，后续一旦做 P7，可视化层会被迫读取杂乱字段拼业务逻辑。

## 4. In Scope / Out of Scope

In Scope：

- 定义文档任务失败后的恢复决策模型。
- 定义 doc-task 场景的恢复输入、输出、状态迁移和 trace 关联合同。
- 定义插件端恢复入口、CLI 执行入口和运行记录回写规则。
- 定义“自动重试 / 人工确认 / 禁止自动修复”的判定矩阵。
- 定义 P6 第一版与现有 `self-healing` 原型的复用边界。
- 补充实施步骤、文件职责和测试计划。

Out of Scope：

- 不实现完整 UI 时间线。
- 不在 P6 第一版做 worktree 隔离。
- 不做跨任务自动合并修复方案。
- 不允许恢复流程绕过现有 P4 风险评估和 P2 文件边界。
- 不让 LLM 直接决定系统最终状态。
- 不将 workflow engine 的通用恢复协议改造成 doc-task 专属协议。

## 5. 设计原则

### 5.1 Orchestrator First

Agent 只负责给出诊断建议或执行边界内的修复任务。  
恢复状态、失败分类、trace 关联、风险拦截、最终成功判定，必须由 VectaHub 自己记录。

### 5.2 先分流，再执行

P6 第一版必须先做**恢复决策**，再决定是否真正执行恢复动作。  
严禁先执行、后补分类。

### 5.3 复用现有真相源

以下字段是 P6 的真实输入来源：

- `DocTaskRunRecord.status`
- `DocTaskRunRecord.failureKind`
- `DocTaskRunRecord.gitChanges`
- `DocTaskRunRecord.verification`
- `traceId`
- `AgentTaskContractSummary`

P6 不得重新从终端文案猜测这些信息。

### 5.4 边界不能放宽

恢复动作仍受以下约束：

- P2 文件边界
- P3 验证命令边界
- P4 风险评估和人工确认
- P5 性能预算

恢复不是越权通道。

## 6. 数据合同

### 6.1 恢复输入

建议新增共享语义，优先放在插件侧 project model，并在 CLI 侧保持兼容类型：

```ts
export interface DocTaskRecoveryInput {
  runId: string;
  taskId: string;
  taskLabel: string;
  docPath?: string;
  traceId?: string;
  failureKind: DocTaskFailureKind;
  status: DocTaskRunStatus;
  command?: string;
  errorMessage?: string;
  outputSummary?: string;
  gitChanges?: {
    changedFileCount: number;
    changedFiles: string[];
    shortStat?: string;
  };
  verification?: {
    ok: boolean;
    totalCommands: number;
    passedCommands: number;
    failedCommands: number;
    failedCommandSummary?: string;
  };
  agentTaskContract?: {
    boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
    allowedFileCount: number;
    forbiddenFileCount: number;
    validationCommandCount: number;
    executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  };
}
```

来源要求：

- 该结构必须由运行记录和 CLI JSON 摘要构造。
- 严禁直接把完整原始输出、完整 trace spans 或完整文档片段放入恢复输入。

### 6.2 恢复决策

```ts
export type RecoveryDecisionKind =
  | 'retry_direct'
  | 'rerun_task'
  | 'resume_after_manual_fix'
  | 'suggest_fix'
  | 'blocked';

export type RecoveryDecisionMode =
  | 'auto'
  | 'confirm_required'
  | 'manual_only';

export interface RecoveryDecision {
  kind: RecoveryDecisionKind;
  mode: RecoveryDecisionMode;
  reason: string;
  summary: string;
  suggestedActions: string[];
  needsNewTrace: boolean;
  canReusePreviousCommand: boolean;
}
```

语义要求：

- `kind` 表示系统建议采取的恢复路径。
- `mode` 表示该路径是否能自动执行。
- `summary` 用于插件和 CLI 直接展示，不依赖额外文本拼装。
- `suggestedActions` 只允许是摘要提示，不是任意可执行命令列表。

### 6.3 恢复执行记录

```ts
export interface DocTaskRecoveryRecord {
  recoveryRunId: string;
  sourceRunId: string;
  taskId: string;
  decision: RecoveryDecision;
  sourceTraceId?: string;
  recoveryTraceId?: string;
  status: 'planned' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  retryOfRunId?: string;
}
```

要求：

- `sourceRunId` 关联原始失败运行。
- `recoveryTraceId` 是新的恢复链路 trace。
- `retryOfRunId` 用于回写到新的 `DocTaskRunRecord`。

### 6.4 Trace 关联合同

恢复链路必须开启**新 trace**，并记录以下关联属性：

```ts
attributes: {
  recovery: true,
  recoveryKind: RecoveryDecisionKind,
  sourceRunId: string,
  sourceTraceId?: string,
  sourceFailureKind: DocTaskFailureKind,
}
```

要求：

- 原始失败 trace 不可被覆盖或续写为恢复 trace。
- 恢复动作必须开启新根 span。
- trace 查询时，必须能从恢复记录跳回原始失败记录。

## 7. 恢复决策矩阵

P6 第一版必须使用确定性规则先分流，再决定是否触发 Agent 诊断。

### 7.1 直接阻断类

```text
failureKind = config
-> decision.kind = blocked
-> mode = manual_only
-> summary = 先修复环境或配置，再重新执行任务
```

原因：
- 这类问题通常不是代码修复问题，而是环境、权限、模型、CLI 可用性问题。

### 7.2 可直接重试类

```text
failureKind = timeout
且 gitChanges.changedFileCount = 0
且 verification 缺失
-> decision.kind = retry_direct
-> mode = confirm_required
```

```text
failureKind = json_protocol
且 Agent 已执行成功迹象不足
且 gitChanges.changedFileCount = 0
-> decision.kind = retry_direct
-> mode = confirm_required
```

原因：
- 更可能是偶发执行失败、协议抖动或超时，不应立即进入修复任务。

### 7.3 可建议修复类

```text
failureKind = test
-> decision.kind = suggest_fix
-> mode = confirm_required
```

```text
failureKind = agent
且存在 gitChanges
-> decision.kind = suggest_fix
-> mode = confirm_required
```

原因：
- 已经发生代码变更，优先基于失败上下文生成“修复任务”，而不是盲重试。

### 7.4 必须人工处理类

```text
failureKind = conflict
-> decision.kind = blocked
-> mode = manual_only
```

```text
failureKind = system_internal
-> decision.kind = blocked
-> mode = manual_only
```

原因：
- 冲突和系统性错误需要先人工排除状态污染或运行环境问题。

### 7.5 文档变更失效类

如果当前任务 `instructionHash` 已变化：

```text
-> decision.kind = blocked
-> mode = manual_only
-> reason = instruction-changed
```

原因：
- 旧失败记录已经不再对应当前任务定义，禁止基于过期上下文恢复。

## 8. 生命周期合同

### 8.1 主链路

```text
task failed
-> build DocTaskRecoveryInput
-> deterministic recovery decision
-> if blocked:
     write recovery summary only
     stop
-> if retry_direct:
     require user confirmation
     start new recovery trace
     rerun original task command
-> if suggest_fix:
     require user confirmation
     start new recovery trace
     build bounded fix task
     run fix task
     run verification
-> write new run record / recovery record
-> update display status
```

### 8.2 状态迁移

P6 第一版不强制新增 `DocTaskRunStatus`，优先复用现有运行状态和单独的 recovery record。

推荐恢复记录状态：

```text
planned
running
success
failed
cancelled
blocked
```

主任务状态处理规则：

- 原始失败任务保持原失败状态，不被覆盖。
- 新恢复执行产生新的 run record。
- 若恢复成功，新 run record 进入 `success` 或 `changed`。
- 若恢复失败，新 run record 根据真实失败再次分类。

## 9. 模块职责分配

### 9.1 插件侧职责

建议修改或新增：

```text
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts
packages/vectahub-vscode-extension/src/project/docTaskState.ts
packages/vectahub-vscode-extension/src/project/docTaskRecovery.ts   (新)
packages/vectahub-vscode-extension/src/commands/recoverDocTask.ts   (新)
```

插件侧负责：

- 从失败运行记录构造 `DocTaskRecoveryInput`
- 做确定性恢复分流
- 弹出确认框
- 调用 CLI 恢复入口
- 写 recovery record
- 更新任务展示状态和最近恢复摘要

### 9.2 CLI 侧职责

建议修改或新增：

```text
src/commands/run-task.ts
src/commands/self-healing.ts
src/commands/recover-task.ts           (新，推荐)
src/skills/ai-modules/intelligent-diagnosis/
```

CLI 侧负责：

- 接收恢复输入摘要
- 开启新的 recovery trace
- 在边界内执行 retry 或 fix task
- 运行验证
- 返回恢复 JSON 摘要

### 9.3 不应由 Agent 负责的事情

以下行为禁止交给 Agent 决定：

- 最终状态写入
- 失败分类
- 是否需要人工确认
- 是否允许越界改文件
- 是否允许自动执行高风险修复命令

## 10. Agent 如何直接开发

如果后续 Agent 根据本文档直接实现，必须按下面顺序推进：

1. 先实现 `DocTaskRecoveryInput` 和 `RecoveryDecision` 纯类型。
2. 再实现确定性分流纯函数，不接 LLM。
3. 在插件端接恢复入口和 recovery record。
4. 在 CLI 端接 `recover-task` 入口，优先做 `retry_direct`。
5. 再把 `suggest_fix` 接到受边界约束的修复任务。
6. 最后补 trace 关联、验证、回归测试。

禁止反向顺序：

- 不能先接 LLM 诊断，再补决策模型。
- 不能先做 UI，再补恢复数据合同。
- 不能先让 Agent 自动修复，再补安全确认。

## 11. 与其他文档的边界关系

### 11.1 看本文档即可决定的内容

- 失败后怎么分流
- 哪些情况可以重试
- 哪些情况必须人工确认
- 恢复记录怎么建
- 新 trace 如何关联旧 trace

### 11.2 必须跳转其他文档确认的内容

- 任务状态字段定义：`doc-task-state-machine-spec.md`
- 验证字段与失败测试语义：`task-verification-loop-spec.md`
- 风险确认和脱敏：`security-permission-loop-spec.md`
- 任务文件边界与合同：`agent-worker-contract-spec.md`
- trace 字段与查询约定：`trace-execution-spec.md`
- 冷启动、IO、内存预算：`performance-resource-budget-spec.md`

## 12. 安全与隐私边界

- 恢复输入只允许使用摘要字段。
- 任何修复命令都必须再次走风险评估。
- `suggest_fix` 场景下，Agent 只能拿到当前任务的合同边界和失败摘要。
- 不允许把完整失败日志作为 prompt 全量传递。
- 不允许在恢复记录中保存明文 secret、用户 home 全路径或未脱敏输出。

## 13. 性能与内存预算

- 恢复决策纯函数单次判定目标 < 2ms。
- 恢复输入摘要序列化大小目标 <= 4KB。
- recovery record 单条目标 <= 8KB。
- 不允许为每次恢复重新加载整份文档；优先复用现有任务边界摘要。
- 诊断输入必须截断，避免把完整失败输出送入 LLM。

## 14. 兼容和降级策略

- P6 第一版新增字段必须是可选字段。
- 老插件没有恢复入口时，仍可只展示失败状态。
- 当恢复分流器自身异常时，默认退化为：

```text
decision.kind = blocked
mode = manual_only
```

- 当诊断模块不可用时：
  - `retry_direct` 仍可执行
  - `suggest_fix` 降级为只展示人工处理建议

## 15. 文件修改清单

推荐新增：

```text
docs/v2/self-healing-recovery-spec.md
src/commands/recover-task.ts
packages/vectahub-vscode-extension/src/project/docTaskRecovery.ts
packages/vectahub-vscode-extension/src/commands/recoverDocTask.ts
```

推荐修改：

```text
src/commands/run-task.ts
src/commands/self-healing.ts
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts
packages/vectahub-vscode-extension/src/project/docTaskState.ts
```

## 16. 实施步骤

1. 定义 recovery 输入、决策、记录类型。
2. 在插件侧实现确定性恢复分流器。
3. 为失败任务增加“恢复建议”摘要生成。
4. 新增 CLI `recover-task` 入口，先支持 `retry_direct`。
5. 接入新的 recovery trace，并关联 `sourceTraceId`。
6. 将恢复执行结果写回新的 run record 和 recovery record。
7. 在 `suggest_fix` 场景中接入受边界约束的诊断与修复。
8. 补充 CLI、插件、trace 和状态机测试。

## 17. 测试计划

必须覆盖：

```text
1. failed_config -> blocked/manual_only
2. failed_timeout + 无 gitChanges -> retry_direct
3. failed_test -> suggest_fix
4. failed_conflict -> blocked
5. instructionHash 变化 -> blocked
6. recovery trace 正确关联 sourceTraceId
7. 恢复成功后生成新的 run record，而不是覆盖旧记录
8. 恢复失败后重新分类，不沿用旧 failureKind
9. 恢复输入和记录不包含完整 stdout/stderr
10. 高风险修复动作必须人工确认
```

建议运行：

```text
npm test -- src/commands/run-task.test.ts --run
npm test -- src/commands/trace.test.ts --run
npm test --workspace packages/vectahub-vscode-extension
npm run typecheck
npm run compile -w packages/vectahub-vscode-extension
```

## 18. 验收标准

- 任何文档任务失败后，系统都能给出明确恢复决策，而不是只显示失败。
- 用户能区分“直接重试”、“建议修复”、“必须人工处理”三类恢复路径。
- 恢复动作产生新的 trace，并能关联原始失败 trace。
- 恢复执行不会覆盖原始失败记录。
- 恢复链路不绕过 P2/P3/P4 的既有边界。

## 19. Hardening Backlog

- 支持 recovery trace 在插件中可视化串联展示。
- 支持根据失败命令类型选择不同诊断模板。
- 支持 worktree 隔离下的安全修复执行。
- 支持恢复建议去重和批量失败聚合。
- 支持恢复输入落盘后的长期分析报表。
