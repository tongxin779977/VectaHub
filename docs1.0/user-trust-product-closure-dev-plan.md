# VectaHub 1.0 用户信任闭环临时开发方案

> 临时开发文档。按本文执行完成、验证通过后删除。
> 目标: 把当前 VectaHub 从“功能集合”收敛成用户可预测、可信、低摩擦的本地开发任务工具。
> 范围: TypeScript CLI、VS Code 插件、1.0 用户文档和验收测试。

## 0. 执行原则

Agent 执行本文时必须遵守:

1. 不删除用户现有改动。
2. 不修改真实用户 `HOME` 或真实 `~/.vectahub`。
3. 所有测试使用隔离 `VECTAHUB_HOME`。
4. 先修 P0，再修 P1，不做无关重构。
5. 每一阶段完成后运行对应验证命令。
6. 如果验证失败，先记录失败点，不继续扩大改动范围。

## 1. 当前核心问题

从用户视角，当前项目最缺的是“信任闭环”:

- 预览看到的命令不一定就是实际执行的命令。
- CLI JSON 成功和失败输出协议不够统一。
- VS Code 插件配置项没有完全进入执行路径。
- package script、自然语言任务、YAML 工作流的边界不够清晰。
- 安全检测信息对用户不够直观。
- 用户验收测试还没有自动化基线。

## 2. 目标用户路径

最终用户主路径必须收敛为:

```text
安装/检测 → 预览计划 → 确认执行 → 查看结果 → 查看历史/审计 → 复用
```

所有功能都围绕这条路径服务。

## 3. P0 任务清单

P0 是必须先完成的阻断项。

| ID | 任务 | 目标 |
|----|------|------|
| P0-01 | 统一 ExecutionPlan | preview 和 run 使用同一份执行计划 |
| P0-02 | 修复插件 package script 执行 | package script 不再回退成自然语言 intent |
| P0-03 | 接入插件配置 | `executionMode`、`previewBeforeRun`、`cliPath` 生效 |
| P0-04 | 统一 CLI JSON 错误结构 | 插件和自动化能稳定识别失败 |
| P0-05 | HOME 隔离验证 | CLI 和插件不污染真实用户目录 |
| P0-06 | 插件 lint 通过 | 扩展包进入可 CI 状态 |

## 4. P0-01: 统一 ExecutionPlan

### 4.1 新增文件

新增:

```text
packages/vectahub-vscode-extension/src/execution/plan.ts
```

内容:

```ts
import * as vscode from 'vscode';

export type ExecutionMode = 'strict' | 'relaxed' | 'consensus';

export type ExecutionPlan =
  | IntentExecutionPlan
  | CommandExecutionPlan
  | WorkflowFileExecutionPlan;

export interface BaseExecutionPlan {
  id: string;
  label: string;
  source: 'intent' | 'package-json' | 'git' | 'workflow-file' | 'manual';
  mode: ExecutionMode;
  cwd?: string;
}

export interface IntentExecutionPlan extends BaseExecutionPlan {
  type: 'intent';
  intent: string;
}

export interface CommandExecutionPlan extends BaseExecutionPlan {
  type: 'command';
  command: {
    cli: string;
    args: string[];
  };
}

export interface WorkflowFileExecutionPlan extends BaseExecutionPlan {
  type: 'workflowFile';
  file: string;
}

export function getWorkspaceCwd(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    return vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
```

### 4.2 新增 plan builder

新增:

```text
packages/vectahub-vscode-extension/src/execution/planBuilder.ts
```

要求:

- 自然语言输入生成 `IntentExecutionPlan`。
- package script / Git Status 生成 `CommandExecutionPlan`。
- 当前 YAML 文件生成 `WorkflowFileExecutionPlan`。
- mode 从设置读取。
- cwd 从 active editor 所属 workspace 优先获取。

### 4.3 新增 plan runner

新增:

```text
packages/vectahub-vscode-extension/src/execution/planRunner.ts
```

要求:

- `previewPlan(plan)` 只负责预览。
- `runPlan(plan)` 负责预览、确认、执行。
- `IntentPlan` 通过 CLI 调用:

```text
vectahub run --dry-run --json <intent>
vectahub run --json --mode <mode> <intent>
```

- `WorkflowFilePlan` 通过 CLI 调用:

```text
vectahub run -f <file> --dry-run --json
vectahub run -f <file> --json --mode <mode>
```

