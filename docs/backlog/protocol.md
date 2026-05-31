# Backlog Automation Protocol

> Document Status: Current Automation Protocol / Migration Contract
> Authority: Task selection, lock handling, status transitions, verification evidence, and multi-subagent workflow for `docs/backlog/items/*.md`.
> Last Verified: 2026-06-01

## Scope

This document is the authoritative protocol for the development backlog. Automation agents must read this file before selecting or modifying any backlog item.

Item state lives in `docs/backlog/items/<TASK_ID>.md`.

## Facts And Evidence

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

## Usage Rules

每轮自动化任务必须：

1. 读取本文和 `docs/backlog/items/*.md`，并为本轮生成唯一 `run_id`。
   - 在完成 lock availability scan 前，只允许扫描任务 `id`、`priority`、`status`、`depends_on`、`review_findings.status` 和 `lock` 字段。
   - 在完成 lock availability scan 前，不得把任何任务设为 selected task。
   - 对 active locked item，不得读取该任务的 `source_docs`、`required_contracts`、`scope`、`done_criteria` 或 `verification`。
2. 执行 lock consistency check：
   - `lock` 只能出现在 `status: in-progress:<timestamp>` 的任务块内。
   - 每个 `status: in-progress:<timestamp>` 任务必须有且只能有一个 `lock`。
   - 如果 `todo`、`needs-fix`、`blocked` 或 `done` 任务带有 `lock`，视为协议错误；自动化必须停止并报告，不得选择任务。
   - 如果某个 `in-progress` 任务缺少 `lock`，或同一任务块内存在多个 `lock`，视为协议错误；自动化必须停止并报告。
   - 多个不同任务同时处于 `in-progress` 是允许的；它表示多个自动化 run 正在处理不同 backlog item。
3. 执行 lock availability scan：
   - active lock 只占用当前任务；其他依赖已完成、未被锁定的 eligible item 仍可被本轮选择。
   - 如果某个 `in-progress:<timestamp>` 未超过 1 小时，或时间戳晚于当前时间，视为该任务 active locked。
   - 如果某个任务存在本地原子 claim 目录，视为该任务 claim locked；本轮不得选择它，除非该 claim 已按 stale claim 规则清理。
   - active locked item 必须标记为 unavailable；本轮不得选择它，不得读取它的开发上下文。
   - 只有设置该 lock 的同一个正在运行进程可以继续完成该任务；判定依据是进程内持有的 `run_id` 等于 `lock.run_id`，不是 `owner` 相同。
   - 每次定时触发都必须生成新的 `run_id`，因此不能接管已有 active lock。
   - 如果某个 `in-progress:<timestamp>` 超过 1 小时，视为 stale lock，按任务原始状态恢复为 `needs-fix` 或 `todo`，移除 `lock`，并记录 stale 证据。
   - 如果某个任务只有 claim 目录但没有 active `in-progress`，且 claim 目录超过 1 小时，视为 stale claim，可以移除该 claim 目录并继续选择。
   - 如果存在 active locked 或 claim locked item，但仍有其他依赖已满足的 `needs-fix` 或 `todo` 任务，本轮应跳过 locked item 并继续选择下一个可执行任务。
   - 如果所有可执行任务都被 active lock 或 claim lock 占用，或剩余任务都依赖未完成的 locked item，本轮输出 `locked_no_eligible_task` 并结束。
4. 复核 `done` 任务的完成证据；如果存在 `review_findings.status=needs-fix`、非稳定 commit、缺失必需验证或验证未严格通过，必须改回 `needs-fix`。
5. 在排除 active locked 和 claim locked item 后，优先选择 `status=needs-fix` 且存在未解决 `review_findings.status=needs-fix` 的任务。
6. 如果不存在可执行 review-fix 任务，选择 priority 最高、排序最靠前、依赖已完成且未被 active lock 或 claim lock 占用的普通 `needs-fix` 任务。
7. 如果不存在可执行 `needs-fix`，选择 priority 最高、排序最靠前、依赖已完成且未被 active lock 或 claim lock 占用的 `todo` 任务。
8. 写入 Markdown lock 前必须先执行 atomic claim：
   - claim path 必须使用 `$(git rev-parse --git-path vectahub-backlog-claims/<TASK_ID>)`。
   - 先确保 claim root 存在，再对选中任务执行原子 `mkdir <claim path>`。
   - 如果 `mkdir <claim path>` 失败，说明其他 run 已抢到该任务；本轮不得继续该任务，必须重新执行 lock availability scan 和任务选择。
   - `mkdir <claim path>` 成功后，必须在 claim 目录内写入 `claim.json`，内容包含 `task_id`、`run_id`、`owner`、`claimed_at`、`expires_at`。
   - 释放 claim 前必须读取 `claim.json`，只有 `claim.json.run_id` 等于本轮 `run_id` 时才能删除该 claim 目录。
   - atomic claim 成功前，不得修改该任务状态，不得读取该任务开发上下文。
