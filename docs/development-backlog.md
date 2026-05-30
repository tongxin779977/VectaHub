# Development Backlog

> Document Status: Current Planning Queue / Migration Contract
> Authority: NL Workflow Orchestrator 未开发能力的执行队列。自动化任务和开发 agent 应按本文顺序选择任务；字段级行为仍以 `docs/contracts/` 和当前源码为准。
> Last Verified: 2026-05-31

## 目的

本文是自动化开发队列，不是愿望清单。

它的用途是：

- 把当前文档已经声明、源码已有基础、但尚未完整闭环的能力拆成可执行开发任务。
- 让 Trae Solo、Codex、subagent 或人工开发都按同一顺序推进。
- 避免一轮自动化随机挑任务、跳过基础合同、或把目标设计误写成当前实现。
- 作为可迁移模板，后续可复制到其他项目，只替换合同、源码路径和验证命令。

## 事实依据

本 backlog 只基于以下事实来源补充任务：

| 来源 | 已确认事实 | 对 backlog 的影响 |
|------|------------|-------------------|
| `docs/nl-workflow-orchestrator.md` | 当前定位是单用户、本地优先的 NL Workflow Orchestrator；`OrchestrationPlan`、统一 `run --dry-run --json`、workflow draft 生命周期、artifact handoff、plan-level safety、semantic acceptance 和 feedback learning 仍是未完整闭环能力。 | 这些能力必须进入开发队列，且不能标记为已实现。 |
| `docs/design/nl-workflow-orchestrator-product-design.md` | 主链路是 `input normalization -> goal parsing -> capability routing -> OrchestrationPlan -> WorkflowDraft -> PlanSafetyReview -> confirmation -> execution -> verification -> trace / audit / recovery`。 | backlog 必须覆盖每个链路节点，不能只覆盖 schema 和 planner。 |
| `docs/design/hybrid-ai-nl-engine.md` | AI 化路线包含 Project Context Pack、Capability Catalog、LLM Planner、schema validation、command surface validation、PlanSafetyReview、WorkflowDraft、FeedbackRecord 和 semantic gate。 | backlog 必须把 LLM 限定为 planner，而不是 executor 或权限来源。 |
| `docs/contracts/orchestration-plan.md` | `OrchestrationPlan` 是目标合同；当前只有 capability `ExecutionPlan` 和 workflow step 路径，尚未完整实现统一合同。 | 必须先做 runtime schema、validator、命令面校验、机器输出 envelope。 |
| `docs/contracts/workflow-draft.md` | 当前 workflow engine 已存在，但 draft 生命周期仍需迁移实现。 | 必须补 draft schema、转换、确认、持久化、执行桥接、snapshot/hash 和 recovery guard。 |
| `docs/standards/semantic-acceptance.md` | 语义验收不只看命令通过，还要看意图、回复意义、JSON shape、风险判断、下一步建议和多表达一致性。 | 必须补语义测试用例、评分、报告和多 subagent 用户测试模式。 |
| 当前源码结构 | `src/nl/`、`src/workflow/`、`src/agent-runtime/`、`src/security-protocol/`、`src/infrastructure/trace/`、`src/infrastructure/trace-audit/`、`src/commands/run-task.ts` 和 `src/commands/recover-task.ts` 已存在。 | backlog 应优先整合现有模块，不应从零重写或引入无关平台能力。 |

## 证据等级

每个任务的 `evidence` 字段必须使用以下等级：

| Level | 含义 |
|-------|------|
| `confirmed_source` | 当前源码或测试中已存在相关模块、入口或行为。 |
| `contract_target` | `docs/contracts/` 已定义目标合同，但当前未声明完整实现。 |
| `product_decision` | 产品设计文档已明确主线方向或非目标边界。 |
| `standard_gate` | 标准文档已定义验收、评分、质量或验证要求。 |
| `automation_need` | 为顺序开发、审计、提交或跨项目复用所需的工程流程任务。 |

禁止新增没有 `evidence` 的开发任务。

## 使用规则

每轮自动化任务必须：

1. 读取本文。
2. 检查是否存在 `in-progress:<timestamp>` 的任务：
   - 如果时间戳超过 30 分钟，视为 stale，重置为 `todo`。
   - 如果未超时，继续该任务；不得另开新任务。
3. 如果不存在有效的 `in-progress`，选择 priority 最高、排序最靠前、依赖已完成的 `needs-fix` 任务。
4. 如果不存在可执行 `needs-fix`，选择 priority 最高、排序最靠前、依赖已完成的 `todo` 任务。
5. 将选中任务状态改为 `in-progress:<当前时间>`。
6. 只开发这一项。
7. 完成后审计和验证。
8. 通过后将该项改为 `done`，记录验证命令和提交信息。
9. 未通过则改为 `needs-fix` 或 `blocked`，记录失败证据。

禁止：

- 一轮同时开发多个 backlog item。
- 跳过 P0/P1 去做低优先级功能。
- 在依赖任务未完成时开发下游任务。
- 实现 `secondary` 或 `unsupported` 能力，除非 backlog 明确要求。
- 修改测试来掩盖失败。
- 绕过安全、JSON、trace、verification 或 semantic acceptance 合同。
- 把 `Target Design` 或 `Migration Contract` 写成当前已实现能力。

## 多 Subagent 协作规则

可以使用多个 subagent，但所有 subagent 必须围绕同一个 backlog item 工作。

推荐角色：

- Developer agent：实现当前 item 的最小闭环。
- Audit agent：审查合同、范围、安全、错误处理、JSON、trace 和测试覆盖。
- Verification agent：运行当前 item 的 verification 命令并整理证据。
- Commit/report agent：只在所有验证通过后 stage 当前 item 相关文件并提交。

禁止不同 subagent 同时领取不同 backlog item。

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

| Status | 含义 | 跨 session 行为 |
|--------|------|-----------------|
| `todo` | 待开发，可被自动化选择。 | 直接选择。 |
| `in-progress:<timestamp>` | 当前轮正在开发；时间戳格式 `YYYY-MM-DDTHH:MM`。 | 超过 30 分钟视为 stale，重置为 `todo`；未超时则继续该任务。 |
| `needs-fix` | 已开发但审计、验证或后续复审失败，需要修复。 | 优先于 `todo` 选择。 |
| `blocked` | 缺少合同、权限、环境或产品决策，不能继续。 | 跳过。 |
| `done` | 开发、审计、验证和提交均完成。 | 跳过；如果后续复审发现不满足 `done_criteria`，必须改回 `needs-fix` 并记录复审证据。 |

