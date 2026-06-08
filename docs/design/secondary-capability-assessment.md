# Secondary 能力评估报告

> Document Status: Product Decision / Assessment
> Authority: 基于 `docs/design/module-scope-cleanup.md` 的二次评估，结合代码库实际实现状态。
> Last Verified: 2026-06-01
> Related: [P4-001](../backlog/items/P4-001.md)

## 评估标准

一个模块应保留在主产品面，需要满足至少一个条件：

1. 直接服务 `NL input -> plan -> workflow draft -> safety review -> execution -> verification -> trace/recovery` 主链路。
2. 提供安全、trace、verification、recovery 等治理能力。
3. 被文档任务执行链路实际依赖。
4. 是 Agent Runtime 作为 worker 的必要基础。
5. 提供当前用户已经稳定使用的机器接口。

## 能力评估

### 1. serve / client

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（368 行），支持 Socket 服务端和 client 子命令 |
| 测试覆盖 | 有基础结构测试 |
| 主线依赖 | 无业务模块直接依赖 |
| 评估结论 | **revisit** |
| 理由 | serve 提供本地 Socket 服务能力，当前主线 NL Workflow Orchestrator 不依赖此路径。但 serve 可能被 VS Code extension 或未来 API 集成使用，需要确认是否有外部依赖后再决定。 |
| 建议 | 暂时保留但标记为 secondary，不从主帮助中移除。等 VS Code extension 集成路径明确后再决定。 |

### 2. daemon

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（97 行），start/stop/status 三个子命令 |
| 测试覆盖 | 命令级测试缺失，但 daemon/ 目录有独立测试 |
| 主线依赖 | 无业务模块直接依赖 |
| 评估结论 | **revisit** |
| 理由 | daemon 提供长驻后台服务能力，当前主线不需要。但 daemon 可能与 serve 配合使用，提供后台 Socket 服务。需要确认是否与 serve 绑定。 |
| 建议 | 暂时保留但标记为 secondary。如果 serve 被保留，daemon 作为其配套能力也应保留。 |

### 3. src/api/ (HTTP API Server)

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（298 行），REST API 覆盖健康检查、工作流 CRUD、AI delegate |
| 测试覆盖 | 较完整（247 行测试，8 个用例） |
| 主线依赖 | 无业务模块直接依赖，未注册为 CLI 命令 |
| 评估结论 | **revisit** |
| 理由 | HTTP API 是本地集成层，当前主线不依赖。但 API 可能被外部工具或 VS Code extension 使用。测试覆盖较好，说明有一定使用价值。 |
| 建议 | 暂时保留但不宣传。等外部集成需求明确后再决定是否升级为主产品能力。 |

### 4. monitor

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（179 行），start/stop/status/alerts/reset/config 六个子命令 |
| 测试覆盖 | 命令级测试缺失，但 monitoring/ 目录有独立测试 |
| 主线依赖 | 无业务模块直接依赖 |
| 评估结论 | **revisit** |
| 理由 | monitor 偏运维平台能力，当前主线不依赖。但监控能力对生产环境有价值，不应直接删除。 |
| 建议 | 暂时保留但标记为 secondary。等产品进入生产阶段后再决定是否升级。 |

### 5. debug

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（265 行），breakpoint/watch/state/history 等调试能力 |
| 测试覆盖 | 有基础测试（43 行） |
| 主线依赖 | 无业务模块直接依赖 |
| 评估结论 | **revisit** |
| 理由 | debug 偏 workflow IDE/debugger 能力，当前主线不依赖。但调试能力对开发者有价值，不应直接删除。 |
| 建议 | 暂时保留但标记为 secondary。等产品进入开发工具阶段后再决定是否升级。 |

### 6. generate

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（198 行），使用 LLM 生成 YAML 工作流 |
| 测试覆盖 | 命令级测试缺失 |
| 主线依赖 | 无业务模块直接依赖 |
| 评估结论 | **revisit** |
| 理由 | generate 应先通过 NL plan / workflow draft 生成，当前主线已覆盖此路径。但 generate 可能提供更直接的 YAML 生成体验。 |
| 建议 | 暂时保留但标记为 secondary。等 NL plan 路径稳定后，考虑将 generate 合并到 NL 路径中。 |

