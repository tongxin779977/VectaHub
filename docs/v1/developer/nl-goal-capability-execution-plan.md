# VectaHub 1.0 NL Goal/Capability 开发执行方案

> 版本: 1.0.0
> 最后更新: 2026-05-09
> 状态: Agent 可执行开发文档

本文档用于指导 agent 改造 VectaHub 1.0 的自然语言理解链路，使用户输入不再依赖单句关键词硬匹配，而是通过 `Input Normalizer -> Goal Parser -> Capability Router -> ExecutionPlan -> User Report` 形成稳定闭环。

## 1. 背景与问题

当前自然语言链路主要由以下代码组成：

- `src/commands/run.ts`: CLI 入口，接收自然语言并调用 NL processor。
- `src/nl/core/pipeline.ts`: LLM tool calling、skill pipeline、keyword fallback 的编排入口。
- `src/nl/core/matching-pipeline.ts`: 基于关键词、短语、CLI 名称和负向词计算 intent 置信度。
- `src/nl/templates/index.ts`: intent 模板、关键词、短语和默认 steps。
- `src/nl/tool-calling.ts`: 将 intent templates 暴露为 LLM tools。
- `src/workflow/system-workflows.ts`: 系统工作流，例如 GitHub Actions 失败记录同步与诊断队列处理。
- `templates/gh-auto-process-all.yaml`: 批量处理 GitHub Actions 失败项的 YAML 模板。
- `packages/vectahub-vscode-extension/src/commands/fetchGhErrors.ts`: VS Code 插件拉取 GitHub Actions 错误。
- `packages/vectahub-vscode-extension/src/commands/processAllQueue.ts`: VS Code 插件处理诊断队列。

已暴露的问题：

用户输入“修复 git 上所有 actions 错误”时，系统可能只执行 `gh run list` 并把一组 Action run id 作为主要输出返回。这个结果说明系统只完成了“发现失败项”，没有完成“诊断、修复、验证、报告”的业务闭环。

根因不是某一句话缺少关键词，而是当前架构缺少通用的语义中间层。系统应该先理解用户目标，再根据目标路由到能力，而不是从原始文本直接跳到 intent template。

## 2. 目标架构

目标链路：

```text
用户输入
  -> Input Normalizer
  -> Goal Parser
  -> Capability Router
  -> ExecutionPlan Builder
  -> Workflow Engine / Direct Runner
  -> User Report
```

各层职责：

| 层 | 职责 | 不应承担的职责 |
|----|------|----------------|
| Input Normalizer | 清洗输入、提取词元、同义词归一化、提取 ID/URL/路径/日志片段 | 不决定执行哪个 workflow |
| Goal Parser | 提取 action、domain、target、scope、constraints、successCriteria | 不生成 shell 命令 |
| Capability Router | 根据 goal 和项目上下文选择能力 | 不解析原始自然语言 |
| ExecutionPlan Builder | 把能力计划转为可预览、可执行、可验证的结构 | 不直接把内部 stdout 当用户输出 |
| User Report | 汇总业务结果、隐藏内部中间输出 | 不影响后续步骤数据流 |

`INTENT_TEMPLATES` 保留为 fallback 和兼容层，不作为唯一主入口。

## 3. 新增核心类型

新增文件：`src/nl/core/goal-types.ts`

```typescript
export type GoalAction =
  | 'repair'
  | 'analyze'
  | 'run'
  | 'create'
  | 'delete'
  | 'search'
  | 'explain'
  | 'unknown';

export type GoalScope =
  | 'all'
  | 'selected'
  | 'current'
  | 'latest'
  | 'unknown';

export interface NormalizedInput {
  rawText: string;
  cleanText: string;
  tokens: string[];
  normalizedTerms: string[];
  entities: {
    githubActionRunIds?: string[];
    githubActionUrls?: string[];
    filePaths?: string[];
    commitShas?: string[];
    packageScripts?: string[];
  };
}

export interface ParsedGoal {
  action: GoalAction;
  domains: string[];
  target?: string;
  scope: GoalScope;
  successCriteria: string[];
  constraints: string[];
  evidence: NormalizedInput['entities'];
  confidence: number;
  needsClarification: boolean;
}
```

## 4. P0 任务卡

### P0-1: 输入标准化

修改范围：

- 新增 `src/nl/core/input-normalizer.ts`
- 新增 `src/nl/core/input-normalizer.test.ts`
- 新增或更新 `src/nl/core/index.ts`

开发要求：

1. 实现 `normalizeInput(input: string): NormalizedInput`。
2. 提取 GitHub Actions run URL：`github.com/<owner>/<repo>/actions/runs/<id>`。
3. 提取长数字 run id，但不能把所有数字都当 action id；仅在文本包含 `actions`、`workflow`、`ci`、`github`、`gh` 等上下文时提取。
4. 提取文件路径、commit SHA。
5. 同义词归一化：
   - `修复`、`处理`、`解决`、`搞定`、`弄好`、`fix`、`resolve` -> `repair`
   - `错误`、`失败`、`挂了`、`红了`、`不通过`、`failed`、`error` -> `failure`
   - `actions`、`workflow`、`checks`、`pipeline`、`ci` -> `ci`
   - `github`、`gh`、`git 上` -> `github`
   - `所有`、`全部`、`all` -> `all`

