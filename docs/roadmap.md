# 路线图

## 当前方向

VectaHub 的近期目标不是继续堆叠新 Agent 能力，而是把已有执行链路收敛成可靠控制面：

- 合同只有一个权威来源。
- 状态由 VectaHub 掌控。
- trace 能定位失败。
- 验证能证明完成。
- 恢复能安全判断是否继续。
- 插件不复制 CLI 业务规则。

## 优先级

### Priority A

| 任务 | 目标 |
|------|------|
| P6 authoritative hash/digest 来源收敛 | 已完成 A1：共享纯函数单一事实源落地，authoritative digest unavailable 保守降级不变。 |
| P2 合同推导单一事实源 | 已完成 A2：CLI 和插件消费 `@vectahub/doc-task-contract-core`，公开 JSON 协议不变。 |
| P5 性能 hardening 与基准补齐 | 用实测基线证明低内存、低 IO 和启动预算。 |

### Priority B

| 任务 | 目标 |
|------|------|
| P4 安全闭环 hardening | 统一 CLI 与插件安全判断，补齐回归基线。 |
| P5.5 工作区隔离层设计 | 为未来并发任务提供 git diff 归因和清理策略。 |

### Priority C

| 任务 | 目标 |
|------|------|
| P7 插件可视化体验 | 在恢复语义稳定后提供 trace、重试、验证等入口。 |

## 文档优先级

- 设计文档必须解释方案和取舍，不记录执行流水账。
- 规格文档必须定义字段、状态、边界和验收，不写产品口号。
- 跨模块能力必须先进入 `docs/contracts/implementation-traceability.md`，明确 `Current Implementation`、`Target Design` 或 `Migration Contract`。
- UI 文档必须基于 VS Code 插件当前视图、命令和配置；未实现能力必须标注为设计目标。
- 旧 V1/V2 阶段材料不再作为事实来源。

## 推荐执行顺序

1. 补 P5 性能 hardening 和测量基线。
2. 补 P4 安全闭环回归定义。
3. 设计 P5.5 isolated worktree 执行层。
4. 推进 P7 插件可视化体验。

## 不建议立即投入

- 不建议把 P5 继续当成完全未开始阶段整体推进；当前更需要实测基线和 hardening。
- 不建议在 P6 恢复语义未稳定前做复杂插件 UI。
- 不建议在工作区隔离层设计完成前强化并发执行。
- 不建议继续维护重复的阶段任务文档；新的任务应沉淀到本路线图或对应规格文档。

## 下一步验收标准

近期工作完成后，应能回答：

- AgentTaskContract 的权威来源是否保持在共享包。
- 插件是否继续避免复制合同推导规则。
- instructionHash unavailable 时系统如何安全降级。
- 每类失败是否有稳定状态和恢复建议。
- 验证命令失败是否能稳定进入 `failed_test`。
- 性能预算是否有可重复测量方法。
