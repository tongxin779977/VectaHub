# Development Backlog

> Document Status: Current Planning Queue / Migration Contract
> Authority: NL Workflow Orchestrator 未开发能力的执行队列。自动化任务和开发 agent 应按本文顺序选择任务；字段级行为仍以 `docs/contracts/` 和当前源码为准。
> Last Verified: 2026-05-31

## 使用规则

本文是自动化开发队列，不是愿望清单。

每轮自动化任务必须：

1. 读取本文。
2. 选择 `status: todo` 且 priority 最高、排序最靠前的一项。
3. 只开发这一项。
4. 完成后审计和验证。
5. 通过后将该项改为 `done`，记录验证命令和提交信息。
6. 未通过则改为 `needs-fix` 或 `blocked`，记录失败证据。

禁止：

- 一轮同时开发多个 backlog item。
- 跳过 P0/P1 去做低优先级功能。
- 实现 `secondary` 或 `unsupported` 能力，除非 backlog 明确要求。
- 修改测试来掩盖失败。
- 绕过安全、JSON、trace、verification 或 semantic acceptance 合同。

## 工程标准

所有任务必须遵守：

- [开发者指南](./development.md)
- [质量评分标准](./standards/quality-scoring.md)
- [开发检查清单](./standards/development-checklists.md)
- [验证门禁标准](./standards/verification-gates.md)
- [语义验收标准](./standards/semantic-acceptance.md)

硬性约束：

- Production `any` 保持 0。
- 当前进程 production `console.*` 保持 0。
- `--json` stdout 必须保持单个纯 JSON 对象。
- LLM 输出不能绕过 schema、安全、命令面、workflow 或 verification 合同。
- Agent 成功不等于任务成功，必须由 verification closure 判定。
- 代码风格以现有 TypeScript、Commander、Vitest、dependency injection 和 infrastructure patterns 为准。

## 状态模型

| Status | 含义 |
|--------|------|
| `todo` | 可被自动化选择。 |
| `in-progress` | 当前轮正在开发。 |
| `needs-fix` | 已开发但审计或验证失败，需要下一轮修复。 |
| `blocked` | 缺少合同、权限、环境或产品决策，不能继续。 |
| `done` | 开发、审计、验证和提交均完成。 |

## 优先级规则

| Priority | 含义 |
|----------|------|
| P0 | 阻断 NL Workflow Orchestrator 主链路，必须先做。 |
| P1 | 核心智能化和编排能力。 |
| P2 | 安全、验证、恢复、反馈学习和 hardening。 |
| P3 | UI/DX、集成体验和辅助能力。 |
| P4 | secondary 或后续重新评估能力。 |

## Backlog

### P0-001: 统一 `run --dry-run --json` 输出 envelope

```yaml
id: P0-001
priority: P0
status: todo
source_docs:
  - docs/nl-workflow-orchestrator.md
  - docs/contracts/orchestration-plan.md
  - docs/design/hybrid-ai-nl-engine.md
goal: >
  让 capability route、LLM fallback、direct shell fallback 和 workflow file dry-run 输出统一机器 envelope，
  为 OrchestrationPlan 迁移提供稳定入口。
scope:
  - run --dry-run --json 输出结构
  - direct shell fallback dry-run shape
  - capability route dry-run shape
  - LLM/tool-calling dry-run shape
out_of_scope:
  - 执行真实 workflow 行为大改
  - UI 改动
  - Agent delegate runtime 接线
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/cli-command-surface.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run check:default-context-usage
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - run --dry-run --json 始终输出单个纯 JSON 对象
  - JSON 能表达 reply / clarify / blocked / plan / workflow_draft
  - 现有语义 E2E 通过
```

### P0-002: 建立 `OrchestrationPlan` runtime schema

```yaml
id: P0-002
priority: P0
status: todo
source_docs:
  - docs/contracts/orchestration-plan.md
goal: >
  为 OrchestrationPlan 建立 runtime schema、类型和 validation path，避免 LLM 或 capability route 输出无合同结构。
scope:
  - OrchestrationPlan 类型
  - runtime validator
  - unit tests for valid/invalid plans
out_of_scope:
  - 完整 LLM Planner
  - WorkflowDraft 转换
required_contracts:
  - docs/contracts/orchestration-plan.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - invalid task id / dependency / command shape 会失败
  - blocked / needs_confirmation / ready 状态可校验
```

### P0-003: 建立 `WorkflowDraft` runtime schema