验收测试：

- `normalizeInput('修复 git 上所有 actions 错误')` 包含 `repair/github/ci/failure/all`。
- `normalizeInput('修复登录 bug')` 不应包含 `ci`。
- `normalizeInput('分析 https://github.com/a/b/actions/runs/1234567890')` 提取 run id。

### P0-2: Goal Parser

修改范围：

- 新增 `src/nl/core/goal-parser.ts`
- 新增 `src/nl/core/goal-parser.test.ts`
- 更新 `src/nl/core/index.ts`

开发要求：

1. 实现 `parseGoal(input: string | NormalizedInput): ParsedGoal`。
2. `action` 从 normalized terms 推断。
3. `domains` 从 normalized terms 推断，支持 `github-actions`、`ci`、`git`、`npm`、`file`、`workflow`。
4. 当文本同时包含 `git/github` 和 `actions/ci/workflow failure` 时，优先归一到 `github-actions`，不得误判为普通 `GIT_WORKFLOW`。
5. `scope` 从 `所有/全部/all/这些/当前/最新` 推断。
6. `needsClarification` 只在 action 或 target 缺失时置 true。

验收测试：

| 输入 | 期望 |
|------|------|
| `修复 git 上所有 actions 错误` | `action=repair`, `domains` 包含 `github-actions`, `target=failure`, `scope=all` |
| `把 CI 全部修绿` | `action=repair`, `domains` 包含 `ci`, `scope=all`, `successCriteria` 包含 `ci-green` |
| `提交代码` | `domains` 包含 `git`, 不包含 `github-actions` |
| `修复登录 bug` | `action=repair`, 不路由到 `github-actions` |
| `运行测试` | `action=run`, `domains` 包含 `npm` 或 `test` |

### P0-3: Capability Router

修改范围：

- 新增 `src/nl/capabilities/types.ts`
- 新增 `src/nl/capabilities/router.ts`
- 新增 `src/nl/capabilities/github-actions-repair.ts`
- 新增 `src/nl/capabilities/git-workflow.ts`
- 新增 `src/nl/capabilities/package-script.ts`
- 新增对应测试文件

核心接口：

```typescript
export interface CapabilityMatch {
  capabilityId: string;
  score: number;
  reason: string;
}

export interface Capability {
  id: string;
  canHandle(goal: ParsedGoal, context?: ProjectContext): CapabilityMatch;
  plan(goal: ParsedGoal, context?: ProjectContext): ExecutionPlan;
}
```

开发要求：

1. `github-actions-repair` 处理 `action=repair` 且 domain 包含 `github-actions` 或 `ci` 且 target 为 `failure` 的目标。
2. `git-workflow` 只处理 commit、push、pull、branch、merge 等普通 Git 操作。
3. `package-script` 处理测试、构建、lint、package script。
4. Router 返回最高分能力；分差小于 0.08 时返回 `needsClarification`。
5. `git 上 actions 错误` 中的 `git` 只能作为平台提示，不得使 `git-workflow` 胜出。

验收测试：

- `修复 git 上所有 actions 错误` -> `github-actions-repair`
- `把 CI 全部修绿` -> `github-actions-repair` 或通用 `ci-repair`
- `提交代码` -> `git-workflow`
- `修复登录 bug` -> 不应命中 `github-actions-repair`

### P0-4: ExecutionPlan 与用户报告

修改范围：

- 新增或复用 `src/nl/capabilities/types.ts` 中的 `ExecutionPlan`
- 新增 `src/nl/capabilities/user-report.ts`
- 更新 `src/commands/run.ts`
- 必要时更新 `packages/vectahub-vscode-extension/src/execution/plan.ts`

ExecutionPlan 最小结构：

```typescript
export interface ExecutionPlan {
  id: string;
  label: string;
  capabilityId: string;
  goal: ParsedGoal;
  steps: Array<{
    id: string;
    label: string;
    type: 'workflow' | 'command' | 'internal';
    command?: { cli: string; args: string[] };
    workflowFile?: string;
    internalOutput?: boolean;
  }>;
  userReport: {
    hideInternalStdout: boolean;
    summaryTemplate: string;
  };
}
```

开发要求：

1. `github-actions-repair.plan()` 不得把 `gh run list` 的 run id 作为主用户输出。
2. GitHub Actions 修复计划必须包含：
   - discover failures
   - fetch logs
   - diagnose failures
   - propose/apply repair
   - verify
   - report
3. 如果当前自动修复能力不足，应明确输出“已完成发现和诊断，修复需要人工确认”，不能伪装成已修复。
4. CLI JSON 输出应保留内部 step 信息；普通文本输出只展示用户报告。

验收测试：

- dry-run 输出显示“将发现并处理 GitHub Actions 失败项”，不直接显示裸 ID 列表。
- 执行失败时报告失败阶段和下一步，而不是只打印子命令 stderr。

