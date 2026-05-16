# 测试指南

本文说明 VectaHub 维护者应如何选择和运行测试。测试标准和覆盖目标见仓库根目录 `AGENTS.md`。

## 基础检查

类型检查：

```bash
npm run typecheck
```

lint：

```bash
npm run lint
```

当前 `lint` 脚本等同于 `tsc --noEmit`。

全量测试：

```bash
npm run test:run
```

开发时 watch 测试：

```bash
npm test
```

## 定向测试

使用 Vitest 直接运行相关测试文件：

```bash
npx vitest run src/workflow/executor.test.ts
npx vitest run src/commands/run-task.test.ts
```

如果只改共享合同包，优先运行对应 workspace 或包内测试。

## VS Code extension 检查

编译插件：

```bash
npm run compile:extension
```

打包 VSIX：

```bash
npm run package:vsix
```

部分插件测试可能依赖 VS Code 运行时。如果纯 Node 环境缺少 `vscode` 包，应把它记录为环境问题，不能伪装成业务逻辑回归。

## 本地 CLI 运行约定

本文中的本地命令测试默认在仓库根目录执行，优先使用开发态 CLI 入口：

```bash
npm run dev -- <command>
```

只有在需要验证构建产物时，才切换到构建后的 CLI：

```bash
npm run build
node dist/cli.js <command>
```

这份文档的目标是让维护者直接复制命令执行，因此所有示例都不依赖全局安装的 `vectahub` 二进制。

占位符约定：

| 占位符 | 含义 |
|--------|------|
| `<docPath>` | 真实存在的开发文档路径，例如 `./docs/task.md` |
| `<taskId>` | 文档任务编号，例如 `T1` |
| `<taskLabel>` | 文档任务描述，例如 `补测试` |
| `<tool>` | Agent CLI 名称，例如 `codex`、`gemini`、`aider` |
| `<runId>` | 已产生的文档任务运行记录 ID |
| `<traceId>` | 已产生的 trace ID |

本文只覆盖核心执行链路，不展开低频管理命令的全量树状测试。以下命令不进入主测试矩阵，只在排障或补充说明时提及：

- `security add/update/delete/reset`
- `archive`
- `daemon`
- `templates`
- `config reset`

文中的 `--json` 断言以当前实现为准，不能只引用旧文档或 UI 描述推断行为。

## 核心命令测试矩阵

以下矩阵聚焦维护者本地最常用、最容易回归的核心链路。事实源优先级为：命令实现、CLI 规格、相关用户文档。