9. atomic claim 成功并写入 `claim.json` 后必须重新读取选中任务的 item 文件，确认选中任务仍是 `todo` 或 `needs-fix`，没有 `lock`，且依赖仍已完成；如果状态已变化，释放本轮 claim，并重新执行 lock availability scan 和任务选择。
10. 将选中任务状态改为 `in-progress:<当前时间>`，并写入 `lock.owner`、`lock.run_id`、`lock.acquired_at`、`lock.expires_at` 和 `lock.previous_status`。
11. 写入 Markdown lock 后必须重新读取选中任务的 item 文件，确认该任务的 `lock.run_id` 等于本轮 `run_id`；如果不是，说明并发写入失败，本轮必须释放本轮 claim，停止或重新选择其他可执行任务，不得继续开发该任务。
12. 只有同时持有 atomic claim 和 matching Markdown lock 后，才能读取该任务上下文并开发。
13. 只开发这一项。
14. 完成后审计和验证。
15. 通过后将该项改为 `done`，记录验证命令和提交信息，移除 Markdown lock，并释放本轮 atomic claim。
16. 未通过则改为 `needs-fix` 或 `blocked`，记录失败证据，移除 Markdown lock，并释放本轮 atomic claim。

禁止：

- 一轮同时开发多个 backlog item。
- 接管其他 run 已锁定的 backlog item。
- 在没有 atomic claim 的情况下把 `needs-fix` 或 `todo` 改成 `in-progress`。
- atomic claim 失败后继续处理同一个 backlog item。
- 在存在 active locked item 时读取该 locked item 的 `source_docs`、`required_contracts`、`scope`、`done_criteria` 或 `verification`。
- 把 `status: in-progress:<timestamp>` 任务当作当前轮 selected task。
- 仅因为 `lock.owner` 与当前自动化名称相同就接管 active lock。
- 选择依赖未完成或依赖 active locked item 的下游任务。
- 在存在可执行 review-fix 任务时选择普通 `needs-fix` 或 `todo` 任务。
- 跳过 P0/P1 去做低优先级功能。
- 在依赖任务未完成时开发下游任务。
- 实现 `secondary` 或 `unsupported` 能力，除非 backlog 明确要求。
- 修改测试来掩盖失败。
- 绕过安全、JSON、trace、verification 或 semantic acceptance 合同。
- 把 `Target Design` 或 `Migration Contract` 写成当前已实现能力。

## 多 Subagent 协作规则

同一个自动化 run 内可以使用多个 subagent，但这些 subagent 必须围绕同一个 selected backlog item 工作。
同一个 run 内任务选择只能由一个 coordinator 完成一次；Developer、Audit、Verification 和 Commit/report subagent 不得再次执行任务选择规则。
不同自动化 run 可以并行领取不同 backlog item，前提是它们都通过 lock availability scan，且没有接管 active locked item。

推荐角色：

- Developer agent：实现当前 item 的最小闭环。
- Audit agent：审查合同、范围、安全、错误处理、JSON、trace 和测试覆盖。
- Verification agent：运行当前 item 的 verification 命令并整理证据。
- Commit/report agent：只在所有验证通过后 stage 当前 item 相关文件并提交。

禁止同一个自动化 run 内的不同 subagent 同时领取不同 backlog item。

## 工程标准

所有任务必须遵守：

- [开发者指南](../development.md)
- [质量评分标准](../standards/quality-scoring.md)
- [开发检查清单](../standards/development-checklists.md)
- [验证门禁标准](../standards/verification-gates.md)
- [语义验收标准](../standards/semantic-acceptance.md)

硬性约束：

- Production `any` 保持 0。
- 当前进程 production `console.*` 保持 0。
- `--json` stdout 必须保持单个纯 JSON 对象。
- LLM 输出不能绕过 schema、安全、命令面、workflow 或 verification 合同。
- Agent 成功不等于任务成功，必须由 verification closure 判定。
- 代码风格以现有 TypeScript、Commander、Vitest、dependency injection 和 infrastructure patterns 为准。

## 状态模型

Active lock 是单任务独占锁。新的自动化实例不能接管 active `in-progress` 任务，也不能读取该任务的开发上下文；但可以跳过该 locked item，并继续选择其他依赖已完成、未被锁定的 eligible item。只有进程内持有相同 `run_id` 的原始执行进程可以继续完成并移除该锁。