### 状态转换规则

- `todo` → `in-progress:<now>`：开始开发时。
- `in-progress:<ts>` → `todo`：超过 30 分钟未完成，视为 stale 自动重置。
- `in-progress:<ts>` → `needs-fix`：审计或验证失败。
- `in-progress:<ts>` → `done`：全部验证通过。
- `needs-fix` → `in-progress:<now>`：开始修复时。
- `done` → `needs-fix`：后续复审发现实现、验证记录或完成证据不满足 `done_criteria`。
- `blocked` → `todo`：阻塞条件解除时（手动）。

## 优先级规则

| Priority | 含义 |
|----------|------|
| P0 | 阻断 NL Workflow Orchestrator 主链路，必须先做。 |
| P1 | 核心智能化、编排、确认、执行和语义验收能力。 |
| P2 | 安全、验证、恢复、反馈学习、trace 和 hardening。 |
| P3 | UI/DX、自动化体验和辅助能力。 |
| P4 | secondary、custom ecosystem 或后续重新评估能力。 |

## 任务字段规范

每个任务必须包含：

```yaml
id: P0-000
priority: P0
status: todo
depends_on: []
evidence:
  - level: contract_target
    source: <contract-or-source-reference>
    fact: >
      已确认事实，不写猜测。
source_docs: []
goal: >
  当前任务目标。
scope: []
out_of_scope: []
required_contracts: []
verification: []
done_criteria: []
```

如果任务完成，应追加：

```yaml
completion:
  verified_at: YYYY-MM-DD
  commit: <commit-sha-or-message>
  verification_results:
    - npm run typecheck: pass
```

如果任务被复审打回，应追加：

```yaml
review_findings:
  reviewed_at: YYYY-MM-DD
  status: needs-fix
  findings:
    - severity: P1
      location: <file-or-doc-reference>
      reason: >
        说明不满足哪个 done_criteria、合同或验证要求。
      required_fix: >
        说明下一轮必须完成的修复。
```

## Backlog

### P0-001: 统一 `run --dry-run --json` 输出 envelope

```yaml
id: P0-001
priority: P0
status: done
depends_on: []
evidence:
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      当前仍缺少统一的 run --dry-run --json 输出形态，需要为 OrchestrationPlan 迁移提供稳定入口。
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      迁移期间允许增加兼容字段，但 run --dry-run --json stdout 必须保持单个纯 JSON 对象。
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
completion:
  verified_at: 2026-05-31
  commit: HEAD
  verification_results:
    - npm run typecheck: pass
    - npm run lint: pass (0 errors, 0 warnings)
    - npm run check:default-context-usage: pass
    - npm run test:run: pass (217 files, 2990 tests passed, 11 skipped)
    - scripts/test-semantic-output.sh: pass
    - git diff --check: pass
  changed_files:
    - src/commands/run-dry-run-envelope.ts
    - src/commands/run-dry-run-envelope.test.ts
    - src/commands/run.ts
    - docs/development-backlog.md
review_findings:
  reviewed_at: 2026-05-31
  status: resolved_by_commit:HEAD
  findings:
    - severity: P1
      location: src/commands/run.ts
      reason: >
        buildClarifyEnvelope 和 buildBlockedEnvelope 已实现但未接入 run --dry-run --json 主路径。
        当前错误路径仍输出 ok/error 结构，不能稳定表达 result.kind=clarify 或 result.kind=blocked，
        不满足 done_criteria 中的 reply / clarify / blocked / plan / workflow_draft 统一 envelope。
      required_fix: >
        在 run --dry-run --json 的不可解析、blocked、needs clarification 路径统一返回 RunDryRunEnvelope，
        并补主路径测试和 semantic E2E 覆盖。
      resolved_at: 2026-05-31
```

### P0-002: 建立 `OrchestrationPlan` runtime schema

```yaml
id: P0-002
priority: P0
status: done
depends_on: []
evidence:
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      OrchestrationPlan 是目标合同，当前实现尚未完整实现统一 OrchestrationPlan。
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
completion:
  verified_at: 2026-05-31
  commit: 36cf1816511ed9da2e81a40933740e6dd948201f
  verification_results:
    - npm run typecheck: pass
    - npm run lint: pass
    - npm run test:run: pass (215 files, 2932 tests)
    - git diff --check: pass
  changed_files:
    - src/types/orchestration-plan.ts
    - src/orchestration-plan/validator.ts
    - src/orchestration-plan/validator.test.ts
    - src/orchestration-plan/index.ts
    - src/types/index.ts
```

### P0-003: 建立 `WorkflowDraft` runtime schema

```yaml
id: P0-003
priority: P0
status: done
depends_on: []
evidence:
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      当前 workflow engine 已存在，但 WorkflowDraft 生命周期仍需迁移实现。
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
completion:
  verified_at: 2026-05-31
  commit: HEAD
  verification_results:
    - npm run typecheck: pass
    - npm run lint: pass (0 errors, 0 warnings)
    - npm run test:run: pass (217 files, 2998 tests passed, 11 skipped)
    - git diff --check: pass
  changed_files:
    - docs/development-backlog.md
    - src/types/index.ts
    - src/types/workflow-draft.ts
    - src/orchestration-plan/workflow-draft-validator.ts
    - src/orchestration-plan/workflow-draft-validator.test.ts
review_findings:
  reviewed_at: 2026-05-31
  status: resolved_by_commit:e9b12bbdbb07
  findings:
    - severity: P1
      location: src/orchestration-plan/workflow-draft-validator.ts
      reason: >
        confirmed / persisted / executing 状态只阻断 safetyReview=blocked 和 needs_confirmation 无 confirmation，
        但未阻断 safetyReview=not_reviewed，导致未审查 draft 可进入 executable 状态，
        不满足 unsafe draft 不能进入 executable 状态。
      required_fix: >
        executable draft 必须要求 safetyReview=safe，或 safetyReview=needs_confirmation 且存在有效 confirmation；
        safetyReview=not_reviewed 必须阻断并补测试。
      resolved_at: 2026-05-31
    - severity: P1
      location: src/orchestration-plan/workflow-draft-validator.ts
      reason: >
        dependsOn 只校验引用存在，未校验循环依赖；WorkflowDraft 合同要求 dependsOn 必须能拓扑排序。
      required_fix: >
        增加 DAG / topological validation，阻断 step 循环依赖，并补循环依赖测试。
      resolved_at: 2026-05-31
```

### P0-004: 建立 NL request envelope 和入口 normalization 合同