| 分类 | 本地命令 | 测试目的 | 前置条件 | 预期结果 / 关键断言 | 对应事实源 |
|------|----------|----------|----------|---------------------|------------|
| 环境健康 | `npm run dev -- doctor --json` | 验证本地 CLI 基础健康检查仍可运行 | 已安装依赖；在仓库根目录执行 | 返回结构化 JSON；包含 `ok`、`checks[]`、`summary`；`checks[]` 中应覆盖 Node.js、TypeScript、tsx、Vitest、目录结构检查 | `src/commands/doctor.ts`；`docs/usage.md` |
| 自然语言预览 | `npm run dev -- run --dry-run --json "查看 Git 状态"` | 验证自然语言入口的 dry-run 仍为零副作用 | 当前目录可读；已完成首次初始化；如需走 LLM 路径，还需已配置 LLM | stdout 应保持纯 JSON；若 LLM 或初始化前置条件缺失，允许返回结构化错误；成功时不执行真实命令 | `src/commands/run.ts`；`docs/usage.md` |
| 直接命令预览 | `npm run dev -- run-command --dry-run --json -- npm test` | 验证直接命令入口的安全扫描与 dry-run | `npm test` 在当前项目中可解析 | 返回 `ok=true`、`dryRun=true`、`command`、`security`；不执行真实命令 | `src/commands/run-command.ts`；`docs/usage.md` |
| 文档解析 | `npm run dev -- parse-doc <docPath> --json` | 验证文档任务解析仍输出结构化任务列表 | `<docPath>` 存在且可解析 | 返回 `ok=true`、`tasks[]`；每个任务至少包含 `id` 和 `label` | `src/commands/parse-doc.ts`；`docs/usage.md` |
| Agent 可用性 | `npm run dev -- tools agents --json` | 验证 Agent CLI 探测结果仍可供插件与脚本消费 | 已配置外部 Agent CLI，或至少存在默认配置项 | 返回 `ok=true`、`agents[]`；字段应覆盖 `installed`、`invocable`、`ready`、`configured_enabled`、`has_permission`；`ready` 不等于真实执行一定成功 | `src/commands/tools.ts`；`docs/specs/tools-security-management.md` |
| 文档任务合同预览 | `npm run dev -- run-task --task-id <taskId> --task-label "<taskLabel>" --doc <docPath> --contract-preview --json` | 验证合同摘要分支仍独立于 Agent 执行 | `<docPath>`、`<taskId>`、`<taskLabel>` 有效 | 不要求 `--tool`；返回 `ok=true`；`command` 与 `output` 为空；包含 `agentTaskContract`；不加载 LLM、不执行 Agent | `src/commands/run-task.ts`；`docs/specs/cli-command-surface.md` |
| 文档任务 dry-run | `npm run dev -- run-task --tool <tool> --task-id <taskId> --task-label "<taskLabel>" --doc <docPath> --dry-run --json` | 验证文档任务预览命令仍可生成且无副作用 | `<tool>` 已知且可调用；合同输入有效 | 要求提供 `--tool`；返回本地预览命令与 `agentTaskContract`；不执行 Agent，不写执行副作用 | `src/commands/run-task.ts`；`docs/specs/cli-command-surface.md` |
| 文档任务执行 | `npm run dev -- run-task --tool <tool> --task-id <taskId> --task-label "<taskLabel>" --doc <docPath> --json` | 验证真实执行路径与 JSON 收口语义 | `<tool>` 已就绪；文档任务合同可构建 | stdout 保持纯 JSON；重点观察 `ok`、`error`、`gitChanges`、`verification`、`agentTaskContract`，以及可选的 `failureKind`、`unclosedExecution`、`completionSignal`、`recoveryDecision`；文档需区分成功、失败、未收口执行三类观察点 | `src/commands/run-task.ts`；`docs/specs/run-task-execution-contract.md` |
| 运行记录查询 | `npm run dev -- doc-task-runs list --json`<br>`npm run dev -- doc-task-runs show <runId> --json`<br>`npm run dev -- doc-task-runs latest --json` | 验证执行后可从 run record 查询结果 | 如需稳定观察结果，建议先准备已知会写入 run record 的执行；`show` 需要真实 `<runId>` | `list` 返回 `ok`、`runs`、`hasMore`；`latest` 返回 `ok`、`tasks`；`show` 至少返回结构化 JSON，未命中时不应崩溃 | `src/commands/doc-task-runs.ts`；`docs/usage.md` |
| Trace 概览 | `npm run dev -- trace list --json` | 验证 trace 摘要查询仍可用 | 至少已有一次产生 trace 的执行 | 返回 `ok=true`、`traces[]`；可查看最近 trace 摘要 | `src/commands/trace.ts`；`docs/ui/trace-view.md` |
| Trace 明细 | `npm run dev -- trace show <traceId> --json` | 验证可按真实 traceId 查看 spans | 先通过 `trace list` 或运行结果拿到真实 `<traceId>` | 返回 `ok=true`、`traceId`、`spans[]`；`trace show` 场景必须先拿到真实 `traceId` | `src/commands/trace.ts`；`docs/specs/trace-execution.md` |
| 恢复执行 | `npm run dev -- recover-task --run-id <runId> --task-id <taskId> --task-label "<taskLabel>" --tool <tool> --doc <docPath> --trace-id <traceId> --json` | 验证恢复入口的结构化结果与 trace 关联 | 建议使用真实 `<runId>`、`<taskId>`、`<taskLabel>`、`<tool>` 和 `<traceId>`；缺少真实记录时也应返回结构化恢复决策 | 返回 `ok`、`decision`、`status`、`failureKind`；如果进入恢复链路，应生成新的 `recoveryTraceId`，不能覆盖原始 trace | `src/commands/recover-task.ts`；`docs/specs/recovery-loop.md` |
| 安全检测 | `npm run dev -- security test "rm -rf /" --json` | 验证安全检测命令的结构化输出 | 无特殊前置条件 | 返回 `ok=true`；输出 `isDangerous`、`severity`、`rule`、`matchedPattern` | `src/commands/security.ts`；`docs/usage.md` |
| VS Code 队列批处理入口 | `npm run dev -- run -f sys:process-diagnostic-queue --mode relaxed --json` | 验证 VS Code 诊断队列批处理按钮对应的真实 CLI 入口仍可执行 | 已完成首次初始化；如需观察实际处理效果，应先准备诊断队列数据 | stdout 应保持可解析；队列为空时应返回成功；若队列项执行失败，应返回结构化失败 | `src/commands/run.ts`；`docs/ui/project-task-workflows.md` |

## 真实场景回归

