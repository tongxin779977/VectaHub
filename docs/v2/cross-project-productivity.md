# VectaHub Tasks 跨项目效率实施任务文档

> 文档版本: v1.0
> 创建日期: 2026-05-08
> 状态: 可执行
> 目标环境: Trae 中由 agent 分阶段实施
> 前置文档: `docs/v2/vscode-extension-tasks.md`
> 核心目标: 让 VectaHub Tasks 插件能在任意项目中直接提升日常开发效率

## 1. 方向调整

06 文档已经定义了 VS Code 插件基本形态。07 文档进一步收敛第一版产品重点:

**不要优先做复杂 workflow。优先做跨项目任务面板。**

第一版最有价值的用户路径是:

1. 用户打开任意项目。
2. 插件自动检测 `vectahub` CLI。
3. 插件识别当前项目可执行任务。
4. Tasks 面板展示 Git、Test、Build、Lint、Typecheck、Install 等常用任务。
5. 用户点击任务。
6. 插件先预览真实命令。
7. 用户确认后执行。
8. 输出写入 VectaHub Tasks Output Channel。

这条路径能直接在其他项目使用，不依赖用户理解 VectaHub workflow 编排。

## 2. 产品决策

| 项 | 决策 |
| --- | --- |
| 第一版核心价值 | 任意项目里的常用开发任务面板 |
| 默认任务来源 | 当前 workspace 的项目文件与 package scripts |
| 第一优先级 | npm / package.json 项目 |
| 工作流 YAML | 降级为 Advanced 能力，不进入主路径 |
| 自然语言 | 作为任务输入补充，不作为唯一入口 |
| 执行策略 | preview first + strict |
| 输出协议 | 必须优先使用 CLI JSON，不长期解析人类日志 |

## 3. 必须支持的任务

第一版 Tasks 面板必须优先支持:

| 任务 | 识别方式 | 预览命令 |
| --- | --- | --- |
| Git Status | workspace 中存在 `.git` | `git status` |
| Install Dependencies | 存在 `package.json` | `npm install` |
| Run Tests | `scripts.test` 存在 | `npm test` 或 `npm run test` |
| Build Project | `scripts.build` 存在 | `npm run build` |
| Lint Project | `scripts.lint` 存在 | `npm run lint` |
| Typecheck | `scripts.typecheck` 或 `scripts.lint` 包含 tsc | `npm run typecheck` |
| List Package Scripts | 存在 `package.json` | 插件本地读取 scripts 并展示 |
| Doctor | CLI 可用 | `vectahub doctor` |
| Preview Intent | 用户输入 | `vectahub run --dry-run --json <intent>` |

可选支持:

| 任务 | 识别方式 |
| --- | --- |
| pnpm | `pnpm-lock.yaml` |
| yarn | `yarn.lock` |
| bun | `bun.lockb` 或 `bun.lock` |

第一版可以只执行 npm，但项目检测结构必须预留 package manager 扩展。

## 4. UI 目标

Tasks 面板应变成默认主工作台:

```text
Tasks
  Project
    Install Dependencies
    Run Tests
    Build Project
    Lint Project
    Typecheck
    List Package Scripts
  Git
    Git Status
  VectaHub
    Doctor
    Preview Intent
    Run Intent
  Recent
    Last 5 Tasks
  Failed
    Last Failed Task

Advanced
  Workflows
  Tools
  Security
  Settings
```

UI 原则:

- 主界面不出现 `workflow`、`sandbox`、`NL pipeline` 等内部术语。
- 不存在的任务不展示为可点击执行项，显示为 disabled 或隐藏。
- 每个任务显示来源，例如 `package.json scripts.test`。
- 用户点击执行前必须看到真实命令。
- 高危命令必须二次确认。

## 5. 新增插件模块

在 06 文档目录基础上新增:

```text
packages/vectahub-vscode-extension/src/
  project/
    detector.ts
    packageScripts.ts
    taskModel.ts
    packageManager.ts
  commands/
    previewProjectTask.ts
    runProjectTask.ts
    refreshProjectTasks.ts
  views/
    tasksView.ts
```

### 5.1 project/taskModel.ts

定义插件内部任务模型:

```ts
export type ProjectTaskKind =
  | 'git-status'
  | 'install'
  | 'test'
  | 'build'
  | 'lint'
  | 'typecheck'
  | 'list-scripts'
  | 'doctor'
  | 'intent-preview'
  | 'intent-run';

export interface ProjectTask {
  id: string;
  kind: ProjectTaskKind;
  label: string;
  description?: string;
  source: 'git' | 'package-json' | 'vectahub' | 'manual';
  available: boolean;
  command?: {
    cli: string;
    args: string[];
  };
  reasonUnavailable?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}
```

要求:

- `command.args` 必须是数组。
- 不允许将命令拼成字符串后执行。
- 不可用任务必须给出原因。

### 5.2 project/detector.ts

职责:

- 获取当前 workspace folder。
- 检测 `.git`。
- 检测 `package.json`。
- 调用 `detectPackageManager()`。
- 返回 `ProjectTask[]`。

要求:

- 无 workspace 时返回空状态任务。
- 多 workspace 第一版使用当前 active editor 所属 workspace；没有 active editor 时使用第一个 workspace。
- 读取文件使用 VS Code workspace fs 或 Node fs 均可，但必须处理异常。

### 5.3 project/packageScripts.ts

职责:

- 读取 `package.json`。
- 解析 `scripts`。
- 检测 test/build/lint/typecheck。
- 生成任务。

要求:

- 使用 JSON parser，不做正则解析。
- `scripts.test` 是默认 test 来源。
- `scripts.build` 是默认 build 来源。
- `scripts.lint` 是默认 lint 来源。
- `scripts.typecheck` 是默认 typecheck 来源。
- 如果没有 typecheck，但 lint 脚本包含 `tsc --noEmit`，可标记 typecheck 来源为 lint。

### 5.4 project/packageManager.ts

职责:

- 判断使用 npm / pnpm / yarn / bun。

优先级:

1. `pnpm-lock.yaml` -> `pnpm`
2. `yarn.lock` -> `yarn`
3. `bun.lockb` 或 `bun.lock` -> `bun`
4. `package-lock.json` -> `npm`
5. 默认 `npm`

第一版执行策略:

- npm 直接支持。
- pnpm/yarn/bun 先展示检测结果。
- 如果 agent 有余力，可同时支持 pnpm/yarn/bun 的等价命令。

## 6. 执行策略

### 6.1 项目任务执行

项目任务不要绕过安全模型。建议第一版通过 VectaHub CLI 执行自然语言 intent，而不是插件直接执行 npm/git。

映射:

| Task | Intent |
| --- | --- |
| Git Status | `查看 git 状态` |
| Install Dependencies | `安装依赖` |
| Run Tests | `运行测试` |
| Build Project | `构建项目` |
| Lint Project | `运行 lint` |
| Typecheck | `运行 typecheck` |

如果 CLI JSON 能返回真实计划命令，以 CLI 返回为准。

如果 CLI 尚不能稳定识别某任务，插件可以 fallback 到明确命令预览，但执行仍应通过安全确认。

### 6.2 预览流程

用户点击任务后:

1. 插件生成 intent 或 command。
2. 调用 `vectahub run --dry-run --json <intent>`。
3. 若 dry-run 成功，展示 CLI 返回的真实命令。
4. 若 dry-run 失败，但任务有明确 command，展示 fallback command 和警告。
5. 用户选择 Run / Cancel / Open Terminal。

### 6.3 执行流程

用户确认 Run 后:

1. 调用 `vectahub run --json --mode strict <intent>`。
2. 状态栏显示 Running。
3. Output Channel 展示执行摘要。
4. Tasks Recent 记录本次任务。
5. 失败时写入 Failed 分组。

### 6.4 Open Terminal

Open Terminal 不自动执行命令，只填入命令文本或展示 ready terminal。

如果 VS Code API 不支持只填不执行，则使用 `sendText(command, false)`。

## 7. 任务卡

### CP-P0-01: 当前项目检测器

**目标**

插件能识别当前 workspace 是什么项目，生成可用任务列表。

**文件范围**