```yaml
id: P0-004
priority: P0
status: done
depends_on:
  - P0-001
evidence:
  - level: product_decision
    source: docs/design/nl-workflow-orchestrator-product-design.md
    fact: >
      产品主链路从 input normalization 开始，run、文档任务、Agent delegation 和 UI 后续都应共用该入口边界。
  - level: confirmed_source
    source: src/nl/core/input-normalizer.ts
    fact: >
      当前已有 input normalizer 模块，应优先整合而不是重新发明入口解析。
source_docs:
  - docs/design/nl-workflow-orchestrator-product-design.md
  - docs/design/hybrid-ai-nl-engine.md
goal: >
  定义并实现 NLRequestEnvelope，把用户输入、cwd、source、mode、dryRun、json、language、session/context 引用统一传入 planner 和 router。
scope:
  - NLRequestEnvelope 类型
  - input normalizer 输出统一结构
  - run dry-run / normal run / file input 的入口字段映射
  - tests for empty input、file input、中文输入、json mode、cwd
out_of_scope:
  - LLM Planner 实现
  - WorkflowDraft 转换
  - UI 接线
required_contracts:
  - docs/contracts/orchestration-plan.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 所有 NL 路径都能拿到同一请求 envelope
  - cwd 来自运行环境，不从自然语言猜测
  - 空输入或上下文不足返回 clarify / blocked，而不是猜测执行
completion:
  verified_at: 2026-05-31
  verification_results:
    - npm run typecheck: pass
    - npm run lint: pass
    - npm run test:run: pass
    - scripts/test-semantic-output.sh: pass
    - git diff --check: pass
  changed_files:
    - src/types/nl.ts
    - src/nl/core/input-normalizer.ts
    - src/nl/core/input-normalizer.test.ts
    - docs/development-backlog.md
```

### P0-005: 建立 Command Surface Validator

```yaml
id: P0-005
priority: P0
status: done
depends_on:
  - P0-002
evidence:
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      生成命令必须经过命令面校验；未注册的 vectahub 子命令必须阻断。
  - level: confirmed_source
    source: src/cli-main.ts
    fact: >
      当前 CLI 由 Commander 注册命令，存在可作为命令面事实来源的实现入口。
source_docs:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/cli-command-surface.md
goal: >
  建立可复用命令面验证器，阻断 LLM 或 planner 生成不存在的 CLI、错误子命令、未解析 shell 字符串或不允许的参数形态。
scope:
  - vectahub command surface validator
  - CommandInvocation cli/args shape validation
  - tests for unknown command、unknown subcommand、string shell blob、valid known commands
out_of_scope:
  - 新 Commander 命令
  - 新安全规则语言
  - LLM Planner prompt
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/cli-command-surface.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - 不存在的 vectahub 子命令被 blocked
  - args 必须是字符串数组，不能是一整段未解析 shell
  - validator 可被 OrchestrationPlan、VerificationPlan 和 WorkflowDraft 共用
completion:
  verified_at: 2026-05-31
  verification_results:
    - npm run typecheck: pass
    - npm run lint: pass
    - npm run test:run: pass
    - git diff --check: pass
  changed_files:
    - src/orchestration-plan/command-surface-validator.ts
    - src/orchestration-plan/command-surface-validator.test.ts
    - src/orchestration-plan/validator.ts
    - src/orchestration-plan/index.ts
    - docs/development-backlog.md
```

### P0-006: 统一机器响应和错误 JSON envelope

```yaml
id: P0-006
priority: P0
status: done
depends_on:
  - P0-001
evidence:
  - level: standard_gate
    source: docs/standards/semantic-acceptance.md
    fact: >
      语义验收要求 JSON shape 稳定，且不得把 undefined、stack trace 或未脱敏内容放进用户可消费字段。
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      NL 输出需要表达 reply、clarify、blocked、plan 和 workflow draft；失败路径同样不能污染 JSON stdout。
source_docs:
  - docs/contracts/orchestration-plan.md
  - docs/standards/semantic-acceptance.md
goal: >
  统一 success、clarify、blocked、validation_error、safety_error、internal_error 的机器响应 envelope，
  让 CLI、UI、semantic tests 和自动化都能稳定消费失败和非执行结果。
scope:
  - machine result envelope type
  - safe error serializer
  - blocked / clarify / validation error mapping
  - tests for JSON stdout purity and redaction
out_of_scope:
  - 改写全仓错误系统
  - 暴露完整 stack trace 到 JSON stdout
  - UI 渲染
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
  - --json 成功和失败路径都输出单个纯 JSON 对象
  - human logs、trace、debug 信息不进入 stdout JSON
  - blocked / clarify / validation_error / safety_error 可被语义测试断言
completion:
  verified_at: 2026-05-31
  verification_results:
    - npm run typecheck: pass
    - npm run lint: pass (0 errors, 0 warnings)
    - npm run check:default-context-usage: pass
    - npm run test:run: pass (218 files, 3012 tests passed, 11 skipped)
    - git diff --check: pass
  changed_files:
    - src/types/machine-response.ts
    - src/types/index.ts
    - src/machine-response/index.ts
    - src/machine-response/index.test.ts
    - docs/development-backlog.md
```

### P1-001: 实现 Project Context Pack builder

```yaml
id: P1-001
priority: P1
status: done
depends_on:
  - P0-004
evidence:
  - level: contract_target
    source: docs/design/hybrid-ai-nl-engine.md
    fact: >
      Project Context Pack 是给 LLM Planner 的压缩项目事实视图，不能包含 secrets、完整环境变量或全仓源码。
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
completion:
  verified_at: 2026-05-31
  verification_results:
    - npm run typecheck: pass
    - npm run lint: pass
    - npm run test:run: pass (10 tests)
    - git diff --check: pass
  changed_files:
    - src/types/project-context.ts
    - src/project-context/builder.ts
    - src/project-context/builder.test.ts
    - src/project-context/index.ts
    - src/types/index.ts
```

### P1-002: 实现 Capability Catalog builder