- `CommandPlan` 在 CLI 支持明确命令执行前，不允许自动转成自然语言执行。
- `CommandPlan` 过渡期只能:
  - 展示真实命令。
  - 允许用户在终端中手动执行真实命令。
  - 明确提示“CLI 明确命令执行接口待补齐”。

## 5. P0-02: 修复插件 package script 执行

### 5.1 修改文件

修改:

```text
packages/vectahub-vscode-extension/src/commands/previewProjectTask.ts
packages/vectahub-vscode-extension/src/commands/runProjectTask.ts
```

### 5.2 必须删除的行为

禁止继续使用:

```ts
mapKindToIntent(task.kind)
```

禁止出现:

```text
Preview: npm run test
Run: vectahub run "运行测试"
```

### 5.3 正确行为

项目任务必须按 `task.command` 生成 `CommandPlan`。

预览显示:

```text
npm run test
```

执行策略:

- 如果 CLI 尚无 `run-command`，插件只在终端填入真实命令。
- 不得自动调用自然语言 intent。

### 5.4 验证

在测试项目中准备:

```bash
npm pkg set scripts.test="echo test-ok"
npm pkg set scripts.build="echo build-ok"
```

插件中点击 Test:

预期:

- 预览显示 `npm run test`。
- 终端手动执行也显示 `npm run test`。
- 不出现 `vectahub run "运行测试"`。

## 6. P0-03: 接入插件配置

### 6.1 修改文件

修改:

```text
packages/vectahub-vscode-extension/src/config/settings.ts
```

新增:

```ts
export function getExecutionMode(): 'strict' | 'relaxed' | 'consensus' {
  return vscode.workspace
    .getConfiguration('vectahubTasks')
    .get<'strict' | 'relaxed' | 'consensus'>('executionMode', 'strict');
}

export function getPreviewBeforeRun(): boolean {
  return vscode.workspace
    .getConfiguration('vectahubTasks')
    .get<boolean>('previewBeforeRun', true);
}
```

### 6.2 修改执行入口

修改:

```text
packages/vectahub-vscode-extension/src/commands/runIntent.ts
packages/vectahub-vscode-extension/src/commands/runCurrentWorkflow.ts
packages/vectahub-vscode-extension/src/commands/runProjectTask.ts
```

要求:

- 不再硬编码 `--mode strict`。
- 所有 mode 来自 `ExecutionPlan.mode`。
- `previewBeforeRun=false` 时，不强制 preview，但仍允许高风险任务走确认。

### 6.3 验证

在 VS Code 设置中切换:

```text
vectahubTasks.executionMode = relaxed
vectahubTasks.executionMode = strict
```

执行自然语言任务，观察 Output Channel 中 CLI args。

预期:

- args 中 mode 与设置一致。

## 7. P0-04: 统一 CLI JSON 错误结构

### 7.1 修改文件

优先修改:

```text
src/commands/run.ts
```

如已有 `exitWithError()`，确保所有错误路径都走它。

### 7.2 目标结构

失败时 stdout 输出:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误信息"
  }
}
```

要求:

- `--json` 模式下错误必须可 JSON parse。
- 不允许 stdout 混入普通日志。
- stderr 可保留调试信息，但插件必须能从 stdout 或 adapter error 中拿到稳定错误。

### 7.3 必测错误路径

```bash
vectahub run --json
vectahub run --json --mode bad "查看 git 状态"
vectahub run -f missing.yaml --json
vectahub run --dry-run --json "无法识别的随机任务 abcxyz"
```

每个命令都必须:

- 非 0 退出码。
- stdout 是合法 JSON，或 adapter 能生成结构化错误。
- 包含 `error.code` 和 `error.message`。

## 8. P0-05: HOME 隔离

### 8.1 CLI 验证

执行:

```bash
export TEST_ROOT=/tmp/vectahub-trust-test
export TEST_HOME="$TEST_ROOT/home"
export VECTAHUB_HOME="$TEST_HOME/.vectahub"
rm -rf "$TEST_ROOT"
mkdir -p "$TEST_HOME" "$TEST_ROOT/project"
cd "$TEST_ROOT/project"

