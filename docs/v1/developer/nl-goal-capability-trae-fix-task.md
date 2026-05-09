# VectaHub NL Goal/Capability Trae 修复任务书

> 目的：修复当前 NL Goal/Capability P0 实现中的“结构已接入但执行语义不闭环”问题。
> 使用对象：Trae IDE agent。
> 执行方式：严格 TDD，先写失败测试，再实现，再验证。

## 1. 背景

当前实现已经搭建了：

- `Input Normalizer`
- `Goal Parser`
- `Capability Router`
- `ExecutionPlan`
- `plan-adapter`
- `run` 命令接入

但实现存在关键问题：

1. `ExecutionPlan` 中的 `internal` step 被转换成 `echo [internal] ...`，属于 placeholder，不是真实执行。
2. `github-actions-repair` plan 中 `fetch-logs` 使用字面量 `${runId}`，没有从 discover 输出中传递真实 run id。
3. 普通执行输出仍会打印 internal step stdout，`hideInternalStdout` 只影响 dry-run，不影响真实执行。
4. dry-run 报告过滤掉了关键阶段，只剩最后的 report 阶段。
5. `git-workflow` 对“提交代码”会自动执行 `git add .` 和默认 commit，风险过高。

本任务只修复这些语义问题，不扩展新 capability。

## 2. Reality Gate

必须遵守：

- 不允许用 `echo`、placeholder、stub 伪装完成执行步骤。
- 如果某个阶段当前无法真实执行，必须标记为 `preview-only` 或只用于 user report。
- `internal` step 不能转换为可执行 shell 命令。
- `userReport.hideInternalStdout` 必须同时影响 dry-run 和真实执行后的普通文本输出。
- JSON 输出可以包含完整 plan/step 信息；普通文本输出必须隐藏内部 stdout、裸 Action ID、临时日志路径和中间 JSON。

## 3. 本阶段目标

修复 P0 执行语义，不实现自动修复 GitHub Actions。

必须完成：

1. `internal` step 不再转换成 `echo`。
2. dry-run 展示完整阶段 label，但隐藏内部命令和 stdout。
3. 非 dry-run 普通输出尊重 `internalOutput=true`，不打印内部 stdout。
4. `git-workflow` 不得自动执行 `git add .` / `git commit`。
5. 补 CLI 或接近 CLI 层的失败测试，覆盖以上行为。

## 4. 非目标

本任务不做：

- 不实现自动修复 GitHub Actions。
- 不实现 `gh run list` 输出解析和批量 `gh run view`。
- 不改 workflow engine 执行模型。
- 不新增 capability。
- 不删除旧 `INTENT_TEMPLATES`。
- 不让 LLM 直接生成并执行 shell 命令。
- 不自动 commit/push。

## 5. 修改范围

优先限制在：

- `src/nl/capabilities/plan-adapter.ts`
- `src/nl/capabilities/user-report.ts`
- `src/nl/capabilities/github-actions-repair.ts`
- `src/nl/capabilities/git-workflow.ts`
- `src/commands/run.ts`
- `src/nl/capabilities/*.test.ts`
- `src/commands/run.goal-router.test.ts` 或新增 `src/commands/run.goal-output.test.ts`

如需修改其他文件，先说明原因。

## 6. Implementation Contract

### 6.1 ExecutionPlan 语义

- `ExecutionPlan` 是语义计划，不等于可直接执行命令列表。
- `type='command'` 且 `command` 完整、安全、无未满足数据依赖时，才可以适配为 `Step`。
- `type='internal'` 不得适配为 `echo` 或任何 shell 命令。
- `type='internal'` 只能用于 preview/report，除非有专门 runner 消费它。

### 6.2 GitHub Actions Repair

当前 P0 只允许做到：

- 识别用户目标。
- 生成 GitHub Actions repair 计划。
- dry-run 展示完整阶段。
- 真实执行时不得伪装已经诊断/修复/验证。

如果没有真实 runner，就必须明确告诉用户：

```text
当前已生成 GitHub Actions 修复计划。自动诊断和修复需要后续确认或专门 runner 支持。
```

### 6.3 用户输出

普通文本模式：

- 展示用户可理解的阶段和总结。
- 不展示 `internalOutput=true` 的 stdout。
- 不展示裸 Action ID 列表作为主结果。

JSON 模式：

- 可以包含完整 `ExecutionPlan`。
- 可以包含内部 command 和 step 信息。

### 6.4 Git Workflow

`git-workflow` 不得自动执行：

- `git add .`
- `git commit`
- `git push`

除非用户输入中有明确操作、明确 commit message，并且通过确认流程。

P0 推荐做法：

- 对普通 “提交代码” 降级为 preview/fallback。
- 或只生成 `git status` 只读步骤。

## 7. 必须先写的失败测试

先写测试，确认失败，再实现。

### 7.1 internal step 不转 echo

测试目标：

- `executionPlanToSteps(githubActionsRepairPlan)` 不应包含 `echo [internal] ...`。
- internal steps 应被跳过，或由 preview/report 消费。

断言示例：

```typescript
expect(steps.some(s => s.cli === 'echo' && s.args?.some(a => a.includes('[internal]')))).toBe(false);
```

### 7.2 dry-run 展示完整阶段

输入：

```text
修复 git 上所有 actions 错误
```

期望 dry-run 文本包含：

- 发现失败的 GitHub Actions
- 获取失败日志
- 分析失败原因
- 生成修复计划
- 执行验证
- 输出修复报告

同时不应展示：

- `gh run list`
- 裸 JSON
- 裸 Action ID 列表

### 7.3 普通输出隐藏 internal stdout

测试目标：

- 当 step 标记 `internalOutput=true` 时，普通文本结果不打印该 step output。
- JSON 模式可以保留完整 step output。

### 7.4 git-workflow 不自动提交

输入：

```text
提交代码
```

期望：

- 不生成 `git add .`
- 不生成 `git commit -m ${message:-chore: update}`
- 最多生成只读 preview，或回退旧链路。

## 8. 推荐实现顺序

1. 修改测试，先让失败暴露出来。
2. 修改 `plan-adapter.ts`：
   - 删除 `internal -> echo` 适配。
   - internal step 不进入 executable `Step[]`。
3. 修改 `user-report.ts`：
   - dry-run 阶段展示所有 `plan.steps.label`。
   - 隐藏命令和内部 stdout，而不是隐藏阶段。
4. 修改 `run.ts`：
   - 保存当前使用的 `ExecutionPlan`。
   - 普通输出时按 `internalOutput` 隐藏对应 step output。
   - capability plan 执行完成后输出 user report。
5. 修改 `git-workflow.ts`：
   - 移除自动 `git add .` / `git commit`。
   - 降级为只读 `git status` preview 或让 router 不自动选择。
6. 运行验证。

## 9. 验证命令

必须运行：

```bash
npm exec -- vitest --run src/nl/capabilities
npm exec -- vitest --run src/commands/run.goal-router.test.ts
npm run typecheck
```

如新增 CLI 输出测试，也必须运行对应测试文件。

## 10. 完成标准

必须同时满足：

1. 没有 `echo [internal] ...` 伪执行。
2. dry-run 展示完整阶段，但不展示内部命令。
3. 普通执行不打印 internal stdout。
4. “提交代码” 不会自动 `git add .` / `git commit`。
5. 新增测试先失败后通过。
6. `npm run typecheck` 通过。
7. 若仍不能真实诊断/修复 GitHub Actions，输出必须明确说明是 preview/计划阶段，不得暗示已经修复。