```yaml
id: P1-002
priority: P1
status: todo
depends_on:
  - P0-005
evidence:
  - level: contract_target
    source: docs/design/hybrid-ai-nl-engine.md
    fact: >
      Capability Catalog 描述 VectaHub 当前真实能做什么，target/unsupported 能力不能进入可执行计划。
  - level: confirmed_source
    source: src/nl/capabilities/
    fact: >
      当前已有 capability router 和 capability 实现，应从现有能力派生 catalog。
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
depends_on:
  - P0-002
  - P0-004
  - P0-005
  - P1-001
  - P1-002
evidence:
  - level: contract_target
    source: docs/design/hybrid-ai-nl-engine.md
    fact: >
      LLM Planner 的输出必须是 reply、clarify、blocked 或 schema 化 OrchestrationPlan 候选。
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      LLM 输出无法通过 schema 校验时必须阻断，不能执行。
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
depends_on:
  - P0-002
  - P0-005
evidence:
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      PlanSafetyReview 要求 critical 默认阻断、high 默认需要确认，LLM 不能单独决定 sideEffect。
  - level: confirmed_source
    source: src/security-protocol/
    fact: >
      当前已有 security protocol 模块，应复用现有安全评估基础。
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
depends_on:
  - P0-002
  - P0-003
  - P1-004
evidence:
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      WorkflowDraft 是 OrchestrationPlan 和真实 workflow execution 之间的中间状态。
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
depends_on:
  - P0-001
  - P0-006
evidence:
  - level: standard_gate
    source: docs/standards/semantic-acceptance.md
    fact: >
      语义验收必须覆盖意图、回复意义、JSON shape、风险判断、下一步建议和多表达一致性。
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

### P1-007: 实现 confirmation flow 最小闭环

```yaml
id: P1-007
priority: P1
status: todo
depends_on:
  - P1-004
  - P1-005
  - P0-006
evidence:
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      ConfirmationRequest 必须绑定具体 task 或 plan 级风险，不能只展示泛泛的是否继续。
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      需要确认但没有确认记录时，draft 不能执行。
source_docs:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/workflow-draft.md
  - docs/contracts/security-permission-loop.md
goal: >
  建立最小确认闭环，让 needs_confirmation plan/draft 能生成可审查确认请求，并在用户确认后进入后续执行边界。
scope:
  - confirmation request serializer
  - confirmation token or id linkage
  - confirmed task ids / denied task ids handling
  - non-interactive deny-by-default behavior
out_of_scope:
  - 完整 UI prompt
  - 远程审批系统
  - 新权限模型
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/workflow-draft.md
  - docs/contracts/security-permission-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - high risk 默认需要确认
  - 非交互模式不能默认允许高风险操作
  - 确认记录能关联具体 plan task 或 draft step
```

### P1-008: 实现 VerificationPlan runner 和结果分类

```yaml
id: P1-008
priority: P1
status: todo
depends_on:
  - P0-005
  - P1-005
evidence:
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      Agent 执行成功不等于计划成功；包含 apply 或 agent task 时默认需要 verification。
  - level: product_decision
    source: docs/design/nl-workflow-orchestrator-product-design.md
    fact: >
      所有执行路径最终都应能回答验证是否通过，验证闭环才是最终完成依据。
source_docs:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/verification-loop.md
goal: >
  实现 VerificationPlan 的最小执行闭环，把验证命令、语义检查和成功标准转成可记录、可失败、可恢复的 verification result。
scope:
  - verification plan runner
  - command safety validation before verification
  - pass/fail/blocked/skipped classification
  - execution record or task run record linkage
out_of_scope:
  - 新测试框架
  - 大规模 report UI
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/verification-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - verification 命令同样经过命令面和安全评估
  - verification 失败时 plan/draft/execution 不能标记为成功
  - 验证结果能进入 execution record 或 task run record
```

### P1-009: 实现 WorkflowDraft 持久化、读取和列表

```yaml
id: P1-009
priority: P1
status: todo
depends_on:
  - P0-003
  - P1-005
evidence:
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      WorkflowDraft 生命周期包含 persisted，并要求保存执行前快照以支持 rerun、resume 和 recovery。
  - level: confirmed_source
    source: src/workflow/storage.ts
    fact: >
      当前已有 workflow/execution storage 基础，应复用现有存储模式。
source_docs:
  - docs/contracts/workflow-draft.md
  - docs/contracts/config-data-storage.md
goal: >
  让 WorkflowDraft 可以保存、读取、列出和详情查看，为后续确认执行、UI 和 recovery 提供稳定对象。
scope:
  - draft storage path and schema
  - create/get/list/detail operations
  - storage round-trip validation
  - redacted metadata and snapshot persistence
out_of_scope:
  - 完整 UI
  - 云端同步
  - 二进制 artifact 存储
required_contracts:
  - docs/contracts/workflow-draft.md
  - docs/contracts/config-data-storage.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - persisted draft 能重新读取并通过 schema validation
  - 保存内容不包含 secrets、完整 prompt、完整 trace 或未脱敏大输出
  - list/detail 输出能稳定关联 planId 和 draftId
```

### P1-010: 统一 human-readable 与 machine-readable response contract

```yaml
id: P1-010
priority: P1
status: todo
depends_on:
  - P0-006
  - P1-003
  - P1-005
evidence:
  - level: standard_gate
    source: docs/standards/semantic-acceptance.md
    fact: >
      回复内容必须看语义、意义、下一步建议和风险判断，而不是只看命令是否退出成功。
  - level: product_decision
    source: docs/design/nl-workflow-orchestrator-product-design.md
    fact: >
      NL entry 应输出 reply、clarify、blocked、plan、workflow_draft 或 execution_result。
source_docs:
  - docs/standards/semantic-acceptance.md
  - docs/contracts/orchestration-plan.md
goal: >
  统一普通用户可读回复和 JSON 机器字段，避免 CLI 文案、JSON 字段、语义测试和 UI 消费互相漂移。
scope:
  - response text policy for reply / clarify / blocked / plan / workflow_draft / execution_result
  - JSON field ownership and redaction
  - tests for no misleading success wording
out_of_scope:
  - 营销文案
  - UI 组件
  - 多语言翻译系统
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/standards/semantic-acceptance.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - blocked 不承诺已执行
  - clarify 明确缺少什么信息
  - plan/draft 回复说明下一步是 review、confirm、execute 或 verify
```

### P1-011: 建立多样本 semantic user-test harness

```yaml
id: P1-011
priority: P1
status: todo
depends_on:
  - P1-006
  - P1-010
evidence:
  - level: standard_gate
    source: docs/standards/semantic-acceptance.md
    fact: >
      多 Subagent 用户测试模式要求从意图、风险、回复质量和执行合同多个角度审查，不能只测试一两次。
  - level: automation_need
    source: docs/development-backlog.md
    fact: >
      用户测试应可自动化重复运行，避免人工在终端逐条命令判断。
source_docs:
  - docs/standards/semantic-acceptance.md
goal: >
  建立可重复的语义用户测试 harness，支持同一意图多表达、多轮样本、结果评分、报告输出和 subagent 审查分工。