### P0-5: 接入 `run` 命令

修改范围：

- 更新 `src/commands/run.ts`
- 更新 `src/commands/run.test.ts` 或新增 `src/commands/run.goal-router.test.ts`

接入顺序：

```text
file workflow
  -> explicit command/workflow
  -> Goal Parser + Capability Router
  -> LLM structured completion
  -> existing NL processor
  -> keyword fallback
```

开发要求：

1. `--file` 行为保持不变。
2. 自然语言输入先尝试 Goal/Capability。
3. 若 capability confidence 足够高，生成 ExecutionPlan。
4. 旧 `createNLProcessor()` 仍作为 fallback。
5. 不移除旧模板，避免破坏已有测试。

## 5. P1 任务卡

### P1-1: LLM 只做结构化补全

修改范围：

- `src/nl/llm.ts`
- `src/nl/prompt-manager.ts`
- `src/nl/tool-calling.ts`

要求：

1. LLM 输出优先为 `ParsedGoal` 或缺失槽位补全。
2. LLM 不直接决定 shell 命令。
3. 本地 capability router 对最终执行计划负责。

### P1-2: VS Code 插件接入同一计划链路

修改范围：

- `packages/vectahub-vscode-extension/src/commands/previewIntent.ts`
- `packages/vectahub-vscode-extension/src/commands/runIntent.ts`
- `packages/vectahub-vscode-extension/src/commands/fetchGhErrors.ts`
- `packages/vectahub-vscode-extension/src/commands/processAllQueue.ts`
- `packages/vectahub-vscode-extension/src/execution/*`

要求：

1. 插件预览和执行同一份 ExecutionPlan。
2. “获取 GitHub Actions 错误”和“一键处理诊断队列”逐步迁移为 `github-actions-repair` capability 的显式入口。
3. 插件输出面板显示用户报告，不把中间 ID 列表作为主结果。

## 6. P2 任务卡

1. 增加更多 capability：
   - `test-repair`
   - `dependency-repair`
   - `workflow-authoring`
   - `docs-maintenance`
2. 为 capability 增加项目上下文：
   - package manager
   - scripts
   - git remote
   - CI provider
   - workspace roots
3. 增加历史学习：
   - 用户确认过的路由结果可作为后续偏好。

## 7. 禁止事项

- 不要用新增几个关键词代替 Goal/Capability 架构。
- 不要删除现有 `INTENT_TEMPLATES`。
- 不要让 LLM 直接生成并执行危险 shell 命令。
- 不要把 `gh run list` 的裸 ID 列表作为普通用户主输出。
- 不要让 `git` 这个词在 `git 上 actions 错误` 场景中压过 `github-actions` 领域。
- 不要绕过现有 sandbox、audit、workflow engine。

## 8. 总体验证命令

```bash
npm run typecheck
npm exec -- vitest --run src/nl/core/input-normalizer.test.ts src/nl/core/goal-parser.test.ts
npm exec -- vitest --run src/nl/capabilities
npm exec -- vitest --run src/commands/run.goal-router.test.ts
npm exec -- vitest --run --exclude 'packages/vectahub-vscode-extension/src/test/**'
npm run build
npm run compile -w packages/vectahub-vscode-extension
```

如果修改 VS Code 插件：

```bash
npm run lint -w packages/vectahub-vscode-extension
npm test -w packages/vectahub-vscode-extension
```

## 9. 手工验收

在隔离 HOME 中执行：

```bash
export TEST_ROOT=/tmp/vectahub-nl-goal
export HOME="$TEST_ROOT/home"
export VECTAHUB_HOME="$TEST_ROOT/home/.vectahub"
mkdir -p "$HOME" "$VECTAHUB_HOME"
```

手工用例：

```bash
node dist/cli.js run --dry-run "修复 git 上所有 actions 错误"
node dist/cli.js run --dry-run "把 CI 全部修绿"
node dist/cli.js run --dry-run "处理 GitHub 上失败的 workflow"
node dist/cli.js run --dry-run "分析最新失败的 action"
node dist/cli.js run --dry-run "提交代码"
node dist/cli.js run --dry-run "修复登录 bug"
node dist/cli.js run --dry-run "运行测试"
```

验收标准：

- CI/GitHub Actions 相关表达稳定进入对应 capability。
- 普通 Git 操作仍进入 Git workflow。
- 普通业务 bug 修复不误进 GitHub Actions。
- 用户输出包含计划摘要和阶段说明。
- 内部 ID、stdout、日志路径仅在 debug/json 模式展示。

## 10. 完成标准

P0 完成需要同时满足：

1. 新增 Goal Parser、Input Normalizer、Capability Router。
2. `修复 git 上所有 actions 错误` 不再只输出 Action ID。
3. 旧 keyword fallback 行为保持兼容。
4. 新增测试全部通过。
5. `npm run typecheck` 通过。
6. 文档 `docs/v1/developer/nl-architecture.md` 已同步更新。
