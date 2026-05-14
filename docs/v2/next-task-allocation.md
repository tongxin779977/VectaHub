# VectaHub 下一步任务分配（基于 2026-05-13 代码现状）

## 1. 目标

本文件用于把 `docs/v2/agent-execution-roadmap.md` 中的阶段目标，转换为可执行的下一步任务分配。

约束：
- 仅基于当前仓库代码现状判断优先级。
- 区分“已完成第一版”与“已稳定完成”。
- 优先安排能减少架构漂移、重复实现和错误归因的问题。

## 2. 当前阶段判断

截至当前代码状态：

- P0 可观测性基线：已完成第一版，仍需 hardening。
- P1 文档任务状态机：已完成，可作为稳定基线。
- P2 Agent Worker 化：已完成第一版，存在规则双份实现问题。
- P3 验证闭环：已完成第一版。
- P4 安全与权限闭环：已完成第一版。
- P5 性能与资源控制：已完成第一版，不应再视为“未开始”。
- P6 自愈与恢复：主链路第一版已成型，仍需收紧 authoritative hash/digest 来源和文档/测试基线。
- P7 插件可视化体验：已有基础状态展示，但未形成时间线和自助诊断入口。

结论：

下一步不应继续把重点放在“补做 P5 功能”，而应转向：
- P6 设计收口与主链路接入。
- P2/P5 的单一事实源与性能 hardening。
- P4 与 P5 的状态文档校准和回归基线补齐。

## 3. 优先级总览

### Priority A

1. P6 authoritative hash/digest 来源收敛。
2. P2 合同推导单一事实源收敛。
3. P5 性能 hardening 与基准补齐。

### Priority B

1. P4 安全闭环 hardening。
2. P5.5 工作区隔离层设计。

### Priority C

1. P7 插件可视化体验。

## 4. 任务分配

### A1. P6 authoritative hash/digest 来源收敛

目标：
- 为恢复 hash guard 和状态刷新 drift 检测提供与 CLI 等价的 authoritative hash/digest 来源。
- 保留当前安全降级：在 authoritative digest unavailable 时，恢复保守阻断，状态刷新不做 drift reset。

代码依据：
- `src/commands/run-task.ts`
- `src/commands/agent-task-contract.ts`
- `packages/vectahub-vscode-extension/src/commands/docTaskRunHelpers.ts`
- `packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts`
- `packages/vectahub-vscode-extension/src/project/docTaskContract.ts`

当前已完成：
- run record 持久化优先使用 CLI 返回的 `agentTaskContract.instructionHash`。
- 恢复记录优先使用 currentHash，缺失时继承 latest run record 的 `instructionHash`。
- 插件侧 guessed `globalConfigDigest` 不再参与权威 hash 判断。

当前问题：
- authoritative `globalConfigDigest` 仍 unavailable，插件侧 drift 检测会保守停用。
- 恢复链路在 currentHash unavailable 时会保守阻断，安全但增加人工路径。
- 插件和 CLI 仍有两套合同推导实现，长期存在漂移风险。

子任务：
- 设计 authoritative digest/hash 获取方式：CLI contract-preview、共享合同纯函数或中间合同文件。
- 明确插件侧何时可以重新启用 drift reset。
- 明确恢复 hash guard 的 unavailable 用户提示和重跑路径。
- 补充回归测试，覆盖 authoritative digest available/unavailable 两类路径。

验收标准：
- 插件不再需要 guessed digest 参与权威判断。
- authoritative digest/hash available 时可以安全执行 drift 检测。
- authoritative digest/hash unavailable 时仍保持安全降级。

### A2. P2 合同推导单一事实源收敛

目标：
- 消除 CLI 与插件端两套边界推导规则长期漂移的风险。

代码依据：
- `src/commands/agent-task-contract.ts`
- `packages/vectahub-vscode-extension/src/project/docTaskContract.ts`

当前问题：
- 两端都在独立实现 doc excerpt、路径提取、validation command 推导和 instruction hash 因子处理。
- 当前规则虽然接近，但并非同一来源，未来修改极易漂移。
- 当前 P3 安全降级避免了 guessed digest 误判，但没有解决权威合同来源缺失。

子任务：
- 输出一份收敛设计，决定是共享纯函数、共享预览 JSON，还是生成中间合同文件。
- 明确跨进程复用策略，减少插件预检和 CLI 执行的重复读取。
- 定义回归测试矩阵，覆盖 excerpt strategy、allowedFiles、validationCommands、instructionHash。