| Status | 含义 | 跨 session 行为 |
|--------|------|-----------------|
| `todo` | 待开发，可被自动化选择。 | 直接选择。 |
| `in-progress:<timestamp>` | 当前轮正在开发；时间戳格式 `YYYY-MM-DDTHH:MM`。 | 未超时或时间戳晚于当前时间时是 active locked item；新的自动化实例必须跳过该 item，不得读取上下文、继续或重复选择；如果还有其他 eligible item，可以继续领取其他任务。 |
| `needs-fix` | 已开发但审计、验证或后续复审失败，需要修复。 | 优先于 `todo` 选择；其中未解决 `review_findings.status=needs-fix` 的 review-fix 任务优先于普通 `needs-fix`。 |
| `blocked` | 缺少合同、权限、环境或产品决策，不能继续。 | 跳过。 |
| `done` | 开发、审计、验证和提交均完成。 | 跳过；如果后续复审发现不满足 `done_criteria`，必须改回 `needs-fix` 并记录复审证据。 |

### 状态转换规则

- `todo` → `in-progress:<now>`：开始开发时。
- `needs-fix` → `in-progress:<now>`：开始修复时。
- `in-progress:<ts>` → `todo`：超过 1 小时未完成且 `lock.previous_status=todo`，视为 stale lock 自动重置。
- `in-progress:<ts>` → `needs-fix`：超过 1 小时未完成且 `lock.previous_status=needs-fix` 或存在 `review_findings.status=needs-fix`，视为 stale lock 自动重置。
- `in-progress:<ts>` → `needs-fix`：审计或验证失败。
- `in-progress:<ts>` → `done`：全部验证通过。
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

如果任务进入 `in-progress`，应追加临时锁：

进入 `in-progress` 前必须先持有本地 atomic claim。claim 目录不写入仓库，路径固定为：

```text
$(git rev-parse --git-path vectahub-backlog-claims/<TASK_ID>)
```

claim 目录必须通过原子 `mkdir <claim path>` 创建。创建失败表示其他 run 已领取该任务；当前 run 必须跳过该任务并重新选择。
创建成功后必须写入 `<claim path>/claim.json`，内容包含 `task_id`、`run_id`、`owner`、`claimed_at`、`expires_at`。释放 claim 前必须读取 `claim.json`，只有 `claim.json.run_id` 等于本轮 `run_id` 时才能删除该 claim 目录。

```yaml
lock:
  owner: <automation-name>
  run_id: <unique-run-id>
  acquired_at: YYYY-MM-DDTHH:MM
  expires_at: YYYY-MM-DDTHH:MM
  previous_status: todo
```

`lock` 只允许和 `status: in-progress:<timestamp>` 同时存在；每个 `in-progress` 任务必须有且只能有一个 `lock`。任务完成、失败或阻塞后必须移除 `lock`。

如果任务完成，应追加：

```yaml
completion:
  verified_at: YYYY-MM-DDTHH:MM
  commit: <stable-commit-sha>
  verification_results:
    - npm run typecheck: pass
```

完成证据必须满足：

- `commit` 必须是稳定 commit hash；`HEAD`、`pending`、空值或描述性文本都不是完成证据。
- `verification_results` 必须覆盖该任务 `verification` 列表中的每一条必需命令。
- 必需命令失败、跳过、只检查 modified files、或只记录非标准命令别名时，不能标记为 `done`。
- 如果后续复审发现完成证据不满足以上规则，必须把任务状态改为 `needs-fix` 并追加 `review_findings`。

如果任务被复审打回，应追加：

```yaml
review_findings:
  reviewed_at: YYYY-MM-DDTHH:MM
  status: needs-fix
  findings:
    - severity: P1
      location: <file-or-doc-reference>
      reason: >
        说明不满足哪个 done_criteria、合同或验证要求。
      required_fix: >
        说明下一轮必须完成的修复。
```

`review_findings.status=needs-fix` 表示审查发现的问题仍未解决。只要任务本身是 `needs-fix`，下一轮自动化必须先修这类 review-fix 任务，再处理普通 `needs-fix` 或 `todo`。

## Automation Execution Protocol

自动化任务每轮应执行：