scope:
  - semantic scenario matrix
  - repeated sample runner
  - expected meaning assertions
  - semantic score report
  - subagent review prompt template or report contract
out_of_scope:
  - 修改测试绕过失败
  - 用 LLM 直接覆盖 deterministic pass/fail
  - 生产 prompt 自动变更
required_contracts:
  - docs/standards/semantic-acceptance.md
  - docs/standards/quality-scoring.md
verification:
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 每类核心意图有多条表达样本
  - 报告区分 pass、fail、needs_review 和 expected_fail
  - 安全关键错误不允许只降级为人工主观判断
```

### P1-012: 将文档任务接入 OrchestrationPlan / WorkflowDraft

```yaml
id: P1-012
priority: P1
status: todo
depends_on:
  - P0-002
  - P1-005
  - P1-008
evidence:
  - level: product_decision
    source: docs/design/nl-workflow-orchestrator-product-design.md
    fact: >
      单个明确文档任务可继续走 parse-doc -> run-task，复杂多阶段任务应升级为 OrchestrationPlan -> WorkflowDraft。
  - level: confirmed_source
    source: src/commands/run-task.ts
    fact: >
      当前已有文档任务执行链路，应作为成熟路径整合进编排链路。
source_docs:
  - docs/design/nl-workflow-orchestrator-product-design.md
  - docs/contracts/run-task-execution-contract.md
  - docs/contracts/doc-task-state-machine.md
goal: >
  让文档任务在需要多阶段执行、多个 agent、依赖关系或验证闭环时能够生成 OrchestrationPlan 和 WorkflowDraft。
scope:
  - doc task candidate to plan mapping
  - AgentTaskContract to OrchestrationTask references
  - verification and recovery linkage
out_of_scope:
  - 删除现有 parse-doc / run-task 路径
  - 重写文档解析器
required_contracts:
  - docs/contracts/run-task-execution-contract.md
  - docs/contracts/doc-task-state-machine.md
  - docs/contracts/orchestration-plan.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 单任务路径保持兼容
  - 多阶段文档任务能产生 plan/draft summary
  - run-task 验证结果能回填 plan/draft trace 或 metadata
```

### P1-013: 将 confirmed WorkflowDraft 接入 workflow execution

```yaml
id: P1-013
priority: P1
status: todo
depends_on:
  - P1-005
  - P1-007
  - P1-008
  - P1-009
evidence:
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      WorkflowDraft 最终应转换为现有 workflow engine 可执行的 Workflow，未确认副作用步骤不能执行。
  - level: confirmed_source
    source: src/workflow/engine.ts
    fact: >
      当前已有 workflow engine，应通过桥接复用而不是另建执行器。
source_docs:
  - docs/contracts/workflow-draft.md
  - docs/contracts/workflow-lifecycle.md
goal: >
  将 confirmed WorkflowDraft 转换为现有 Workflow 并进入 execution，同时保持 safety、confirmation、verification 和 trace 关联。
scope:
  - confirmed draft to workflow conversion
  - execute confirmed draft command/path
  - execution metadata linkage
  - verification after execution
out_of_scope:
  - 新 workflow engine
  - distributed scheduler
  - UI draft execution
required_contracts:
  - docs/contracts/workflow-draft.md
  - docs/contracts/workflow-lifecycle.md
  - docs/contracts/verification-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 未确认副作用 draft 被阻断
  - confirmed draft 可进入 workflow engine
  - execution result 不绕过 verification closure
```

### P2-001: FeedbackRecord 存储与回放候选

```yaml
id: P2-001
priority: P2
status: todo
depends_on:
  - P1-003
  - P1-011
evidence:
  - level: contract_target
    source: docs/design/hybrid-ai-nl-engine.md
    fact: >
      FeedbackRecord 用于记录用户纠正、semantic E2E、执行结果、安全审查和恢复结果，但不能运行时静默改变生产行为。
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

### P2-002: Worker Capability Matrix

```yaml
id: P2-002
priority: P2
status: todo
depends_on:
  - P1-002
evidence:
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      外部 Agent CLI 是 worker，不是系统真相源；VectaHub 负责选择 Agent、控制生命周期、记录输出、运行验证和触发恢复。
  - level: confirmed_source
    source: src/agent-runtime/
    fact: >
      当前已有内建 Agent Runtime registry 和 adapters，覆盖 codex、claude、gemini、aider。
source_docs:
  - docs/nl-workflow-orchestrator.md
  - docs/design/agent-cli-runtime-architecture.md
goal: >
  建立 worker capability matrix，记录每个外部 Agent CLI 的可治理能力，而不是在 VectaHub 内重复实现这些能力。
scope:
  - worker capability summary type
  - built-in worker matrix for codex / claude / gemini / aider
  - capability flags for json output、headless、approval、sandbox、mcp、subagent、memory、checkpoint/resume
  - tests for unknown worker and unsupported native feature flags
out_of_scope:
  - 重新实现 worker 自己的 MCP runtime
  - 重新实现 worker 自己的 subagent / memory / custom command 系统
  - 声明所有 native feature 都可安全透传
required_contracts:
  - docs/contracts/tools-security-management.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - VectaHub 能区分 worker 支持、部分支持和不支持的 native capability
  - unsupported native feature 不会进入 executable plan
  - capability matrix 不成为第二套执行真相源，只作为编排选择依据
```

### P2-003: Delegation Policy

```yaml
id: P2-003
priority: P2
status: todo
depends_on:
  - P2-002
  - P1-008
evidence:
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      VectaHub 的价值是决定什么时候调用谁、调用前是否安全、调用后是否验证、失败后如何恢复。
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      executor: agent 时必须明确 delegateTo，Agent 选择未知且没有 runtime catalog 支持时必须阻断。
source_docs:
  - docs/nl-workflow-orchestrator.md
  - docs/contracts/orchestration-plan.md
goal: >
  定义 delegation policy，让计划任务能基于任务类型、风险、验证要求、worker readiness 和 native capability 选择合适 worker。
scope:
  - task-to-worker routing policy
  - worker readiness and capability checks
  - verification requirement mapping for delegated tasks
  - tests for unsupported worker、unsafe delegation、missing verification
out_of_scope:
  - 多 Agent swarm supervisor
  - worker 内部 prompt 策略重写
  - 自动安装或配置外部 Agent CLI
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/agent-worker-contract.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - code edit / review / docs / semantic test / shell probe 等任务有可解释 worker 选择依据
  - unknown 或 unready worker 被 blocked 或 clarify
  - delegated apply task 默认要求 verification
```