建议责任域：
- CLI/合同核心
- 插件批量执行
- 回归测试

验收标准：
- 后续实现后，合同推导规则只有一个权威来源。
- 插件端不再需要长期维护一份“近似 CLI 的副本逻辑”。

### A3. P5 性能 hardening 与基准补齐

目标：
- 把“已完成第一版”推进到“有实测基线的稳定阶段”。

代码依据：
- `src/cli.ts`
- `src/cli-bootstrap.ts`
- `src/commands/run-task.ts`
- `packages/vectahub-vscode-extension/src/project/docTaskDocIndex.ts`
- `packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts`
- `src/commands/trace.ts`

当前已完成：
- 文档索引复用。
- 输出截断与 Token 审计。
- trace 流式读取。
- latest 写队列。
- CLI 启动链路初步拆分。

剩余问题：
- `DocTaskDocIndex` 仍保留完整文档内容。
- 插件侧仍存在多处全量读取文档路径，和 no-full-read/低内存目标未完全收口。
- 当前 no-full-read 仍是 hardening gap，不能视为 P2/P5 完整闭环。
- 写队列不等于批量 flush。
- 冷启动性能预算没有实测。
- 顶级作用域零副作用约束尚未完全满足。

子任务：
- 补充性能基准文档与测量命令。
- 明确 `DocTaskDocIndex` 是否要改为仅保存 heading + offset。
- 设计 `DocTaskRunStore` 批量 flush 策略。
- 收紧 CLI 启动链路的副作用边界。

验收标准：
- 路线图和 P5 spec 中的预算项都有可执行测量方法。
- 能明确区分“当前已达成预算”和“尚未验证预算”。

### B1. P4 安全闭环 hardening

目标：
- 把当前已落地的风险评估、确认拦截、脱敏处理补齐为可验证基线。

代码依据：
- `src/security-protocol/engine.ts`
- `src/security-protocol/redactor.ts`
- `src/commands/run-task.ts`
- `packages/vectahub-vscode-extension/src/security/riskUI.ts`

当前已完成：
- 风险评级。
- 高风险二次确认。
- 流式脱敏。
- Agent preflight。

剩余问题：
- 仍缺少“CLI 与插件结果完全一致”的回归定义。
- 一些规则在插件侧仍有局部补充判断，不是纯单源。
- 当前文档对“已完成范围”和“待 hardening 范围”区分不够清楚。

子任务：
- 明确统一风险判定边界。
- 补充脱敏覆盖范围与误杀容忍策略。
- 输出安全回归清单。

### B2. P5.5 工作区隔离层设计

目标：
- 为未来并发任务的 Git diff 归因问题提供结构化隔离方案。

当前判断：
- 这是 P2 hardening 的自然延伸，但不是当前第一优先级。
- 在 P2 单一事实源和 P5 实测基线没收口前，不建议直接进入实现。

子任务：
- 补充 worktree 生命周期、清理策略、失败回收策略。
- 明确与批量任务并发调度的接口边界。

### C1. P7 插件可视化体验

目标：
- 在现有任务状态基础上增加 trace 和恢复入口，而不是直接做复杂 UI。

当前判断：
- 现有插件已有任务列表、状态摘要和运行记录能力。
- 应等待 P6 恢复模型明确后，再决定 UI 入口和操作语义。

子任务：
- 定义 trace detail 打开方式。
- 定义“一键重试失败任务”和“一键运行验证”的前置条件。
- 控制 UI 只展示摘要，不加载大日志。

## 5. 推荐执行顺序

```text
第一步：补 P6 自愈与恢复规格
第二步：收敛 P2 合同推导单一事实源
第三步：完成 P5 hardening 与性能基准
第四步：补 P4 hardening 回归定义
第五步：设计 P5.5 工作区隔离层
第六步：推进 P7 插件可视化体验
```

## 6. 不建议立即投入的方向

- 不建议把 P5 继续当成“未完成阶段”整体推进，因为其核心功能已经在代码中落地。
- 不建议在 P6 规格未收口前直接做 P7 复杂 UI，否则会把恢复操作语义固化错位。
- 不建议在 P2 合同推导仍双份实现时直接强化并发执行，否则会放大边界漂移和 diff 归因问题。

## 7. 文档同步建议

本轮之后建议同步维护以下文档状态一致性：

- `docs/v2/agent-execution-roadmap.md`
- `docs/v2/performance-resource-budget-spec.md`
- `docs/v2/security-permission-loop-spec.md`
- `docs/v2/self-healing-recovery-spec.md`（新增）
