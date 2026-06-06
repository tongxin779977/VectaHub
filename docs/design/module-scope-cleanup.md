# 模块范围整理建议

> Document Status: Product Scope Recommendation
> Authority: 面向产品和维护者的模块取舍建议。本文不要求直接删除代码；实际删除或隐藏命令前必须另行制定迁移计划和验证计划。
> Last Verified: 2026-05-30

## 背景

如果 VectaHub 的主线是 **NL Workflow Orchestrator**，模块范围应服务于这条链路：

```text
NL input
-> plan
-> workflow draft
-> safety review
-> execution
-> verification
-> trace / recovery
```

当前仓库存在一些偏本地服务、监控、调试、模板和调度方向的能力。它们可能有价值，但会让产品看起来像一个大型 CLI 平台，而不是聚焦的 NL Workflow Orchestrator。

## 保留为核心

以下模块应保留为当前产品核心：

| 模块 | 原因 |
|------|------|
| `src/nl/` | 自然语言入口、意图处理、能力路由和 LLM fallback。 |
| `src/workflow/` | workflow engine 是编排落点。 |
| `src/execution/` | 执行记录、输出存储和生命周期支撑 rerun/recovery。 |
| `src/security-protocol/` | 安全策略、风险评估、脱敏和权限边界。 |
| `src/sandbox/` | 命令执行和风险控制基础设施。 |
| `src/agent-runtime/` | 外部 Agent CLI 作为 worker 的 registry 和 adapter。 |
| `src/infrastructure/` | config、logger、audit、trace、paths 等基础设施。 |
| `parse-doc` / `run-task` | 当前最成熟的文档任务执行路径。 |
| `trace` / `recover-task` | 可观察性和恢复闭环。 |
| `tools agents --json` | Agent runtime catalog 的当前机器入口。 |

## 优先下线或隐藏

以下模块建议先从主产品面降级，不一定立即删除：

| 模块或命令 | 建议 | 原因 |
|------------|------|------|
| `serve` / `client` | 隐藏或标记 secondary | 容易把产品带向本地服务平台。 |
| `daemon` | 隐藏或标记 secondary | 当前主线不需要长驻 daemon。 |
| `src/api/` | 暂停宣传 | HTTP API 是本地集成层，不是当前核心。 |
| `monitor` | 从主命令面移除 | 偏运维平台能力。 |
| `debug` | 从主命令面移除 | 偏 workflow IDE/debugger 能力。 |
| `generate` | 暂停扩展 | 应先通过 NL plan / workflow draft 生成。 |
| `schedule` | 暂停扩展 | 调度会引入长期状态和后台运行复杂度。 |
| `templates` | 暂停扩展 | 模板市场不是当前主产品。 |

推荐顺序：

1. 先从 README、能力地图和 CLI 帮助的主路径中降级。
2. 再确认测试、VS Code、docs 是否依赖。
3. 最后决定隐藏命令、移动到 experimental，或删除实现。

## 合并而不是直接删除

以下模块和能力应先合并语义和真相源：

### `chat`

`chat` 不应成为独立执行引擎。

推荐方向：

- 保留普通 reply 能力。
- 复杂意图生成 `OrchestrationPlan`。
- 执行必须通过明确确认。
- 和 `run` 共享 plan、safety review、workflow draft 和 JSON contract。

### `provider`

当前内建 Agent Runtime 已能覆盖主要 worker。

推荐方向：

- 暂缓 custom provider 作为主产品。
- 保留为实验能力或内部配置能力。
- 等 runtime catalog、permission、trace、verification 稳定后再升级。

### 重复规则系统

当前存在多处规则相关模块。建议最终以 `security-protocol` 作为安全和权限真相源。

推荐方向：

- 安全规则归 `security-protocol`。
- CLI tool command rules 作为工具 metadata 或 adapter。
- 不同规则系统不得对同一命令给出冲突结论。

## 暂不追的能力

以下能力不建议当前阶段投入：

- MCP marketplace。
- 动态安装社区 skill。
- runtime 生成 adapter 源码。
- 多用户服务。
- 长期后台 scheduler。
- 多 Agent swarm 状态共享。
- 分布式 worktree 调度。

这些能力都依赖更稳定的 plan、permission、trace、artifact 和 verification 合同。

## 模块保留判断标准

一个模块应保留在主产品面，需要满足至少一个条件：

- 直接服务 `run -> plan -> workflow draft -> execute` 主链路。
- 提供安全、trace、verification、recovery 等治理能力。
- 被文档任务执行链路实际依赖。
- 是 Agent Runtime 作为 worker 的必要基础。
- 提供当前用户已经稳定使用的机器接口。

一个模块应降级或移出主产品面，如果它：

- 主要服务本地服务平台或长期后台运行。
- 主要服务调试、监控或模板市场。
- 与 NL Workflow Orchestrator 主链路没有直接关系。
- 增加大量测试和文档负担，却不能提升自然语言编排质量。
- 复制了核心模块已有的执行、状态或安全逻辑。

## 建议路线

### Phase 1: 文档降级

- 在产品文档中把 service、daemon、monitor、debug、templates、schedule 写为 secondary。
- 不再作为当前产品核心能力宣传。

### Phase 2: 命令面整理

- 将 secondary 命令从主帮助和新手路径中移出。
- 保留兼容入口，避免破坏已有用户。
- 对外标记 experimental 或 maintenance。

### Phase 3: 真相源合并

- 合并 chat 和 run 的 plan / safety / workflow draft 路径。
- 合并规则系统到统一安全协议。
- 让 Agent provider/onboarding 依赖 runtime catalog。

### Phase 4: 删除或插件化

- 对确认无人依赖的 secondary 模块删除。
- 对仍有价值但非核心的模块移动为 plugin、experimental 或 separate package。

## 验证要求

任何实际删除或隐藏命令前，必须验证：

- CLI help 和 command registry 不再引用已删除命令。
- docs 不再把被删除能力写成当前能力。
- 相关测试删除或迁移到 experimental。
- VS Code extension 没有调用被删除命令。
- `npm run typecheck`、`npm run lint`、`npm run test:run` 根据变更范围运行。

本文本身只提供产品取舍建议，不执行删除。