```yaml
id: P0-003
priority: P0
status: todo
source_docs:
  - docs/contracts/workflow-draft.md
goal: >
  为 WorkflowDraft 建立 runtime schema、类型和 validation path，使计划到 workflow 执行之间有可审查中间层。
scope:
  - WorkflowDraft 类型
  - runtime validator
  - snapshot/hash 字段校验
  - draft status 校验
out_of_scope:
  - 真正执行 draft
  - UI draft review
required_contracts:
  - docs/contracts/workflow-draft.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - delegate / exec / dependency / confirmation 规则可校验
  - unsafe draft 不能进入 executable 状态
```

### P1-001: 实现 Project Context Pack builder

```yaml
id: P1-001
priority: P1
status: todo
source_docs:
  - docs/design/hybrid-ai-nl-engine.md
goal: >
  为 NL Planner 提供压缩项目事实，包括 cwd、package scripts、git summary、workflow、agents、capabilities、security mode 和 recent failures。
scope:
  - ProjectContextPack builder
  - redaction boundary
  - tests for missing package/git/agent cases
out_of_scope:
  - LLM Planner 调用
  - feedback storage
required_contracts:
  - docs/design/hybrid-ai-nl-engine.md
  - docs/contracts/tools-security-management.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - 不读取 secrets 或完整环境变量
  - 缺少项目文件时保守返回 unknown/empty，而不是猜测
```

### P1-002: 实现 Capability Catalog builder

```yaml
id: P1-002
priority: P1
status: todo
source_docs:
  - docs/design/hybrid-ai-nl-engine.md
  - docs/contracts/tools-security-management.md
goal: >
  从当前 CLI command surface、workflow step types、Agent runtime 和文档任务能力派生 VectaHub Capability Catalog。
scope:
  - capability summary type
  - catalog builder
  - current/partial/target/unsupported status mapping
out_of_scope:
  - MCP marketplace
  - custom skill ecosystem
required_contracts:
  - docs/contracts/cli-command-surface.md
  - docs/contracts/tools-security-management.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - LLM 可消费 catalog
  - target/unsupported 能力不会进入 executable plan
```

### P1-003: 实现 LLM Planner 输出 `OrchestrationPlan`

```yaml
id: P1-003
priority: P1
status: todo
source_docs:
  - docs/design/hybrid-ai-nl-engine.md
  - docs/contracts/orchestration-plan.md
goal: >
  将 LLM fallback 从自由 workflow/step 输出收敛为 schema 化 planner output，再经过 OrchestrationPlan validator。
scope:
  - planner prompt/input contract
  - planner output parser
  - schema validation failure handling
  - hallucinated command blocking
out_of_scope:
  - feedback learning
  - UI integration
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/standards/semantic-acceptance.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run check:default-context-usage
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - LLM 不可用时保守失败
  - hallucinated VectaHub command 被 blocked
  - semantic E2E 覆盖中文/英文/危险/模糊输入
```

### P1-004: 接入 PlanSafetyReview

```yaml
id: P1-004
priority: P1
status: todo
source_docs:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/security-permission-loop.md
goal: >
  在 plan 级别评估副作用和风险，让执行前就能得到 allow / confirm / block。
scope:
  - plan-level safety review
  - command risk aggregation
  - confirmation requirement mapping
out_of_scope:
  - UI prompt
  - new security rule language
required_contracts:
  - docs/contracts/security-permission-loop.md
  - docs/contracts/orchestration-plan.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - critical 默认 blocked
  - high 默认 needs_confirmation
  - LLM 不能覆盖 deterministic safety decision
```

### P1-005: 将多步骤 NL plan 转为 WorkflowDraft

```yaml
id: P1-005
priority: P1
status: todo
source_docs:
  - docs/contracts/workflow-draft.md
  - docs/design/nl-workflow-orchestrator-product-design.md
goal: >
  将 ready OrchestrationPlan 转换为可审查 WorkflowDraft，为后续执行、保存和恢复提供中间层。
scope:
  - plan task to draft step mapping
  - draft summary in dry-run JSON
  - validation before executable state
out_of_scope:
  - full UI draft review
  - complete artifact handoff
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/workflow-draft.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 多步骤 plan 可生成 draft
  - 未确认副作用 draft 不能执行
```

### P1-006: 扩展 semantic acceptance cases

```yaml
id: P1-006
priority: P1
status: todo
source_docs:
  - docs/standards/semantic-acceptance.md
goal: >
  扩展语义 E2E，覆盖多表达、危险输入、模糊输入、非执行回复、Agent delegation 和 workflow draft。
scope:
  - semantic test cases
  - expected meaning assertions
  - report wording accuracy
out_of_scope:
  - 修改测试绕过失败
required_contracts:
  - docs/standards/semantic-acceptance.md
verification:
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 每个核心意图至少覆盖多种表达
  - 安全关键失败直接 fail
```

### P2-001: FeedbackRecord 存储与回放候选

