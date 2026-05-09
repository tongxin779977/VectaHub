# VectaHub 1.0 通用封装边界与校验方案

> 版本: 1.0.0
> 最后更新: 2026-05-09
> 状态: Agent 可执行开发边界文档

本文档用于约束 VectaHub 1.0 后续封装与重构工作。目标是只抽取已经存在明确重复、跨 CLI/VS 插件边界、可测试且能降低误用风险的通用层，避免 agent 执行时外溢功能、杜撰新系统或重写核心执行链路。

## 1. 执行原则

后续 agent 必须遵守：

1. 只封装已有能力，不发明新产品功能。
2. 优先抽协议、边界和纯函数，不优先拆核心执行器。
3. 每次只改一个清晰边界，配套测试后再进入下一项。
4. 不改变现有 CLI 命令语义，不破坏 VS 插件现有入口。
5. 新抽象必须有消费者；没有调用方的抽象不得新增。
6. P0 阶段不重写 `workflow engine`、`executor`、`sandbox`。

## 2. 当前可封装边界

### 2.1 ExecutionPlan 通用协议

现状：

- CLI 侧已有 `src/nl/capabilities/types.ts`。
- VS 插件侧已有 `packages/vectahub-vscode-extension/src/execution/plan.ts`。
- 两者语义相近，但类型不兼容。

允许目标：

- 收敛 CLI 与 VS 插件对执行计划的共同字段。
- 统一 preview/run/dry-run 所需 JSON 结构。
- 让 VS 插件消费 CLI 输出的标准 plan，不在插件侧重新推导业务计划。

禁止事项：

- 不允许把 VS Code API 引入 CLI 类型。
- 不允许让 CLI core 依赖插件包。
- 不允许删除插件现有 `ExecutionPlan`，P0 只能通过适配保持兼容。

真正使用的判断逻辑：

```text
如果一个 plan 字段同时被 CLI dry-run、CLI --json、VS preview/run 使用，才进入通用协议。
如果字段只服务 VS UI 展示，保留在插件侧。
如果字段只服务 CLI 内部执行，保留在 CLI 内部。
```

P0 验收：

- `node dist/cli.js run --dry-run --json "<intent>"` 输出中包含标准 plan。
- VS 插件预览可以读取标准 plan 的 `id/label/steps/userReport`。
- 旧插件 `intent/command/workflowFile` 三类计划仍可运行。

### 2.2 Goal Vocabulary

现状：

- `src/nl/core/input-normalizer.ts` 和 `src/nl/core/goal-parser.ts` 都维护了动作、领域、目标、范围词表。

允许目标：

- 新增 `src/nl/knowledge/goal-vocabulary.ts`。
- 将 action/domain/target/scope/successCriteria/conflictRules 收敛到单一词表文件。

禁止事项：

- 不允许把 workflow steps、shell 命令、LLM prompt 放入 vocabulary。
- 不允许为了某一句用户表达硬编码单独 intent。
- 不允许把 `git` 永久等同于 `github-actions`。

真正使用的判断逻辑：

```text
term -> normalizedTerm
normalizedTerms -> ParsedGoal
ParsedGoal -> Capability
```

领域冲突规则：

```text
git + actions/ci/workflow + failure -> github-actions 优先
git + commit/push/pull/branch/merge 且无 ci/failure -> git-workflow
repair + business noun 且无 ci/github evidence -> 不进入 github-actions
run + test/build/lint -> package-script 或 test domain
```

P0 验收输入：

```text
修复 git 上所有 actions 错误
把 CI 全部修绿
处理 GitHub 上失败的 workflow
提交代码
修复登录 bug
运行测试
```

预期：

- 前三条进入 CI/GitHub Actions 语义。
- `提交代码` 进入普通 Git 语义。
- `修复登录 bug` 不进入 GitHub Actions。
- `运行测试` 不进入 GitHub Actions。

### 2.3 Capability Router 框架

现状：

- 已有 `src/nl/capabilities/router.ts` 与多个 capability。
- 阈值定义在 `src/nl/core/goal-types.ts`。

允许目标：

- 固化 capability 注册、评分、冲突裁决。
- 将阈值集中管理。
- 保持 Goal/Capability 作为旧 NL processor 的前置层。

禁止事项：

- 不替代 `src/nl/core/coordinator.ts`。
- 不删除 `INTENT_TEMPLATES`。
- 不让 capability 直接执行 shell 命令。

真正使用的路由逻辑：

```text
top.score >= 0.70 且 top.score - second.score >= 0.08
  -> route = auto

0.50 <= top.score < 0.70 且 top.score - second.score >= 0.08
  -> route = preview

top.score - second.score < 0.08
  -> route = clarify

top.score < 0.50 或无匹配
  -> route = fallback
```

P0 CLI 执行规则：

```text
只有 route=auto 才接管旧链路。
route=preview/clarify/fallback 全部回退现有 NL processor。
```

P0 dry-run 规则：

```text
route=auto 且 --dry-run
  -> 展示 capability plan summary
不展示内部 stdout、裸 ID 列表、临时日志路径
```

### 2.4 UserReport 输出协议

现状：

- `src/nl/capabilities/user-report.ts` 已开始区分 plan 和用户展示。
- GitHub Actions 场景仍存在内部 ID/日志输出泄漏风险。

允许目标：