以下场景按“维护者在本地如何验证一条完整链路”组织，而不是按命令树组织。

### 1. 本地健康检查与 CLI 可用性

推荐命令：

```bash
npm run dev -- doctor --json
npm run dev -- tools agents --json
```

最短预期信号：

- `doctor --json` 返回 `ok`、`checks[]`、`summary`。
- 如果后续要执行文档任务，`tools agents --json` 至少应能返回 `agents[]` 供选择。

失败后去哪里看：

- 先看 [排障手册](./troubleshooting.md) 的“先运行诊断”和“Agent CLI 配置失败”。
- 再核对 `src/commands/doctor.ts` 与 `src/commands/tools.ts`。

### 2. 文档任务预览链路

推荐命令：

```bash
npm run dev -- parse-doc <docPath> --json
npm run dev -- run-task --task-id <taskId> --task-label "<taskLabel>" --doc <docPath> --contract-preview --json
npm run dev -- run-task --tool <tool> --task-id <taskId> --task-label "<taskLabel>" --doc <docPath> --dry-run --json
```

最短预期信号：

- `parse-doc` 能返回至少包含 `id` 和 `label` 的 `tasks[]`。
- `--contract-preview` 不要求 `--tool`，且能返回 `agentTaskContract`。
- `--dry-run` 要求 `--tool`，并返回本地预览命令，而不是执行 Agent。
- 如果是自然语言 `run --dry-run`，在未配置 LLM 或未完成首次初始化时，允许直接返回结构化错误。

失败后去哪里看：

- 先看 `tools agents --json` 判断 Agent 是否可调用。
- 再看 [排障手册](./troubleshooting.md) 的“`run-task` 卡住或超时”。

### 3. 文档任务执行后观测链路

推荐命令：

```bash
npm run dev -- run-task --tool <tool> --task-id <taskId> --task-label "<taskLabel>" --doc <docPath> --json
npm run dev -- doc-task-runs list --json
npm run dev -- doc-task-runs latest --json
npm run dev -- trace list --json
```

最短预期信号：

- `run-task --json` 的 stdout 保持纯 JSON。
- timeout 且无 git changes、无 verification 时，应观察到 `failureKind='timeout'`、`unclosedExecution=false`、`recoveryDecision.kind='retry_direct'`。
- timeout 且已有 git changes、无 verification 时，应观察到 `failureKind='timeout'`、`unclosedExecution=true`、`recoveryDecision.kind='suggest_fix'`。
- 失败路径不保证一定写入 `doc-task-runs`；如果当前实现没有 run record，至少应还能通过 `trace list/show` 观察执行链路。
- 如果本次执行写入了 trace，应能从 `trace list --json` 看到摘要。

失败后去哪里看：

- 先用 `doc-task-runs show <runId> --json` 定位单条运行记录。
- 再用 `trace list/show` 补链路细节。
- 最后回到 [排障手册](./troubleshooting.md) 对照失败症状。

### 4. 失败后 trace 定位与恢复链路

推荐命令：

```bash
npm run dev -- trace show <traceId> --json
npm run dev -- recover-task --run-id <runId> --task-id <taskId> --task-label "<taskLabel>" --tool <tool> --doc <docPath> --trace-id <traceId> --json
```

最短预期信号：

- `trace show` 能返回对应 `traceId` 的 `spans[]`。
- `recover-task` 会返回 `decision`、`status`、`failureKind`。
- 恢复链路应生成新的 `recoveryTraceId`，而不是覆写原始失败 trace。

失败后去哪里看：

- 先确认 `<runId>`、`<taskId>`、`<tool>`、`<traceId>` 是否来自真实失败记录；如果没有真实记录，也应至少观察结构化恢复决策是否合理。
- 再看 `doc-task-runs` 与 `trace list/show`。
- 恢复判断语义以 [排障手册](./troubleshooting.md) 和恢复相关规格为准。

### 5. VS Code 队列批处理链路

推荐命令：

```bash
npm run dev -- run -f sys:process-diagnostic-queue --mode relaxed --json
```

最短预期信号：

- 命令本身可从仓库根目录执行。
- 若 `VECTAHUB_HOME` 还是全新状态，可能先触发首次初始化；完成初始化后，命令应返回可解析结果，队列为空时应成功，若队列项执行失败则应返回结构化失败。

失败后去哪里看：

- 如需确认队列内容，可额外运行 `npm run dev -- queue list --json`。
- 再看 [排障手册](./troubleshooting.md) 的“找不到历史、trace 或队列”。

## VS Code 按钮 -> CLI 命令映射