### 7. schedule

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（87 行），add/remove/list 三个子命令 |
| 测试覆盖 | 命令级测试缺失 |
| 主线依赖 | 无业务模块直接依赖 |
| 评估结论 | **revisit** |
| 理由 | schedule 会引入长期状态和后台运行复杂度，当前主线不依赖。但调度能力对生产环境有价值。 |
| 建议 | 暂时保留但标记为 secondary。等产品进入生产阶段后再决定是否升级。 |

### 8. templates

| 维度 | 结论 |
|------|------|
| 实现状态 | 非常完整（352 行），list/search/install/sources/save/use 六个子命令 |
| 测试覆盖 | 有基础测试（61 行） |
| 主线依赖 | 无业务模块直接依赖 |
| 评估结论 | **revisit** |
| 理由 | templates 提供模板市场能力，当前主线不依赖。但模板能力对用户快速创建工作流有价值。 |
| 建议 | 暂时保留但标记为 secondary。等 NL plan 路径稳定后，考虑将 templates 与 NL 路径整合。 |

### 9. chat

| 维度 | 结论 |
|------|------|
| 实现状态 | 命令入口简洁（83 行），但 chat/ 目录有 16 个文件的完整子系统 |
| 测试覆盖 | 有基础测试（77 行） |
| 主线依赖 | 无业务模块直接依赖，但 chat 依赖 nl/orchestrator |
| 评估结论 | **keep** |
| 理由 | chat 是 NL Workflow Orchestrator 的自然语言入口之一，与 run 共享 plan、safety review、workflow draft 和 JSON contract。chat 不应成为独立执行引擎，但作为 NL 入口应保留。 |
| 建议 | 保留为主产品能力。复杂意图应生成 OrchestrationPlan，执行必须通过明确确认。 |

### 10. provider

| 维度 | 结论 |
|------|------|
| 实现状态 | 完整实现（253 行），list/add/remove/test/info/refresh 六个子命令 |
| 测试覆盖 | 命令级测试缺失，但 agent-runtime/ 目录有完整测试 |
| 主线依赖 | 无业务模块直接依赖，但 provider 依赖 agent-runtime |
| 评估结论 | **revisit** |
| 理由 | provider 管理外部 Agent CLI 作为 worker，当前主线已通过 Agent Runtime registry 覆盖。但 provider 可能提供更直接的管理体验。 |
| 建议 | 暂时保留但标记为 secondary。等 runtime catalog、permission、trace、verification 稳定后再决定是否升级。 |

## 合同缺口评估

| 能力 | 合同缺口 | 风险等级 |
|------|---------|---------|
| serve / client | 无明确的 API 合同，Socket 协议未文档化 | 中 |
| daemon | 无明确的 daemon 生命周期合同 | 中 |
| src/api/ | REST API 合同已通过测试覆盖，但未文档化 | 低 |
| monitor | 无明确的监控指标合同 | 中 |
| debug | 无明确的调试接口合同 | 中 |
| generate | 生成的 YAML 工作流格式合同不明确 | 中 |
| schedule | 调度任务的持久化合同不明确 | 中 |
| templates | 模板格式合同不明确 | 中 |
| chat | NL 入口合同已通过 orchestrator 覆盖 | 低 |
| provider | provider 注册合同不明确 | 中 |

## 总结

| 结论 | 数量 | 能力 |
|------|------|------|
| keep | 1 | chat |
| revisit | 9 | serve, daemon, api, monitor, debug, generate, schedule, templates, provider |
| remove | 0 | - |

所有 secondary 能力均有完整实现，不应直接删除。建议：

1. **Phase 1: 文档降级** - 在产品文档中把 serve、daemon、monitor、debug、templates、schedule、generate、provider 标记为 secondary。
2. **Phase 2: 合同补全** - 为每个 secondary 能力补充 API 合同、持久化合同和生命周期合同。
3. **Phase 3: 路径整合** - 将 chat、generate、templates 与 NL plan 路径整合，避免能力重复。
4. **Phase 4: 决策升级** - 等主线稳定后，根据用户反馈和使用数据决定哪些能力升级为主产品。

## Follow-up Tracking

This assessment is tracked by [P4-001](../backlog/items/P4-001.md). The follow-up decision is recorded in [secondary-capability-follow-up.md](./secondary-capability-follow-up.md).