### P2-004: Worker Result Contract

```yaml
id: P2-004
priority: P2
status: todo
depends_on:
  - P2-002
  - P1-008
evidence:
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      Agent 成功退出不等于任务成功，VectaHub 必须运行验证、分类失败并触发恢复。
  - level: contract_target
    source: docs/contracts/agent-worker-contract.md
    fact: >
      Agent worker 输出需要被编排层记录和解释，而不是作为最终真相直接透出。
source_docs:
  - docs/contracts/agent-worker-contract.md
  - docs/contracts/verification-loop.md
goal: >
  统一外部 worker 输出为 WorkerResult，让 VectaHub 能稳定记录 status、summary、changed files、artifacts、verification 和 failure kind。
scope:
  - WorkerResult type
  - adapter result normalization
  - changed file / artifact / summary extraction boundary
  - failure kind and verification linkage
out_of_scope:
  - 解析所有 worker 私有日志格式
  - 将 worker stdout 原样保存为长期 artifact
  - 用 worker 自报成功覆盖 verification failure
required_contracts:
  - docs/contracts/agent-worker-contract.md
  - docs/contracts/verification-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - worker success、failure、cancelled、needs_review 能稳定分类
  - worker result 不保存 secrets、完整 prompt 或未脱敏大输出
  - verification failure 会覆盖 worker 自报成功
```

### P2-005: Native Feature Passthrough Policy

```yaml
id: P2-005
priority: P2
status: todo
depends_on:
  - P2-002
  - P2-003
  - P2-004
evidence:
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      当前阶段不建议把 VectaHub 描述成通用 MCP marketplace、多 agent swarm supervisor 或 chat-first assistant。
  - level: product_decision
    source: docs/design/module-scope-cleanup.md
    fact: >
      MCP marketplace、动态安装社区 skill、多 Agent swarm 状态共享和 runtime 生成 adapter 源码都不建议当前阶段投入。
source_docs:
  - docs/nl-workflow-orchestrator.md
  - docs/design/module-scope-cleanup.md
goal: >
  定义 worker-native 能力的透传策略，明确 MCP、subagent、memory、custom command、checkpoint 等能力何时允许、何时阻断、如何记录。
scope:
  - native feature allow / confirm / block policy
  - feature-level audit metadata
  - feature passthrough defaults for built-in workers
  - tests for unsafe passthrough requests
out_of_scope:
  - VectaHub 自建 MCP marketplace
  - VectaHub 自建 worker memory
  - VectaHub 自建 worker subagent runtime
  - 自动启用第三方工具或插件
required_contracts:
  - docs/contracts/tools-security-management.md
  - docs/contracts/security-permission-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - 默认不透传未知或未治理 native feature
  - 透传行为可审计并关联 plan task / draft step
  - memory、MCP、subagent、custom command 都不能绕过 VectaHub safety 和 verification
```

### P2-006: Checkpoint Reference Policy

```yaml
id: P2-006
priority: P2
status: todo
depends_on:
  - P1-009
  - P2-002
evidence:
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      WorkflowDraftSnapshot 要保存 planHash、workflowHash、generatedAt 和 sourceCwd，用于 rerun / resume / recover 判断定义是否变化。
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      VectaHub 应治理 worker 能力，不应复制每个 Agent CLI 自己的 checkpoint 引擎。
source_docs:
  - docs/contracts/workflow-draft.md
  - docs/contracts/recovery-loop.md
goal: >
  记录 git ref、worktree snapshot 或 worker-native checkpoint 的引用和可恢复边界，而不是在 VectaHub 内重造完整 checkpoint engine。
scope:
  - checkpoint reference type
  - git/worktree/native checkpoint reference mapping
  - checkpoint availability and stale check
  - tests for missing checkpoint and changed workflow hash
out_of_scope:
  - 复制 worker 的 checkpoint 实现
  - 自动回滚用户未确认改动
  - 分布式 snapshot storage
required_contracts:
  - docs/contracts/workflow-draft.md
  - docs/contracts/recovery-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - checkpoint reference 不包含 secrets 或完整 diff
  - missing checkpoint 时 recovery 保守阻断或要求人工处理
  - checkpoint reference 能关联 draft snapshot 和 execution metadata
```

### P2-007: Agent delegate runtime 接线和 preflight

```yaml
id: P2-007
priority: P2
status: todo
depends_on:
  - P1-005
  - P1-008
  - P2-002
  - P2-003
  - P2-004
evidence:
  - level: product_decision
    source: docs/design/nl-workflow-orchestrator-product-design.md
    fact: >
      Delegate Step 当前是 Partial Implementation，补 runtime 接线前不能宣传成完整多 Agent 执行。
  - level: confirmed_source
    source: src/agent-runtime/
    fact: >
      当前已有内建 Agent Runtime registry 和 adapters。
source_docs:
  - docs/design/agent-cli-runtime-architecture.md
  - docs/contracts/workflow-draft.md
goal: >
  将 workflow delegate step 与 Agent Runtime、preflight、permission、result classification 和 worker governance 接起来。
scope:
  - delegate handler deps
  - runtime readiness check
  - delegation policy integration
  - worker result normalization
  - failure classification
out_of_scope:
  - multi-agent supervisor
  - shared sub-agent state
  - worker-native MCP / subagent / memory reimplementation
required_contracts:
  - docs/contracts/tools-security-management.md
  - docs/contracts/workflow-lifecycle.md
  - docs/contracts/agent-worker-contract.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - unknown/unready agent blocked
  - delegate success still requires verification when task mutates state
  - worker native features cannot bypass VectaHub governance
```

### P2-008: Artifact handoff 合同与最小实现

```yaml
id: P2-008
priority: P2
status: todo
depends_on:
  - P1-005
  - P1-009
  - P2-004
evidence:
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      大输出、研究材料、patch summary 和审查结果应走 artifact，artifact 必须绑定 producer task 并带摘要和 hash。
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

### P2-009: Workflow snapshot/hash guard

```yaml
id: P2-009
priority: P2
status: todo
depends_on:
  - P1-009
  - P1-013
  - P2-006
evidence:
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      workflowHash 用于 rerun / resume / recover 时判断定义是否变化。
  - level: contract_target
    source: docs/contracts/recovery-loop.md
    fact: >
      恢复必须基于可验证上下文，不能在 workflow 定义变化时盲目继续。
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

### P2-010: 打通 plan / draft / execution / recovery trace identity