本节只记录已在当前文档或实现中具备权威依据的映射；没有权威参数的按钮统一标为 gap，不猜命令。

### 已确认映射

| UI 区域 | 按钮或动作 | 本地验证命令 | 依据 |
|---------|------------|--------------|------|
| 插件初始化 | 初始诊断 | `npm run dev -- doctor --json` | `docs/ui/vscode-extension.md`；`docs/design/plugin-cli-boundary.md` |
| 文档任务 | 解析文档任务 | `npm run dev -- parse-doc <docPath> --json` | `docs/ui/task-run-workflow.md`；`src/commands/parse-doc.ts` |
| 文档任务 | Agent 候选刷新 | `npm run dev -- tools agents --json` | `docs/design/vscode-ui-remediation-plan.md`；`src/commands/tools.ts` |
| 文档任务 | 执行单任务 / 启动全部任务 | `npm run dev -- run-task --tool <tool> --task-id <taskId> --task-label "<taskLabel>" --doc <docPath> --json` | `docs/ui/task-run-workflow.md`；`src/commands/run-task.ts` |
| 恢复入口 | 恢复失败任务 | `npm run dev -- recover-task --run-id <runId> --task-id <taskId> --task-label "<taskLabel>" --tool <tool> --doc <docPath> --trace-id <traceId> --json` | `docs/ui/recovery-workflow.md`；`src/commands/recover-task.ts` |
| Trace 查看 | 查看 trace 摘要 / 明细 | `npm run dev -- trace list --json`<br>`npm run dev -- trace show <traceId> --json` | `docs/ui/trace-view.md`；`src/commands/trace.ts` |
| 高级选项 | 安全检测 | `npm run dev -- security test "<command>" --json` | `docs/ui/vscode-extension.md`；`src/commands/security.ts` |
| 项目任务 | 诊断队列批量处理 | `npm run dev -- run -f sys:process-diagnostic-queue --mode relaxed --json` | `docs/ui/project-task-workflows.md`；`src/commands/run.ts` |
| 高级选项 | 工具查看 | `npm run dev -- tools list` | `docs/ui/vscode-extension.md`；`src/commands/tools.ts` |

### 文档已描述按钮但没有权威 CLI 参数的映射缺口

| 按钮或动作 | 当前状态 | 处理原则 |
|------------|----------|----------|
| 打开当前工作流 | 文档描述了入口，但未给出可直接复用的权威 CLI 参数组合 | 不猜命令；待补专门文档或实现引用 |
| 预览当前工作流 | 文档描述了入口，但未给出可直接复用的权威 CLI 参数组合 | 不猜命令；待补专门文档或实现引用 |
| Git 状态按钮 | UI 文档描述了按钮语义，但未给出权威 CLI 参数组合 | 不猜命令；待补专门文档或实现引用 |
| 打开插件设置 | 更像 VS Code UI 动作，不是当前文档中的权威 CLI 命令 | 不把 UI 动作伪装成 CLI 测试用例 |
| 安装 CLI | UI 文档描述了入口，但没有稳定到当前仓库命令面的权威参数组合 | 不猜命令；待补专门安装文档 |
| 配置 LLM | UI 文档描述了入口，但没有稳定到当前仓库命令面的权威参数组合 | 不猜命令；待补专门配置文档 |

## 文档任务链路测试重点

修改 `run-task`、doc task、trace、security、verification 或 recovery 时，应覆盖：

- `--contract-preview` 不加载 LLM、不执行 Agent。
- `--dry-run` 不执行 Agent，不写执行副作用。
- 正常执行路径能区分 adapter 和 fallback。
- Agent 软失败不会进入 verification。
- timeout 且已有 git changes 时保留副作用摘要。
- timeout 两个分支都要观察结构化收口：无变更重试建议、有变更修复建议。
- verification 失败能进入正确失败分类。
- `--json` stdout 保持纯 JSON。

## Workflow 测试重点

修改 workflow 执行器或 schema 时，应覆盖：

- `exec` 必须有 `cli`。
- `for_each` 必须有 `items` 和 `body`。
- `if` 必须有 `condition`。
- `parallel` 能处理空 body、全部成功和部分失败。
- `opencli` 必须有 `site` 和 `command`。
- `delegate` 必须有 `delegateTo` 和 `delegatePrompt`。
- strict 模式下失败步骤会阻断后续步骤。

## 文档验证

新增或修改文档时至少检查：

- 内部链接是否存在。
- 示例命令是否来自现有 CLI 或 `package.json`。
- 用户文档没有把计划中的能力写成已实现。
- 规格文档没有和源码或测试事实冲突。