```text
1. git status --short
2. 生成本轮唯一 run_id，并读取 docs/backlog/protocol.md 和 docs/backlog/items/*.md
   - 完成 lock availability scan 前，只允许扫描任务 id / priority / status / depends_on / review_findings.status / lock
   - 完成 lock availability scan 前，不得设置 selected task
   - 对 active locked item，不得读取该任务的 source_docs / required_contracts / scope / done_criteria / verification
3. 执行 lock consistency check：
   - lock 只能出现在 status=in-progress:<timestamp> 的任务块内
   - 每个 in-progress 任务必须有且只能有一个 lock
   - todo / needs-fix / blocked / done 任务带 lock → protocol_error，停止报告
   - 单个 in-progress 任务缺少 lock，或同一任务块内存在多个 lock → protocol_error，停止报告
   - 多个不同任务同时 in-progress 是允许的，表示不同自动化 run 正在处理不同 item
4. 执行 lock availability scan：
   - active lock 只占用当前任务；其他依赖已完成、未被锁定的 eligible item 仍可被本轮选择
   - 某个 in-progress:<timestamp> 未超过 1 小时，或 timestamp 晚于当前时间 → 该任务是 active locked item
   - 某个任务存在本地 atomic claim 目录 → 该任务是 claim locked item，除非该 claim 已超过 1 小时并按 stale claim 清理
   - active locked item 必须标记为 unavailable
   - 不得继续 active locked item
   - 不得读取 active locked item 的 source_docs / required_contracts / scope / done_criteria / verification
   - 新的定时触发即使 automation name / branch / owner 相同，也不是原始持锁进程
   - 只有进程内持有的 run_id 等于 lock.run_id 的原始持锁进程可以完成该任务并移除 lock
   - in-progress:<timestamp> 超过 1 小时 → stale lock，按 lock.previous_status 恢复为 needs-fix 或 todo，移除 lock，并记录 stale 证据
   - 只有 atomic claim 目录但没有 active in-progress，且 claim 目录超过 1 小时 → stale claim，可以移除 claim 目录并继续选择
   - 如果存在 active locked 或 claim locked item，但仍有其他依赖已完成的 needs-fix 或 todo 任务，本轮必须跳过 locked item 并继续选择下一个 eligible item
   - 如果所有 eligible item 都被 active lock 或 claim lock 占用，或剩余任务都依赖未完成的 locked item，本轮输出 locked_no_eligible_task 并结束
5. 复核已标记 done 但带 review_findings.status=needs-fix 的任务：
   - 必须视为 needs-fix
   - 不得继续跳过
6. 在排除 active locked 和 claim locked item 后，优先选择 status=needs-fix 且存在未解决 review_findings.status=needs-fix 的任务
7. 如果没有可执行 review-fix 任务，选择依赖已完成且未被 active lock 或 claim lock 占用的普通 needs-fix（最高优先级）
8. 如果没有可执行 needs-fix，选择依赖已完成且未被 active lock 或 claim lock 占用的 todo（最高优先级）
9. 写入 Markdown lock 前必须先执行 atomic claim：
   - claim path 必须使用 $(git rev-parse --git-path vectahub-backlog-claims/<TASK_ID>)
   - 先确保 claim root 存在，再对选中任务执行原子 mkdir <claim path>
   - 如果 mkdir <claim path> 失败，说明其他 run 已抢到该任务；本轮不得继续该任务，必须重新执行 lock availability scan 和任务选择
   - mkdir <claim path> 成功后，必须写入 <claim path>/claim.json，内容包含 task_id、run_id、owner、claimed_at、expires_at
   - 释放 claim 前必须读取 claim.json，只有 claim.json.run_id 等于本轮 run_id 时才能删除该 claim 目录
   - atomic claim 成功前，不得修改该任务状态，不得读取该任务 source_docs / required_contracts / scope / done_criteria / verification
10. atomic claim 成功并写入 claim.json 后必须重新读取选中任务的 item 文件，确认选中任务仍是 todo 或 needs-fix，没有 lock，且依赖仍已完成；如果状态已变化，释放本轮 claim，并重新执行 lock availability scan 和任务选择
11. 将选中任务状态改为 in-progress:<当前时间>，并写入 lock.owner、lock.run_id、lock.acquired_at、lock.expires_at、lock.previous_status
12. 写入 Markdown lock 后必须重新读取选中任务的 item 文件，确认该任务的 lock.run_id 等于本轮 run_id；如果不是，说明并发写入失败，本轮必须释放本轮 claim，停止或重新选择其他 eligible item，不得继续开发该任务
13. 只有同时持有 atomic claim 和 matching Markdown lock 后，才能读取该任务上下文并开发
14. 开发最小实现
15. 自审：事实依据、合同、范围、安全、测试、JSON、trace、recovery、semantic acceptance
16. 运行该任务 verification 中列出的命令
17. 失败则修复，最多 3 轮
18. 仍失败则改为 needs-fix 或 blocked，记录失败证据，移除 Markdown lock，并释放本轮 atomic claim
19. 通过后将任务改为 done，记录验证结果，移除 Markdown lock，并释放本轮 atomic claim
20. 只 stage 本轮相关文件
21. git commit
```

如果工作树在开始时已有无关改动，自动化必须避免提交无关文件；无法区分时停止并报告。