```yaml
id: P2-010
priority: P2
status: todo
depends_on:
  - P1-008
  - P1-009
  - P1-013
  - P2-004
evidence:
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      plan、workflow draft、execution record、recovery record 应能互相定位。
  - level: confirmed_source
    source: src/infrastructure/trace-audit/
    fact: >
      当前已有 trace-audit 基础设施，应把新 plan/draft 身份接入现有 trace 链路。
source_docs:
  - docs/contracts/trace-execution.md
  - docs/contracts/orchestration-plan.md
  - docs/contracts/workflow-draft.md
goal: >
  建立 planId、draftId、executionId、taskId、traceId、recoveryId 的贯穿链接，让审计、恢复、UI 和报告能定位同一条执行链。
scope:
  - trace link metadata model
  - plan/draft/execution/recovery id propagation
  - worker result trace linkage
  - tests for missing trace writer and JSON stdout purity
out_of_scope:
  - 新 trace backend
  - dashboard UI
required_contracts:
  - docs/contracts/trace-execution.md
  - docs/contracts/orchestration-plan.md
  - docs/contracts/workflow-draft.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - trace 写入失败不能把安全判断降级为允许
  - JSON stdout 不被 trace/audit 污染
  - recovery 能从 execution 反查 plan/draft 上下文
```

### P2-011: 将 orchestration failure 接入 recovery loop

```yaml
id: P2-011
priority: P2
status: todo
depends_on:
  - P1-008
  - P2-009
  - P2-010
evidence:
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      recovery 必须基于失败分类、trace 链接和上下文 hash，而不是靠模型猜测。
  - level: confirmed_source
    source: src/commands/recover-task.ts
    fact: >
      当前已有 recover-task 入口，应复用恢复基础能力。
source_docs:
  - docs/contracts/recovery-loop.md
  - docs/design/recovery-model.md
goal: >
  让 plan validation、draft validation、execution failure、worker failure 和 verification failure 都能形成可分类 recovery decision。
scope:
  - orchestration failure kind mapping
  - recovery context builder for plan/draft
  - worker failure to recovery decision mapping
  - blocked vs recoverable decision
  - trace and hash validation before recovery
out_of_scope:
  - 自动无限重试
  - LLM 猜测式恢复
required_contracts:
  - docs/contracts/recovery-loop.md
  - docs/contracts/verification-loop.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - validation failure、execution failure、worker failure、verification failure 分类明确
  - stale hash 时 recovery 保守阻断
  - recovery result 能回写 trace 或 task run record
```

### P2-012: Prompt / eval / rule proposal 治理闭环

```yaml
id: P2-012
priority: P2
status: todo
depends_on:
  - P2-001
  - P1-011
evidence:
  - level: contract_target
    source: docs/design/hybrid-ai-nl-engine.md
    fact: >
      feedback learning 的输出应进入 eval、prompt proposal、rule proposal 或 backlog，不能运行时静默改变生产行为。
  - level: standard_gate
    source: docs/standards/intelligent-systems.md
    fact: >
      智能化系统应采用规则快路径、LLM 推理、反馈学习和可审计验证的组合。
source_docs:
  - docs/design/hybrid-ai-nl-engine.md
  - docs/standards/intelligent-systems.md
goal: >
  建立反馈到 eval case、prompt proposal、rule proposal 和 backlog item 的审查流程，让系统可学习但不静默自改生产行为。
scope:
  - proposal record type
  - reviewed/applied/rejected status
  - eval candidate export
  - prompt/rule proposal report
out_of_scope:
  - 自动修改生产 prompt
  - 自动放宽安全规则
  - 在线学习服务
required_contracts:
  - docs/standards/intelligent-systems.md
  - docs/standards/semantic-acceptance.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - feedback appliedTo 有明确去向
  - 未审查 proposal 不影响生产路径
  - proposal 不保存 secrets、完整 prompt 或未脱敏 trace
```

### P2-013: NL / plan / draft / feedback 全链路脱敏审计

```yaml
id: P2-013
priority: P2
status: todo
depends_on:
  - P0-006
  - P2-001
  - P2-005
  - P2-008
evidence:
  - level: standard_gate
    source: docs/standards/semantic-acceptance.md
    fact: >
      用户可消费字段不得包含 undefined、stack trace 或未脱敏内容。
  - level: contract_target
    source: docs/contracts/orchestration-plan.md
    fact: >
      artifact、trace 和 safety finding 不得保存 secrets、完整 prompt、完整 trace 或未脱敏大输出。
source_docs:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/workflow-draft.md
  - docs/contracts/trace-execution.md
goal: >
  对 NL request、OrchestrationPlan、WorkflowDraft、FeedbackRecord、WorkerResult、ArtifactRef 和 trace/audit 链路做统一脱敏审计。
scope:
  - redaction boundary tests
  - no secret in JSON stdout
  - no full prompt/trace/diff in persisted records
  - worker-native feature passthrough redaction checks
  - unsafe field audit
out_of_scope:
  - 新 secret scanner 产品
  - 加密存储改造
required_contracts:
  - docs/contracts/orchestration-plan.md
  - docs/contracts/workflow-draft.md
  - docs/contracts/trace-execution.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 关键输出路径都有脱敏测试
  - JSON stdout 和持久化记录不包含 secrets
  - stack trace 只进入受控 debug/log 路径，不进入机器响应字段
```

### P2-014: 实现标准化语义评分报告

```yaml
id: P2-014
priority: P2
status: todo
depends_on:
  - P1-011
evidence:
  - level: standard_gate
    source: docs/standards/semantic-acceptance.md
    fact: >
      语义验收已有评分维度，需要可复用、可审计、非纯人工主观判断的报告输出。
  - level: standard_gate
    source: docs/standards/quality-scoring.md
    fact: >
      评分需要统一维度，不能每次人工临时判断。
source_docs:
  - docs/standards/semantic-acceptance.md
  - docs/standards/quality-scoring.md
goal: >
  将语义验收结果输出为标准化评分报告，覆盖意图、合同、安全、回复质量、验证建议、可恢复性和一致性。
scope:
  - semantic score dimensions
  - deterministic critical-failure rules
  - report JSON and markdown summary
  - regression threshold policy
out_of_scope:
  - 用 LLM 直接决定安全关键 pass/fail
  - 人工主观覆盖硬失败
required_contracts:
  - docs/standards/semantic-acceptance.md
  - docs/standards/quality-scoring.md
verification:
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 每个测试样本都有维度评分和失败原因
  - 安全、JSON 合同、幻觉命令为硬失败维度
  - 报告可被自动化用于 needs-fix 判定
```

