# VectaHub Tasks VS Code 插件实施任务文档

> 文档版本: v1.0
> 创建日期: 2026-05-08
> 状态: 可执行，CLI JSON 协议仍为插件前置 P0
> 目标环境: Trae 中由 agent 分阶段实施

## 1. 产品决策冻结

本阶段实现必须遵守以下已确认决策:

| 项 | 决策 |
| --- | --- |
| 插件显示名 | `VectaHub Tasks` |
| 插件项目目录 | `packages/vectahub-vscode-extension` |
| 第一版运行方式 | 只调用本地全局 CLI，不内置 VectaHub core |
| CLI 安装来源 | npm 全局安装: `npm install -g vectahub` |
| 第一版平台 | macOS，Apple Silicon 必测，Intel 发布前补测 |
| CLI 检测 | 插件激活后自动检测 |
| 安装引导 | 一键在 VS Code Terminal 打开安装命令，用户手动确认执行 |
| 安装后动作 | 自动调用一次 `vectahub --version` 和 `vectahub doctor` |
| 默认执行策略 | `strict + preview first` |
| Chat | 进入 MVP，但只做轻量任务输入，不做完整 REPL |
| 图形化工作流编辑器 | 第一版不做 |
| 发布目标 | 面向 Marketplace 发布，但 publisher 账号暂不处理 |

## 2. 总体目标

在当前仓库中新增一个 VS Code 插件包 `packages/vectahub-vscode-extension`。插件作为 VectaHub CLI 的 UI 外壳，为用户提供:

- 自动检测本地 `vectahub` CLI。
- 找不到 CLI 时提供安装引导。
- 任务面板 `Tasks`。
- 高级面板 `Advanced`。
- 自然语言任务预览和执行。
- 常用任务: Git Status、Run Tests、Build Project、Doctor。
- 输出面板与状态栏。
- 插件设置项。

第一版不直接调用 `src/workflow`、`src/nl` 等核心代码，也不做图形化 workflow 编辑器。

## 3. 前置条件

### 3.0 当前代码状态

截至 2026-05-08，影响插件安全预览和测试可信度的核心问题已修复:

- `run --dry-run` 已实现零副作用，不触发首次安装、外部 CLI 扫描、执行或记录写入。
- 文件 dry-run 也已短路预览，不进入执行记录保存路径。
- 生产代码支持 `VECTAHUB_HOME`，测试默认使用临时目录，不再写真实用户 HOME。
- Chat / NL pipeline / workflow if 失败语义已对齐。
- CLI / API 测试环境兼容已修复；API 在无法绑定本地端口时明确 skip。
- `doctor` 不再误报本地 `tsx`，并能正常退出。
- CLI 版本已与 `package.json` 对齐为 `1.0.0`。
- 当前验证基线: `npm run build`、`npm run typecheck`、`npm test -- --run` 通过，测试结果为 `1178 passed | 18 skipped`。

### 3.1 必须优先完成

插件实现前，至少需要完成或并行推进以下 CLI 能力:

1. [x] `run --dry-run` 零副作用。
2. [ ] CLI 支持结构化 JSON 输出:
   - `vectahub --version` 或 `vectahub version --json`
   - `vectahub doctor --json`
   - `vectahub run --dry-run --json <intent>`
   - `vectahub run --json <intent>`
   - `vectahub tools list --json`
   - `vectahub security test --json <command>`
3. [x] 测试不写真实用户 HOME。

如果 CLI JSON 尚未完成，插件任务只能先实现 shell、设置、检测和 UI 空状态，不得解析人类日志作为长期方案。

### 3.2 当前禁止事项

- 不要在插件里静默安装 CLI。
- 不要绕过 VectaHub CLI 直接执行自然语言生成的命令。
- 不要默认使用 relaxed 模式。
- 不要做 Webview Chat。
- 不要做 DAG / 图形化 workflow 编辑器。
- 不要把 Tools、Security、Workflow 概念默认平铺给新用户。

## 4. 目录结构

新增目录:

```text
packages/
  vectahub-vscode-extension/
    package.json
    tsconfig.json
    README.md
    CHANGELOG.md
    src/
      extension.ts
      cli/
        adapter.ts
        discovery.ts
        types.ts
      commands/
        previewIntent.ts
        runIntent.ts
        doctor.ts
        installCli.ts
        runCommonTask.ts
      views/
        tasksView.ts
        advancedView.ts
        treeItems.ts
      ui/
        output.ts
        statusBar.ts
        notifications.ts
      config/
        settings.ts
      test/
        extension.test.ts
```

说明:

- 插件包先独立放在 `packages/vectahub-vscode-extension`。
- 根仓库是否改成 workspace 由任务 `VSC-M0-01` 决定。
- 第一版不复用仓库源码内部模块，避免 Node 版本和构建边界问题。

## 5. 配置项

插件必须注册以下 settings:

| Setting ID | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `vectahubTasks.cliPath` | string | `vectahub` | VectaHub CLI 可执行路径 |
| `vectahubTasks.executionMode` | enum | `strict` | 默认执行模式 |
| `vectahubTasks.previewBeforeRun` | boolean | `true` | 执行前强制预览 |
| `vectahubTasks.autoDetectCli` | boolean | `true` | 插件激活后自动检测 CLI |
| `vectahubTasks.logLevel` | enum | `info` | 插件日志级别 |
| `vectahubTasks.vectahubHomeMode` | enum | `extensionStorage` | 使用插件存储隔离 VectaHub 数据 |

注意:

- setting 前缀使用 `vectahubTasks`，避免与 CLI 配置混淆。
- 第一版默认 `strict`。
- `previewBeforeRun` 默认不可被危险命令绕过。

## 6. UI 设计

### 6.1 Activity Bar

插件贡献一个 Activity Bar 容器:

- 标题: `VectaHub`
- 默认打开视图: `Tasks`
- 图标: 简洁任务/流程图标，后续可替换

### 6.2 Tasks 主视图

Tasks 是默认主界面，面向普通用户。

结构:

```text
Tasks
  Common
    Git Status
    Run Tests
    Build Project
    Doctor
  Natural Language
    Preview Intent
    Run Intent
  Recent
    Last Run
    Last 5 Runs
  Failed
    Last Failed Step
```

第一版允许 Recent / Failed 显示空状态。

每个任务点击行为:

| Item | 行为 |
| --- | --- |
| Git Status | preview `查看 git 状态`，确认后 run |
| Run Tests | preview `运行测试`，确认后 run |
| Build Project | preview `构建项目`，确认后 run |
| Doctor | 直接运行 `vectahub doctor --json` 或普通 doctor |
| Preview Intent | 打开 InputBox，只预览 |
| Run Intent | 打开 InputBox，先预览，再确认执行 |

### 6.3 Advanced 视图

Advanced 面向熟悉 VectaHub 的用户。

结构:

```text
Advanced
  Workflows
    Open Current Workflow
    Preview Current Workflow
    Run Current Workflow
  Tools
    List Tools
  Security
    Test Selected Command
  Settings
    Open Settings
    Install CLI
    Run Doctor
```

第一版不要求展示完整 workflow 列表，允许只提供命令入口。

### 6.4 Output Channel

创建 `VectaHub Tasks` output channel。

输出内容:

- CLI 检测结果。
- 安装引导提示。
- 预览结果。
- 执行结果摘要。
- 错误详情。

不得输出:

- API key。
- 完整环境变量。
- 未脱敏 secret。

### 6.5 Status Bar

状态栏展示:

```text
VectaHub: Ready
VectaHub: CLI Missing
VectaHub: Running
VectaHub: Failed
```

点击状态栏:

- CLI missing: 打开安装引导。
- Ready: 聚焦 Tasks 视图。
- Failed: 打开 Output Channel。

## 7. CLI Adapter 规范

### 7.1 职责

`src/cli/adapter.ts` 负责所有 CLI 调用:

- 读取配置中的 `cliPath`。
- 设置 cwd 为当前 workspace folder。
- 设置 `VECTAHUB_HOME` 为插件 global storage 子目录。
- 执行 CLI 子进程。
- 支持 timeout 和 cancellation。
- 解析 JSON 输出。
- 统一错误格式。

### 7.2 环境变量

每次调用必须设置:

```text
CI=1
VECTAHUB_NON_INTERACTIVE=1
VECTAHUB_HOME=<extension globalStorageUri>/vectahub-home
```

### 7.3 返回类型

```ts
export interface CliResult<T = unknown> {
  ok: boolean;
  data?: T;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### 7.4 禁止行为

- 不允许通过 shell 拼接用户输入。
- 不允许 `exec("vectahub " + input)`。
- 必须使用 `spawn` 并传 args 数组。
- 用户输入必须作为单独参数传递。

## 8. 开发阶段任务

### VSC-M0-01: 插件包骨架

**状态**: 未完成。当前仓库尚无 `packages/vectahub-vscode-extension`。

**目标**

新增 `packages/vectahub-vscode-extension`，能在 VS Code Extension Development Host 中激活。

**文件范围**

- `packages/vectahub-vscode-extension/package.json`
- `packages/vectahub-vscode-extension/tsconfig.json`
- `packages/vectahub-vscode-extension/src/extension.ts`
- 根 `package.json`，仅在需要新增 workspace/script 时修改

**实现要求**

- 注册插件 activation event。
- 注册 `VectaHub: Preview Intent` 命令。
- 创建 Output Channel。
- 输出激活日志。

**验收**

```bash
cd packages/vectahub-vscode-extension
npm install
npm run compile
```

在 Extension Development Host:

- 命令面板能找到 `VectaHub: Preview Intent`。
- 执行命令后 Output Channel 有日志。

---

### VSC-M0-02: CLI 自动检测与安装引导

**状态**: 未完成。

**目标**

插件激活后自动检测全局 `vectahub` CLI。找不到时，提供一键打开终端安装命令。

**文件范围**

- `src/cli/discovery.ts`
- `src/commands/installCli.ts`
- `src/ui/statusBar.ts`
- `src/ui/notifications.ts`
- `src/config/settings.ts`

**实现要求**

- 读取 `vectahubTasks.cliPath`，默认 `vectahub`。
- 调用 `vectahub --version` 检测。
- 检测成功后自动运行一次 doctor。
- 检测失败时:
  - 状态栏显示 `VectaHub: CLI Missing`。
  - 弹出提示: Install / Open Settings / Dismiss。
  - Install 打开 VS Code Terminal，并填入 `npm install -g vectahub`。
- 不自动执行安装命令，用户手动确认。

**验收**

- 未安装 CLI 时状态栏正确。
- 点击 Install 后终端出现安装命令。
- 安装后重试检测可成功。

---

### VSC-M0-03: CLI Adapter

**状态**: 未完成。

**目标**

实现安全、可复用的 CLI 子进程调用层。

**文件范围**

- `src/cli/adapter.ts`
- `src/cli/types.ts`
- `src/ui/output.ts`

**实现要求**

- 使用 `spawn`。
- 参数数组传递。
- 支持 cwd。
- 支持 env 注入。
- 支持 timeout。
- 支持 cancellation token。
- JSON 解析失败时返回结构化错误。

**验收**

- `runCli(['--version'])` 成功。
- `runCli(['doctor', '--json'])` 可返回结果或结构化失败。
- 用户输入中包含空格、引号时不会被 shell 展开。

---

### VSC-M1-01: Tasks 主视图

**状态**: 未完成。

**目标**

实现默认任务面板。

**文件范围**

- `src/views/tasksView.ts`
- `src/views/treeItems.ts`
- `src/commands/runCommonTask.ts`
- `package.json` contributions

**实现要求**

- 注册 `vectahubTasks.tasksView`。
- 展示 Common、Natural Language、Recent、Failed。
- Common 下提供 Git Status、Run Tests、Build Project、Doctor。
- Natural Language 下提供 Preview Intent、Run Intent。
- Recent / Failed 第一版可展示空状态。

**验收**

- Activity Bar 中出现 VectaHub。
- Tasks 视图默认可见。
- 点击 Doctor 能调用 CLI 并写 Output。

---

### VSC-M1-02: Preview Intent

**状态**: 未完成，依赖 CLI JSON 协议。

**目标**

用户输入自然语言后，插件调用 dry-run 预览。

**文件范围**

- `src/commands/previewIntent.ts`
- `src/cli/adapter.ts`
- `src/ui/output.ts`
- `src/ui/notifications.ts`

**实现要求**

- 使用 InputBox 获取 intent。
- 调用:

```bash
vectahub run --dry-run --json <intent>
```

- 如果 CLI 尚不支持 JSON，显示明确错误: `当前 CLI 缺少 --json 输出，需先完成 CLI JSON 协议。`
- Output Channel 展示:
  - intent
  - matched intent
  - planned commands
  - risk level

**验收**

- 输入 `查看 git 状态` 后能展示 `git status`。
- 不执行真实命令。
- 不触发 setup 写入真实 HOME。

---

### VSC-M1-03: Run Intent

**状态**: 未完成，依赖 CLI JSON 协议和 Preview Intent。

**目标**

执行自然语言任务，但必须先预览并确认。

**文件范围**

- `src/commands/runIntent.ts`
- `src/commands/previewIntent.ts`
- `src/ui/notifications.ts`
- `src/views/tasksView.ts`

**实现要求**

- 复用 Preview Intent。
- 预览成功后展示确认:
  - Run
  - Cancel
  - Open Terminal
- 用户点 Run 后调用:

```bash
vectahub run --json --mode strict <intent>
```

- 高危命令必须二次确认。
- 执行中状态栏显示 Running。
- 执行结束更新 Output 和 Recent。

**验收**

- `查看 git 状态` 能先预览，再执行。
- Cancel 不执行。
- 高危命令不会直接执行。

---

### VSC-M1-04: Advanced 视图

**状态**: 未完成，Tools / Security 动作依赖对应 CLI JSON 输出。

**目标**

提供进阶能力入口，但不干扰普通用户。

**文件范围**

- `src/views/advancedView.ts`
- `src/views/treeItems.ts`
- `package.json` contributions

**实现要求**

- 注册 `vectahubTasks.advancedView`。
- 展示 Workflows、Tools、Security、Settings 分组。
- Tools/List Tools 调用 `vectahub tools list --json`。
- Settings/Open Settings 打开 VS Code 设置。
- Security/Test Selected Command 获取当前编辑器选中文本。

**验收**

- Advanced 默认折叠在 Tasks 下方或同容器第二视图。
- Tools 可展示结果到 Output Channel。
- Settings 能打开插件设置。

---

### VSC-M2-01: YAML Workflow 轻量辅助

**状态**: 未完成，依赖 `run -f --dry-run --json` 和 `run -f --json`。

**目标**

不做图形化编辑器，仅提供当前 YAML 的预览和执行入口。

**文件范围**

- `src/commands/previewCurrentWorkflow.ts`
- `src/commands/runCurrentWorkflow.ts`
- `package.json` contributions

**实现要求**

- 仅对当前打开的 `.yaml` / `.yml` 文件启用。
- 调用:

```bash
vectahub run -f <file> --dry-run --json
vectahub run -f <file> --json --mode strict
```

- 如果 CLI 暂不支持文件 dry-run JSON，提示前置能力缺失。

**验收**

- 打开 YAML 文件后可通过命令面板预览和执行。
- 不做 DAG。
- 不做拖拽编辑。

---

### VSC-M2-02: 插件 smoke tests

**状态**: 未完成。

**目标**

为插件关键路径建立最低限度自动化测试。

**文件范围**

- `src/test/extension.test.ts`
- 插件测试配置

**测试范围**

- extension activate。
- CLI missing 状态。
- CLI adapter 参数传递。
- Preview Intent 命令注册。
- Tasks view provider 返回基础节点。

**验收**

```bash
cd packages/vectahub-vscode-extension
npm test
```

## 9. 发布准备任务

### VSC-REL-01: Marketplace 元数据

**状态**: 未完成。

**目标**

为后续 Marketplace 发布准备 metadata，但不处理 publisher 账号。

**文件范围**

- `packages/vectahub-vscode-extension/package.json`
- `packages/vectahub-vscode-extension/README.md`
- `packages/vectahub-vscode-extension/CHANGELOG.md`

**要求**

- displayName: `VectaHub Tasks`
- description: 清楚说明“requires global VectaHub CLI”
- categories: Productivity, Other
- keywords: vectahub, workflow, tasks, cli, automation
- icon 可先占位，发布前替换

**验收**

- README 包含安装 CLI 指引。
- README 说明 macOS first。
- README 不声称 Windows/Linux 已支持。

## 10. 验收矩阵

| 阶段 | 命令 | 预期 |
| --- | --- | --- |
| CLI 前置 | `npm run build` | 已通过 |
| CLI 前置 | `npm run typecheck` | 已通过 |
| CLI 前置 | `npm test -- --run` | 已通过，`1178 passed | 18 skipped` |
| CLI 前置 | `node dist/cli.js run --dry-run "查看 git 状态"` | 已通过，零副作用 |
| CLI 前置 | `node dist/cli.js doctor` | 已通过，正常退出 |
| CLI 前置 | `node dist/cli.js --version` | 已通过，输出 `1.0.0` |
| CLI 前置 | `node dist/cli.js run --dry-run --json "查看 git 状态"` | 待实现，JSON 输出且零副作用 |
| 插件构建 | `cd packages/vectahub-vscode-extension && npm run compile` | 通过 |
| 插件测试 | `cd packages/vectahub-vscode-extension && npm test` | 通过 |
| 手工验证 | 打开 Extension Development Host | Activity Bar 出现 VectaHub |
| 手工验证 | 未安装 CLI | 状态栏 CLI Missing，Install 打开终端命令 |
| 手工验证 | 已安装 CLI | 自动检测成功并运行 doctor |
| 手工验证 | Preview Intent | `查看 git 状态` 展示 `git status` |
| 手工验证 | Run Intent | 先预览，确认后执行 |

## 11. Agent 执行顺序

推荐按以下顺序派发任务:

1. CLI 侧 `--json` 协议任务。
2. `VSC-M0-01` 插件包骨架。
3. `VSC-M0-02` CLI 自动检测与安装引导。
4. `VSC-M0-03` CLI Adapter。
5. `VSC-M1-01` Tasks 主视图。
6. `VSC-M1-02` Preview Intent。
7. `VSC-M1-03` Run Intent。
8. `VSC-M1-04` Advanced 视图。
9. `VSC-M2-01` YAML Workflow 轻量辅助。
10. `VSC-M2-02` 插件 smoke tests。
11. `VSC-REL-01` 发布元数据。

## 12. 实施注意事项

- 插件代码必须使用 TypeScript。
- 不要把 CLI 人类日志解析成 UI 状态，除非作为临时 fallback 并明确 TODO。
- 所有用户输入都必须作为 spawn args 数组传递。
- 所有执行都必须显示真实命令。
- 所有自然语言执行都必须 preview first。
- 插件错误提示要面向普通用户，不要暴露内部堆栈作为第一层信息。
- Output Channel 可以包含详细错误，但需要脱敏。
- 对 macOS 路径检测要考虑 `/opt/homebrew` 和 `/usr/local`。

## 13. 完成定义

第一版实施完成的定义:

- 插件能在 VS Code Extension Development Host 启动。
- 自动检测全局 `vectahub` CLI。
- 未安装 CLI 时能一键打开终端安装命令。
- 安装后自动运行版本检查和 doctor。
- Tasks 面板可用。
- Preview Intent 可用。
- Run Intent 必须 preview first。
- Advanced 面板提供基础进阶入口。
- 不包含图形化 workflow 编辑器。
- 插件 README 清楚说明 macOS first 和全局 CLI 依赖。