- 将输出分成 `internalOutput`、`debugOutput`、`userReport`。
- 普通文本只展示用户可理解的阶段与结果。
- `--json` 保留完整调试信息。

禁止事项：

- 不允许普通文本输出裸 Action run id 列表作为主结果。
- 不允许普通文本输出大段失败日志。
- 不允许把内部 echo step 当真实修复结果。

真正使用的输出判断：

```text
普通文本:
  只输出 title、phases、summary、nextActions、verification

--json:
  可输出 plan.steps、commands、internalOutput 标记、debug 信息

debug 模式:
  可输出内部 stdout/stderr，但必须标记来源
```

P0 验收：

```bash
node dist/cli.js run --dry-run "修复 git 上所有 actions 错误"
```

必须看到：

```text
执行计划
发现失败的 GitHub Actions
获取失败日志
分析失败原因
生成修复计划
执行验证
输出修复报告
```

不得只看到：

```text
1234567890
1234567891
```

### 2.5 DiagnosticQueue Schema

现状：

- CLI 有 `src/execution/queue-manager.ts`。
- VS 插件 `tasksView.ts` 直接读取 `diagnostic-queue.json` 并 `JSON.parse`。

允许目标：

- 定义 `DiagnosticTaskSchema` 和 `DiagnosticQueueSnapshot`。
- 插件通过 CLI JSON 或共享 schema 读取队列。

禁止事项：

- 不允许插件继续散落式假设队列字段。
- 不允许改动队列文件路径语义。
- 不允许改变已有 `DiagnosticTask` 基本字段含义。

真正使用的判断逻辑：

```text
如果字段影响 CLI 与插件共同展示或执行，进入 schema。
如果字段只是 CLI 内部处理状态，保留在 CLI 内部。
如果字段只是插件 UI 图标，保留在插件侧。
```

P1 验收：

- 队列 JSON 损坏时，CLI 和插件都给出可理解错误，不崩溃。
- 插件不直接使用 `any[]` 作为诊断任务类型。

### 2.6 ProjectContext Detector

现状：

- 插件侧已有 package manager、package scripts、workspace 检测。
- CLI Goal/Capability 也需要 cwd、package manager、git remote、CI provider。

允许目标：

- 抽纯 Node 检测逻辑到 `src/project/context-detector.ts`。
- VS 插件只传 workspace cwd。

禁止事项：

- 不允许 core 引入 `vscode`。
- 不允许 P0 强制完整检测所有上下文。
- 不允许因为检测失败阻断旧 NL fallback。

P0 最小上下文：

```typescript
{ cwd: process.cwd() }
```

P1/P2 可补：

```typescript
{
  packageManager,
  packageScripts,
  gitRemote,
  ciProvider
}
```

## 3. 不允许优先封装的区域

以下区域现在可以修 bug，但不允许以“通用封装”为名大范围重写：

- `src/workflow/engine.ts`
- `src/workflow/executor.ts`
- `src/sandbox/sandbox.ts`
- `src/nl/templates/index.ts`
- `src/cli.ts`

判断标准：

```text
如果改动会改变命令执行、安全判断、沙箱隔离、工作流调度语义，则不属于本封装计划。
```

## 4. 执行顺序

P0:

1. 抽 `goal-vocabulary.ts`。
2. 收敛 capability 阈值和裁决逻辑。
3. 固化 CLI 标准 `ExecutionPlan` JSON。
4. 扩展 `UserReport`，确保普通文本不泄漏内部输出。

P1:

1. DiagnosticQueue schema/client。
2. ProjectContext detector。
3. VS 插件消费 CLI 标准 plan JSON。

P2:

1. 拆 `run.ts` 中的自然语言 orchestration。
2. 拆 `templates/index.ts` 为 legacy template 与 capability metadata。
3. 评估 workflow executor 的 handler registry 与 command policy 分层。

## 5. Agent 执行校验清单

每个子任务执行前必须回答：

```text
1. 这个封装是否已有两个以上真实调用方？
2. 是否能用纯单元测试验证？
3. 是否改变 CLI 外部行为？
4. 是否引入新依赖？
5. 是否影响 sandbox/audit/workflow engine？
6. 失败时是否能完全回退旧链路？
```

判断：

- 任一问题不清楚，先停止并补测试或补设计说明。
- 涉及新依赖、破坏 API、重写执行链路，必须单独确认。

## 6. 必跑验证

P0 文档对应代码完成后必须运行：

```bash
npm run typecheck
npm exec -- vitest --run src/nl/core/input-normalizer.test.ts src/nl/core/goal-parser.test.ts
npm exec -- vitest --run src/nl/capabilities
npm exec -- vitest --run src/commands/run.goal-router.test.ts
npm exec -- vitest --run --exclude 'packages/vectahub-vscode-extension/src/test/**'
npm run build
```

如果改动 VS 插件：

```bash
npm run compile -w packages/vectahub-vscode-extension
npm run lint -w packages/vectahub-vscode-extension
```

## 7. 完成标准

必须同时满足：

1. 抽象有真实调用方。
2. 旧路径 fallback 可用。
3. CLI 普通文本输出不泄漏内部中间结果。
4. `--json` 输出足够调试。
5. VS 插件不重复推导 CLI 业务计划。
6. 不改变 workflow engine、executor、sandbox 的核心语义。
7. 所有新增逻辑有单元测试覆盖。