```yaml
id: P2-001
priority: P2
status: todo
source_docs:
  - docs/design/hybrid-ai-nl-engine.md
  - docs/standards/intelligent-systems.md
goal: >
  记录用户纠正、semantic E2E 失败、执行失败和安全审计结果，作为 eval/prompt/rule/backlog 候选。
scope:
  - NLFeedbackRecord type
  - redacted storage
  - replay candidate export
out_of_scope:
  - runtime silent self-learning
  - automatic production prompt mutation
required_contracts:
  - docs/standards/intelligent-systems.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - feedback 不保存 secrets
  - appliedTo 明确为 eval/prompt_proposal/rule_proposal/catalog_gap/backlog
```

### P2-002: Agent delegate runtime 接线和 preflight

```yaml
id: P2-002
priority: P2
status: todo
source_docs:
  - docs/design/agent-cli-runtime-architecture.md
  - docs/contracts/workflow-draft.md
goal: >
  将 workflow delegate step 与 Agent Runtime、preflight、permission 和 result classification 接起来。
scope:
  - delegate handler deps
  - runtime readiness check
  - failure classification
out_of_scope:
  - multi-agent supervisor
  - shared sub-agent state
required_contracts:
  - docs/contracts/tools-security-management.md
  - docs/contracts/workflow-lifecycle.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - unknown/unready agent blocked
  - delegate success still requires verification when task mutates state
```

### P2-003: Artifact handoff 合同与最小实现

```yaml
id: P2-003
priority: P2
status: todo
source_docs:
  - docs/design/orchestration-and-delegation-architecture.md
  - docs/contracts/orchestration-plan.md
goal: >
  为多阶段计划和 Agent delegation 提供 artifact handoff 的最小合同和存储引用。
scope:
  - artifact reference type
  - producer/consumer linkage
  - summary/hash/redaction rules
out_of_scope:
  - full artifact UI
  - binary asset management
required_contracts:
  - docs/contracts/config-data-storage.md
  - docs/contracts/trace-execution.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - artifact 与 execution id / producer task 关联
  - 不保存未脱敏敏感内容
```

### P2-004: Workflow snapshot/hash guard

```yaml
id: P2-004
priority: P2
status: todo
source_docs:
  - docs/contracts/workflow-draft.md
  - docs/contracts/recovery-loop.md
goal: >
  为 workflow rerun/resume/recover 增加 workflow definition hash 或 snapshot guard，避免 stale workflow 被继续执行。
scope:
  - workflow hash generation
  - execution metadata association
  - recovery invalidation checks
out_of_scope:
  - distributed versioning
required_contracts:
  - docs/contracts/workflow-draft.md
  - docs/contracts/recovery-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - workflow definition changed 时恢复保守阻断
  - hash 不包含 secrets 或未脱敏大输出
```

### P3-001: VS Code/UI 消费统一 JSON contract

```yaml
id: P3-001
priority: P3
status: todo
source_docs:
  - docs/ui/README.md
  - docs/contracts/orchestration-plan.md
goal: >
  让 VS Code/UI 后续能消费统一 NL plan / workflow draft JSON，而不是解析人类日志或复制 CLI 业务逻辑。
scope:
  - UI-facing contract review
  - extension smoke test planning
out_of_scope:
  - 完整 UI 实现
required_contracts:
  - docs/contracts/cli-command-surface.md
  - docs/contracts/orchestration-plan.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - npm run compile -w packages/vectahub-vscode-extension
  - git diff --check
done_criteria:
  - UI 不复制执行真相
  - CLI JSON 字段可供 UI 稳定消费
```

### P4-001: Secondary 能力是否恢复主线评估

```yaml
id: P4-001
priority: P4
status: todo
source_docs:
  - docs/design/module-scope-cleanup.md
goal: >
  评估 service、daemon、templates、schedule、monitor、debug 是否需要重新进入主线；默认不实现。
scope:
  - product decision document
  - contract gap assessment
out_of_scope:
  - 直接实现 secondary 能力
required_contracts: []
verification:
  - Markdown link check
  - Markdown fence check
  - git diff --check -- docs
done_criteria:
  - 每个 secondary 能力有明确 keep/remove/revisit 结论
```

## 自动化执行协议

自动化任务每轮应执行：

```text
1. git status --short
2. 读取 docs/development-backlog.md
3. 选择第一个 status=todo 或 needs-fix 的最高优先级任务
4. 将任务状态改为 in-progress
5. 开发最小实现
6. 自审：合同、范围、安全、测试、JSON、trace、recovery
7. 运行该任务 verification 中列出的命令
8. 失败则修复，最多 3 轮
9. 通过后将任务状态改为 done，并记录验证结果
10. 只 stage 本轮相关文件
11. git commit
```

如果工作树在开始时已有无关改动，自动化必须避免提交无关文件；无法区分时停止并报告。