vectahub run --dry-run "查看 git 状态"
test ! -e "$HOME/.vectahub/executions"
```

预期:

- dry-run 不写 execution record。
- 不污染真实用户 `~/.vectahub`。

### 8.2 插件验证

执行插件命令:

- Doctor
- Preview Intent
- Run Intent

预期:

- adapter 设置 `VECTAHUB_HOME` 为插件 global storage 下的 `vectahub-home`。
- 不写真实用户 `~/.vectahub`。

## 9. P0-06: 插件 lint

当前必须修复:

```text
packages/vectahub-vscode-extension/src/cli/adapter.ts
packages/vectahub-vscode-extension/src/cli/discovery.ts
packages/vectahub-vscode-extension/src/project/packageManager.ts
```

要求:

- 修复 error。
- `no-explicit-any` warning 可后续处理。
- 不做大规模类型重构。

验证:

```bash
npm run lint -w packages/vectahub-vscode-extension
```

## 10. P1 任务清单

P0 通过后再做 P1。

| ID | 任务 | 目标 |
|----|------|------|
| P1-01 | CLI 增加明确命令执行接口 | `CommandPlan` 可安全自动执行 |
| P1-02 | dry-run 增强安全信息 | 用户能看到风险、cwd、数据目录 |
| P1-03 | 统一执行历史 | 插件历史引用 CLI execution id |
| P1-04 | 自动化用户验收 P0 | 把手工验收变成 smoke tests |

## 11. P1-01: CLI 增加 run-command

新增命令建议:

```text
vectahub run-command --dry-run --json -- npm run test
vectahub run-command --json --mode strict -- npm run test
```

要求:

- 不经过自然语言解析。
- 经过安全检测。
- 经过审计。
- 写 execution record。
- JSON 输出遵循统一错误结构。

完成后修改 `CommandPlan`:

- preview 调用 `run-command --dry-run --json`
- run 调用 `run-command --json --mode <mode>`

## 12. P1-02: dry-run 增强安全信息

dry-run 输出应包含:

```json
{
  "ok": true,
  "dryRun": true,
  "cwd": "...",
  "vectahubHome": "...",
  "risk": {
    "level": "low",
    "matchedRules": []
  },
  "steps": []
}
```

如果暂不实现完整 risk，也至少输出:

- cwd
- steps
- dryRun

## 13. P1-03: 统一历史概念

当前概念应收敛:

| 概念 | 责任 |
|------|------|
| Execution History | CLI 权威执行历史 |
| Audit Log | 安全和系统事件 |
| Task History | 插件 UI 投影 |

插件任务历史应尽量保存 CLI execution id。

## 14. P1-04: 自动化用户验收 P0

基于:

```text
docs/current/full-user-acceptance-test.md
```

提取 P0 为自动化 smoke tests。

优先自动化:

1. `version --json`
2. `doctor --json`
3. `run --dry-run --json "查看 git 状态"`
4. JSON 失败路径
5. `security test --json "rm -rf /"`
6. package script plan builder 单元测试

## 15. 验证命令

每轮实现后执行:

```bash
npm run typecheck
npm run build
npm run compile -w packages/vectahub-vscode-extension
npm run lint -w packages/vectahub-vscode-extension
npm exec -- vitest --run --exclude 'packages/vectahub-vscode-extension/src/test/**'
```

如果环境支持 VS Code/Electron:

```bash
npm test -w packages/vectahub-vscode-extension
```

## 16. 手工验收

按以下文档执行 P0:

```text
docs/current/full-user-acceptance-test.md
```

必须通过:

- CLI-P0-01
- CLI-P0-02
- CLI-P0-03
- CLI-P0-04
- CLI-P0-05
- CLI-P0-06
- CLI-P0-07
- VSC-P0-01
- VSC-P0-02
- VSC-P0-03
- VSC-P0-04
- VSC-P0-05
- VSC-P0-06
- VSC-P0-07
- VSC-P0-08

## 17. 完成定义

只有全部满足才算完成:

1. CLI typecheck 通过。
2. CLI build 通过。
3. 插件 compile 通过。
4. 插件 lint 通过。
5. P0 用户验收通过。
6. package script preview/run 一致。
7. JSON 失败路径稳定。
8. `VECTAHUB_HOME` 隔离验证通过。
9. 文档中不再把未验证能力写成已完成。

## 18. 执行完成后删除

完成并验证通过后删除本文件:

```bash
rm docs1.0/user-trust-product-closure-dev-plan.md
```

不要把本文件加入 README 或用户文档入口。