- `packages/vectahub-vscode-extension/src/project/taskModel.ts`
- `packages/vectahub-vscode-extension/src/project/detector.ts`
- `packages/vectahub-vscode-extension/src/project/packageScripts.ts`
- `packages/vectahub-vscode-extension/src/project/packageManager.ts`

**实现要求**

- 支持无 workspace。
- 支持 package.json scripts。
- 支持 `.git` 检测。
- 支持 npm package manager。
- 返回稳定的 `ProjectTask[]`。

**测试要求**

- package.json 有 test/build/lint/typecheck 时生成对应任务。
- package.json 缺失时任务 unavailable 或不展示。
- `.git` 存在时生成 Git Status。
- pnpm/yarn/bun lockfile 能被识别。

**验收命令**

```bash
cd packages/vectahub-vscode-extension
npm test -- project
```

---

### CP-P0-02: Tasks 面板改造成项目任务面板

**目标**

Tasks 视图默认展示当前项目任务，而不是抽象 VectaHub 功能。

**文件范围**

- `packages/vectahub-vscode-extension/src/views/tasksView.ts`
- `packages/vectahub-vscode-extension/src/views/treeItems.ts`
- `packages/vectahub-vscode-extension/src/commands/refreshProjectTasks.ts`

**实现要求**

- Project 分组展示 Install/Test/Build/Lint/Typecheck/List Scripts。
- Git 分组展示 Git Status。
- VectaHub 分组展示 Doctor/Preview Intent/Run Intent。
- Recent/Failed 可为空。
- 支持 refresh。
- 不可用任务不应作为可执行命令触发。

**验收**

- 打开当前 VectaHub 仓库时能识别:
  - Run Tests
  - Build Project
  - Typecheck
  - Git Status
- 点击 refresh 后任务重新加载。

---

### CP-P0-03: 项目任务预览

**目标**

用户点击项目任务后，先预览真实命令。

**文件范围**

- `packages/vectahub-vscode-extension/src/commands/previewProjectTask.ts`
- `packages/vectahub-vscode-extension/src/commands/runCommonTask.ts`
- `packages/vectahub-vscode-extension/src/cli/adapter.ts`
- `packages/vectahub-vscode-extension/src/ui/output.ts`

**实现要求**

- 根据 task kind 映射 intent。
- 调用 `vectahub run --dry-run --json <intent>`。
- 展示 planned commands。
- CLI JSON 不可用时显示明确前置缺失。
- fallback command 只能预览，执行前仍需确认。

**验收**

- Run Tests 预览出测试命令。
- Build Project 预览出构建命令。
- Git Status 预览出 `git status`。
- 预览不会执行真实任务。

---

### CP-P0-04: 项目任务执行

**目标**

用户确认后执行任务，并记录最近任务和失败任务。

**文件范围**

- `packages/vectahub-vscode-extension/src/commands/runProjectTask.ts`
- `packages/vectahub-vscode-extension/src/views/tasksView.ts`
- `packages/vectahub-vscode-extension/src/ui/statusBar.ts`
- `packages/vectahub-vscode-extension/src/ui/output.ts`

**实现要求**

- 所有任务 preview first。
- Run 后使用 strict mode。
- 执行中可取消。
- 成功写 Recent。
- 失败写 Failed。
- Output Channel 展示 stdout/stderr 摘要。

**验收**

- Git Status 可完成执行。
- Run Tests 可以执行当前项目测试。
- Cancel 不执行。
- 失败任务出现在 Failed。

---

### CP-P1-01: Package scripts 展示

**目标**

让用户快速看到当前项目所有 package scripts。

**文件范围**

- `packages/vectahub-vscode-extension/src/project/packageScripts.ts`
- `packages/vectahub-vscode-extension/src/views/tasksView.ts`
- `packages/vectahub-vscode-extension/src/commands/listPackageScripts.ts`

**实现要求**

- List Package Scripts 展示所有 scripts。
- 可以选择某个 script 预览执行。
- 执行命令使用 package manager:
  - npm: `npm run <script>`
  - pnpm: `pnpm run <script>`
  - yarn: `yarn <script>` 或 `yarn run <script>`
  - bun: `bun run <script>`

**验收**

- 当前项目 scripts 能完整展示。
- 选择 `typecheck` 能预览 `npm run typecheck`。

---

### CP-P1-02: Package manager 多工具支持