### P3-001: VS Code/UI 消费统一 JSON contract

```yaml
id: P3-001
priority: P3
status: todo
depends_on:
  - P0-006
  - P1-005
  - P1-010
evidence:
  - level: product_decision
    source: docs/design/nl-workflow-orchestrator-product-design.md
    fact: >
      UI 后续应消费统一 NL plan / workflow draft JSON，而不是解析人类日志或复制 CLI 业务逻辑。
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

### P3-002: CLI draft review / confirm UX

```yaml
id: P3-002
priority: P3
status: todo
depends_on:
  - P1-007
  - P1-009
  - P1-013
evidence:
  - level: contract_target
    source: docs/contracts/workflow-draft.md
    fact: >
      WorkflowDraft 应支持 review、confirm、persist、execute、rerun、recover。
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      主产品入口应让复杂任务先形成可审查计划和 workflow draft，再确认执行。
source_docs:
  - docs/contracts/workflow-draft.md
  - docs/usage.md
goal: >
  为本地 CLI 用户提供最小 draft review、confirm、execute、list、detail 体验，让主链路不依赖 UI 才可用。
scope:
  - CLI review output
  - confirm command/path
  - draft list/detail affordance
  - execution handoff wording
out_of_scope:
  - VS Code UI
  - Web dashboard
  - 多用户审批
required_contracts:
  - docs/contracts/workflow-draft.md
  - docs/contracts/cli-command-surface.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - scripts/test-semantic-output.sh
  - git diff --check
done_criteria:
  - 用户能在 CLI 中看清步骤、风险、确认要求和下一步
  - confirm 后才允许执行有副作用 draft
  - --json 与 human output 不互相污染
```

### P3-003: Backlog automation runner / report hardening

```yaml
id: P3-003
priority: P3
status: todo
depends_on:
  - P1-011
  - P2-014
evidence:
  - level: automation_need
    source: docs/development-backlog.md
    fact: >
      自动化任务需要按 backlog 顺序选择、开发、审计、验证、修复和提交，且不能并行领取多个 item。
source_docs:
  - docs/development-backlog.md
  - docs/standards/verification-gates.md
goal: >
  将本文的自动化执行协议固化为可复用 runner 或报告规范，让其他项目可以直接复用同样的开发-审计-验证-提交流程。
scope:
  - backlog selection dry-run
  - status transition validation
  - verification evidence report
  - unrelated dirty file guard
out_of_scope:
  - 替代 Trae Solo / Codex
  - 自动合并远程分支
  - 绕过人工权限审批
required_contracts:
  - docs/standards/verification-gates.md
verification:
  - npm run typecheck
  - npm run lint
  - npm run test:run
  - git diff --check
done_criteria:
  - runner/report 能明确当前选择的唯一 backlog item
  - 有 in-progress 时不会领取新任务
  - 验证失败会生成 needs-fix 证据而不是提交
```

### P4-001: Secondary 能力是否恢复主线评估

```yaml
id: P4-001
priority: P4
status: todo
depends_on:
  - P1-013
  - P2-011
evidence:
  - level: product_decision
    source: docs/design/module-scope-cleanup.md
    fact: >
      service、daemon、templates、schedule、monitor、debug 当前不作为 NL Workflow Orchestrator 主产品面。
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

### P4-002: Custom rule / skill / MCP ecosystem 重新评估

```yaml
id: P4-002
priority: P4
status: todo
depends_on:
  - P1-002
  - P2-005
  - P2-007
  - P2-013
evidence:
  - level: product_decision
    source: docs/design/hybrid-ai-nl-engine.md
    fact: >
      当前非目标包括一次性实现 MCP marketplace 或社区 skill 生态。
  - level: product_decision
    source: docs/nl-workflow-orchestrator.md
    fact: >
      当前阶段不建议把 VectaHub 描述成通用 MCP marketplace 或多 agent swarm supervisor。
source_docs:
  - docs/design/hybrid-ai-nl-engine.md
  - docs/nl-workflow-orchestrator.md
goal: >
  在核心编排链路稳定后，重新评估 custom rule、skill 和 MCP 是否进入产品路线，以及需要哪些安全、合同、审计和测试前置条件。
scope:
  - ecosystem readiness assessment
  - permission and contract gap list
  - keep/defer/reject decision
out_of_scope:
  - 直接实现 MCP marketplace
  - 直接开放第三方 skill 执行
  - 自动安装外部插件
required_contracts:
  - docs/contracts/tools-security-management.md
  - docs/contracts/security-permission-loop.md
verification:
  - Markdown link check
  - Markdown fence check
  - git diff --check -- docs
done_criteria:
  - custom rule、skill、MCP 各自有明确进入条件
  - 未满足安全和验证前置条件时保持 defer
```

## 自动化执行协议

自动化任务每轮应执行：

```text
1. git status --short
2. 读取 docs/development-backlog.md
3. 复核已标记 done 但带 review_findings.status=needs-fix 的任务：
   - 必须视为 needs-fix
   - 不得继续跳过
4. 检查 in-progress:<timestamp> 任务：
   - 时间戳超过 30 分钟 → 重置为 todo
   - 未超时 → 继续该任务
5. 如果无有效 in-progress：
   - 优先选择 needs-fix（最高优先级）
   - 否则选择 todo（最高优先级）
6. 将选中任务状态改为 in-progress:<当前时间>
7. 开发最小实现
8. 自审：事实依据、合同、范围、安全、测试、JSON、trace、recovery、semantic acceptance
9. 运行该任务 verification 中列出的命令
10. 失败则修复，最多 3 轮
11. 仍失败则改为 needs-fix 或 blocked，并记录失败证据
12. 通过后将任务改为 done，并记录验证结果
13. 只 stage 本轮相关文件
14. git commit
```

如果工作树在开始时已有无关改动，自动化必须避免提交无关文件；无法区分时停止并报告。

## 跨项目复用规则

要把本文用于其他项目，应保留以下结构：

- 事实依据表。
- 证据等级。
- 使用规则。
- 多 subagent 协作规则。
- 工程标准。
- 状态模型。
- 优先级规则。
- 任务字段规范。
- 自动化执行协议。

迁移时必须替换：

- `source_docs` 和 `required_contracts`。
- 源码路径证据。
- verification 命令。
- 产品主链路名称。
- P4 secondary 能力列表。

不得直接复用：

- 本项目特有命令名，除非目标项目确实存在。
- 本项目特有 Agent runtime，除非目标项目已经实现。
- 本项目的安全结论，除非目标项目有等价安全合同和测试。