**目标**

支持 npm 之外的 pnpm/yarn/bun。

**文件范围**

- `packages/vectahub-vscode-extension/src/project/packageManager.ts`
- `packages/vectahub-vscode-extension/src/project/packageScripts.ts`
- `packages/vectahub-vscode-extension/src/commands/previewProjectTask.ts`

**实现要求**

- 根据 lockfile 选择 package manager。
- 生成等价命令。
- 如果对应工具不可用，提示安装或 fallback。

**验收**

- mock pnpm lockfile 时生成 pnpm 命令。
- mock yarn lockfile 时生成 yarn 命令。
- mock bun lockfile 时生成 bun 命令。

---

### CP-P1-03: 跨项目 smoke tests

**目标**

确保插件能在不同项目结构中稳定生成任务。

**文件范围**

- `packages/vectahub-vscode-extension/src/test/crossProject.test.ts`
- 测试 fixtures

**fixtures**

```text
fixtures/
  npm-project/
    package.json
    package-lock.json
  pnpm-project/
    package.json
    pnpm-lock.yaml
  no-package-project/
    README.md
  git-only-project/
    .git/
```

**验收**

```bash
cd packages/vectahub-vscode-extension
npm test -- crossProject
```

## 8. 插件任务与 CLI 能力依赖

| 插件任务 | 依赖 CLI 能力 | 若缺失怎么办 |
| --- | --- | --- |
| Preview Intent | `run --dry-run --json` | 阻断，提示完成 CLI JSON |
| Run Intent | `run --json --mode strict` | 阻断，提示完成 CLI JSON |
| Doctor | `doctor --json` | 可 fallback 普通 doctor 输出 |
| Tools | `tools list --json` | 可暂不展示 Tools |
| Security | `security test --json` | 可展示“安全检测暂不可用” |
| Project Task Preview | `run --dry-run --json` | 使用 fallback command 只预览 |

## 9. 验收矩阵

### 9.1 当前仓库验收

在 VectaHub 当前仓库打开插件，应看到:

| 任务 | 预期 |
| --- | --- |
| Run Tests | 可用，来源 `package.json scripts.test` |
| Build Project | 可用，来源 `package.json scripts.build` |
| Typecheck | 可用，来源 `package.json scripts.typecheck` |
| Git Status | 可用，来源 `.git` |
| Install Dependencies | 可用，来源 `package.json` |
| Lint Project | 可用，来源 `package.json scripts.lint` |

### 9.2 跨项目验收

至少用 3 类项目手工验证:

| 项目类型 | 预期 |
| --- | --- |
| npm TypeScript 项目 | test/build/typecheck 可识别 |
| 纯 Git 项目 | 只显示 Git Status 和 VectaHub 任务 |
| 无 package 项目 | 不显示 npm 任务，显示合理空状态 |

### 9.3 安全验收

- 任意任务点击后不会立即执行。
- 预览必须展示真实命令。
- Cancel 不执行。
- Open Terminal 不自动执行。
- Run 使用 strict mode。

## 10. Agent 执行顺序

推荐顺序:

1. `CP-P0-01` 当前项目检测器。
2. `CP-P0-02` Tasks 面板改造成项目任务面板。
3. `CP-P0-03` 项目任务预览。
4. `CP-P0-04` 项目任务执行。
5. `CP-P1-01` Package scripts 展示。
6. `CP-P1-03` 跨项目 smoke tests。
7. `CP-P1-02` Package manager 多工具支持。

注意:

- 如果 06 文档任务尚未完成，先完成 06 的插件骨架、CLI Adapter、Tasks 基础视图。
- 如果 CLI JSON 尚未完成，不要强行解析普通日志，先把缺失能力作为明确错误展示。

## 11. 完成定义

本 07 阶段完成后，用户在任意 macOS VS Code 项目中应能:

- 打开 VectaHub Tasks 面板。
- 自动看到当前项目可运行的常用任务。
- 点击 Run Tests / Build / Typecheck / Git Status。
- 先预览真实命令。
- 确认后执行。
- 在 Output Channel 查看结果。
- 在 Recent / Failed 看到最近任务状态。

这就是第一版最能直接提升跨项目效率的闭环。
