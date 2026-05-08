# VectaHub 可用性修复执行计划

> 日期: 2026-05-08
> 视角: 架构师可执行修复计划
> 范围: 当前工作区实测暴露的可用性、测试可信度、文档一致性与环境兼容问题
> 状态: 待执行

## 1. 执行摘要

当前 VectaHub 的核心 CLI 路径已经具备基础可用性: 构建成功、类型检查通过、帮助命令可用，自然语言输入 `查看 git 状态` 能在未配置 LLM 时通过规则匹配生成并执行 `git status`。

但项目不能按 README 当前描述对外宣称稳定发布。主要阻断点是:

- 全量测试失败: `34 failed | 1143 passed | 14 skipped`，另有 4 个未处理错误。
- README 声称 `905/905 passing`，与实测不一致。
- `--dry-run` 首次运行仍触发安装与外部工具扫描，违背用户对预览模式的预期。
- 测试直接读写用户 HOME 下的 `.vectahub` 文件，隔离性不足。
- API 测试在受限环境中绑定 `0.0.0.0` 端口失败。
- Chat / NL pipeline / workflow 条件执行存在行为或测试预期不一致。
- `doctor` 对 `tsx` 的检查在当前环境中误报失败。

本文件将这些问题拆成可由 agent 独立执行的任务卡。每张任务卡包含背景、代码入口、修复要求、验收标准和建议命令。

## 2. 实测基线

### 2.1 验证环境

- 项目路径: `/Users/xin.tong/apps/project/test_trae/VectaHub`
- 当前日期: 2026-05-08
- Node.js: `v25.9.0`
- 包版本: `package.json` 为 `1.0.0`
- README 展示版本: `1.0.1`

### 2.2 已验证成功项

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 构建 | `npm run build` | 通过 |
| 类型检查 | `npm run typecheck` | 通过 |
| 主帮助 | `node dist/cli.js --help` | 通过 |
| run 帮助 | `node dist/cli.js run --help` | 通过 |
| 自然语言预览 | `node dist/cli.js run --dry-run "查看 git 状态"` | 识别 `GIT_WORKFLOW`，生成 `git status` |
| 自然语言执行 | `node dist/cli.js run "查看 git 状态"` | 执行成功，输出 Git 工作区状态 |
| 工具列表 | `node dist/cli.js tools list` | 列出 git/npm/docker/curl |

### 2.3 已验证失败项

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 环境诊断 | `node dist/cli.js doctor` | `tsx Not found` |
| 全量测试 | `npm test -- --run` | 7 个测试文件失败，34 个用例失败，4 个未处理错误 |

## 3. 发布门禁标准

修复完成前，不建议继续宣传为稳定版本。建议采用以下门禁:

| 等级 | 标准 | 是否必须 |
| --- | --- | --- |
| P0 | `npm run build` 通过 | 必须 |
| P0 | `npm run typecheck` 通过 | 必须 |
| P0 | `npm test -- --run` 通过，或仅存在明确标注的环境跳过项 | 必须 |
| P0 | `vectahub run --dry-run` 不执行安装、扫描、写入或外部命令探测 | 必须 |
| P0 | 测试不直接修改真实用户 HOME | 必须 |
| P1 | README 的版本、测试数量、能力声明与实测一致 | 必须 |
| P1 | `doctor` 不误报项目本地依赖 | 必须 |
| P1 | Chat REPL 的 auto/confirm/manual 行为有稳定测试覆盖 | 必须 |
| P2 | API 测试可在无外部网络权限环境中稳定运行或自动跳过 | 建议 |

## 4. Agent 执行约定

后续 agent 执行本计划时必须遵守:

- 先读相关测试，再改实现。
- 遵循 TDD: 先让目标失败可复现，再做最小修复。
- 不回退用户已有未提交改动。
- 不修改与任务无关的文件。
- 每张任务卡完成后运行该卡指定验收命令。
- 若任务卡发现设计与现实冲突，更新本文档的“决策记录”后再继续。

推荐执行顺序:

1. `UX-P0-01` 修复测试 HOME 隔离。
2. `UX-P0-02` 修复 `--dry-run` 首次运行副作用。
3. `UX-P0-03` 修复 Chat / NL pipeline / workflow 行为失败。
4. `UX-P0-04` 修复 CLI 与 API 测试环境兼容。
5. `UX-P1-01` 修复 `doctor` 误报。
6. `UX-P1-02` 修正文档与版本声明。

## 5. 任务卡

### UX-P0-01: 测试 HOME 隔离与用户目录写入治理

**问题**

全量测试中大量日志写入 `/Users/xin.tong/.vectahub/...`，`src/workflow/scheduler.test.ts` 还直接 unlink `/Users/xin.tong/.vectahub/schedules.json`。这会造成:

- 本地开发污染真实用户配置。
- 沙箱或 CI 环境中出现 `EPERM`。
- 测试结果依赖机器状态，无法稳定复现。

**已观察失败**

- `src/workflow/scheduler.test.ts`: 7 个用例因 `EPERM: operation not permitted, unlink '/Users/xin.tong/.vectahub/schedules.json'` 失败。
- 多个 workflow/context 测试输出审计日志写入失败。

**代码入口**

- `src/workflow/scheduler.ts`
- `src/workflow/scheduler.test.ts`
- `src/utils/audit.ts`
- `src/infrastructure/audit/index.ts`
- 其他直接使用 `homedir()` 或 `process.env.HOME` 的模块

**修复要求**

- 测试期间统一将 VectaHub 数据目录指向临时目录。
- 生产代码支持可配置数据根目录，例如优先读取 `VECTAHUB_HOME`，否则回退到 `~/.vectahub`。
- 测试不得 unlink 或写入真实用户目录。
- 审计日志写入失败不应污染大量测试输出；测试中可注入 no-op writer 或临时 writer。

**验收标准**

- 单测不再访问 `/Users/xin.tong/.vectahub`。
- `src/workflow/scheduler.test.ts` 全部通过。
- 全量测试中不再出现用户 HOME 下 `.vectahub` 的 `EPERM`。

**建议命令**

```bash
npm test -- src/workflow/scheduler.test.ts --run
npm test -- src/workflow/context-manager.test.ts src/workflow/engine.test.ts --run
npm test -- --run
```

---

### UX-P0-02: `--dry-run` 首次运行副作用治理

**问题**

`run` 命令当前在处理 `--dry-run` 前先执行首次运行安装流程。用户选择 dry-run 的直觉是“只预览，不执行、不扫描、不写入、不探测外部工具”。当前行为会创建配置、扫描 AI CLI 工具，并输出安装流程，影响新手体验与自动化脚本。

**代码入口**

- `src/commands/run.ts`
- `src/setup/first-run-wizard.ts`
- `src/setup/priority-installer.ts`

**关键位置**

- `src/commands/run.ts`: 首次运行逻辑在 dry-run 判断之前。

**修复要求**

- 对于 `--dry-run`，只做意图解析和命令展示。
- 若首次运行配置不存在，dry-run 可以使用内存默认配置，不应写入配置目录。
- dry-run 输出中应清晰展示:
  - 识别到的意图。
  - 将要执行的命令。
  - 安全级别或是否需要确认。
  - 未执行任何命令的说明。
- 非 dry-run 首次运行仍保留安装与配置流程。

**验收标准**

- 首次运行时执行 `run --dry-run` 不创建 `~/.vectahub` 或 `VECTAHUB_HOME`。
- 不扫描 gemini/claude/codex/aider 等外部 CLI。
- 输出只包含解析与预览信息。

**建议命令**

```bash
rm -rf /private/tmp/vectahub-dryrun-home
HOME=/private/tmp/vectahub-dryrun-home CI=1 node dist/cli.js run --dry-run "查看 git 状态"
test ! -e /private/tmp/vectahub-dryrun-home/.vectahub
npm test -- src/commands/run.test.ts --run
```

---

### UX-P0-03: Chat、NL pipeline 与 workflow 条件执行行为对齐

**问题**

当前失败集中在 Chat 执行模式、NLProcessor metadata 与 workflow 条件执行:

- `src/chat/repl.test.ts`: auto/confirm/manual 模式行为不符合测试预期。
- `src/nl/core/pipeline.test.ts`: metadata path、usedSkills、YAML workflow 转 taskList 与预期不一致。
- `src/workflow/executor.test.ts`: if body step 失败时，父步骤返回 `COMPLETED`，测试期望 `FAILED`。

这些失败直接影响用户对自然语言、Chat REPL 和 YAML 工作流的信任。

**代码入口**

- `src/chat/repl.ts`
- `src/chat/types.ts`
- `src/chat/command-manager.ts`
- `src/nl/core/pipeline.ts`
- `src/nl/core/types.ts`
- `src/skills/pipeline-skill.ts`
- `src/skills/intent-skill.ts`
- `src/skills/workflow-skill.ts`
- `src/workflow/executor.ts`
- `src/workflow/handlers/if-handler.ts`

**修复要求**

- 先明确产品设计:
  - Chat auto: 解析成功后是否立即创建并执行 workflow。
  - Chat confirm: 是否必须询问用户确认。
  - Chat manual: 是否只生成 workflow，等待显式执行命令。
- NLProcessor metadata 应稳定表达实际路径，不能测试期望 `skill-pipeline` 时实际返回 `keyword-only`。
- YAML workflow 转 taskList 应保留每个 step 的真实 cli 和 args。
- if handler 的 body step 失败时，父 if step 应按约定返回失败；若产品希望“条件块完成但内部失败可被吞掉”，必须改测试和文档说明。

**验收标准**

- `src/chat/repl.test.ts` 全部通过。
- `src/nl/core/pipeline.test.ts` 全部通过或经架构决策后更新测试。
- `src/workflow/executor.test.ts` 中 if step 失败语义明确并通过。
- README / 使用文档与实际 Chat 模式一致。

**建议命令**

```bash
npm test -- src/chat/repl.test.ts --run
npm test -- src/nl/core/pipeline.test.ts --run
npm test -- src/workflow/executor.test.ts --run
```

---

### UX-P0-04: CLI 与 API 测试环境兼容

**问题**

全量测试中 CLI 和 API 测试失败:

- `src/cli.test.ts`: 8 个 CLI 子进程测试返回 code 1。
- `src/api/server.test.ts`: 4 个 API 测试 hook 超时，并出现 `listen EPERM: operation not permitted 0.0.0.0:<port>`。

当前手动执行 `node dist/cli.js --help` 是成功的，说明 CLI 功能本身可能可用，但测试方式不兼容当前运行环境。

**代码入口**

- `src/cli.test.ts`
- `src/cli.ts`
- `src/api/server.test.ts`
- `src/api/server.ts`
- `vitest.config.ts`

**修复要求**

- CLI 测试应使用构建产物或稳定的 Node loader，不依赖在受限环境中创建 tsx IPC 管道。
- 子进程测试必须显式设置临时 `HOME`、`VECTAHUB_HOME`、`CI=1`。
- API 测试优先绑定 `127.0.0.1`，不要默认绑定 `0.0.0.0`。
- 若环境不允许监听端口，API 集成测试应有明确 skip 条件，不能以 hook timeout 形式失败。
- server close 必须可靠，避免测试进程挂起。

**验收标准**

- `src/cli.test.ts` 全部通过。
- `src/api/server.test.ts` 在允许本地端口监听的环境中通过。
- 在禁止监听端口的环境中，API 测试明确跳过并说明原因。
- 全量测试不再出现 API hook timeout。

**建议命令**

```bash
npm test -- src/cli.test.ts --run
npm test -- src/api/server.test.ts --run
npm test -- --run
```

---

### UX-P1-01: `doctor` 诊断准确性修复

**问题**

`doctor` 实测输出 `tsx Not found`，但项目 `package.json` 中存在 `tsx` devDependency，且构建和测试命令能使用项目依赖。当前诊断逻辑会误导用户。

**代码入口**

- `src/commands/doctor.ts`
- `package.json`

**修复要求**

- doctor 应区分:
  - 全局 CLI 安装场景。
  - 项目源码开发场景。
  - 已构建产物运行场景。
- 检查本地依赖时优先读取 `package.json` 和 `node_modules/.bin`。
- 对 `tsx` 这类开发依赖，若用户只运行已构建 CLI，应作为 warning 或开发项，而不是阻断项。
- 输出应明确告诉用户“影响哪个能力”。

**验收标准**

- 在当前项目中运行 `node dist/cli.js doctor` 不应因本地开发依赖误报为整体失败。
- 若 `tsx` 缺失，只影响开发模式说明，不影响普通 CLI 使用结论。

**建议命令**

```bash
npm test -- src/commands/doctor.test.ts --run
node dist/cli.js doctor
node dist/cli.js doctor --verbose
```

---

### UX-P1-02: README、版本与测试状态一致性修复

**问题**

README 与当前实测状态不一致:

- README badge 写 `905/905 passing`，实测为 `34 failed | 1143 passed | 14 skipped`。
- README 版本展示 `1.0.1`，`package.json` 是 `1.0.0`。
- README 声称 Chat、AI 模块、16 种意图等能力，但当前测试中 Chat/NL pipeline 仍有失败。

**代码入口**

- `README.md`
- `docs/README.md`
- `docs/getting-started.md`
- `docs/guides/cli-commands.md`
- `docs/guides/user-scenarios.md`
- `package.json`

**修复要求**

- 发布前文档只声明已通过验收的能力。
- badge 和“当前状态”必须来自真实测试结果。
- 若保留未完全稳定功能，标记为 experimental 或 preview。
- 版本号保持单一事实来源。建议以 `package.json` 为准，由脚本生成 README 状态。

**验收标准**

- README 中测试数量、版本号和命令清单与实际一致。
- 新手快速开始只包含当前稳定可用路径。
- 用户场景文档中的每个场景都能映射到 smoke test 或明确标记为手工验证。

**建议命令**

```bash
npm test -- --run
node dist/cli.js --help
node dist/cli.js run --dry-run "查看 git 状态"
```

---

### UX-P1-03: 首次运行体验与配置策略统一

**问题**

首次运行时，`run` 命令会自动启动优先级安装流程并扫描外部 AI CLI。这个流程对有经验用户可接受，但对新用户和自动化环境过重。

**代码入口**

- `src/setup/first-run-wizard.ts`
- `src/setup/priority-installer.ts`
- `src/setup/cli-scanner.ts`
- `src/commands/run.ts`
- `src/commands/setup.ts`，若存在或后续拆分

**修复要求**

- 首次运行策略分层:
  - `vectahub setup`: 完整安装、扫描、配置。
  - `vectahub run`: 最小可运行，必要时提示但不强制扫描。
  - `vectahub run --dry-run`: 零副作用。
  - `--non-interactive` 或 `CI=1`: 不进入交互、不写真实用户配置。
- 输出需要解释“已跳过哪些能力”和“如何启用增强能力”。

**验收标准**

- 新用户直接运行安全只读命令时，不被过长 setup 流程打断。
- CI 环境可稳定执行 dry-run 和测试。
- setup 流程仍可显式运行并写入配置。

**建议命令**

```bash
HOME=/private/tmp/vectahub-first-run CI=1 node dist/cli.js run "查看 git 状态"
HOME=/private/tmp/vectahub-first-run CI=1 node dist/cli.js setup
HOME=/private/tmp/vectahub-first-run CI=1 node dist/cli.js config show
```

---

### UX-P2-01: 用户场景 smoke tests 自动化

**问题**

`docs/guides/user-scenarios.md` 列出了 20 个用户场景，但目前它们不是发布门禁。文档可能继续与实现漂移。

**代码入口**

- `docs/guides/user-scenarios.md`
- `src/cli.test.ts`
- 可新增 `src/user-scenarios.smoke.test.ts`

**修复要求**

- 将 20 个场景拆成自动化 smoke tests。
- 对有副作用的命令使用 dry-run。
- 对依赖网络、外部服务、真实 Git 提交的场景标记 manual 或 mock。
- 每个 smoke test 使用临时 HOME / VECTAHUB_HOME。

**验收标准**

- 至少覆盖:
  - `--help`
  - `run --dry-run`
  - `tools list`
  - `mode`
  - `list`
  - `security test`
  - `templates list`
- smoke tests 失败时能直接定位到用户场景编号。

**建议命令**

```bash
npm test -- src/user-scenarios.smoke.test.ts --run
```

## 6. 建议的目标架构

### 6.1 配置与数据目录

目标原则:

- 所有用户数据统一经由 `getVectaHubHome()` 解析。
- 优先级: `VECTAHUB_HOME` > `HOME/.vectahub` > 平台默认目录。
- 测试必须注入临时目录。
- 生产代码不得在模块 import 阶段创建目录或写文件。

建议接口:

```ts
interface VectaHubPaths {
  root: string;
  configFile: string;
  workflowsDir: string;
  logsDir: string;
  schedulesFile: string;
}

function resolveVectaHubPaths(env?: NodeJS.ProcessEnv): VectaHubPaths;
```

### 6.2 CLI 运行阶段

目标阶段:

1. 解析命令参数。
2. 判断运行模式: normal / dry-run / setup / non-interactive。
3. 加载配置，dry-run 使用内存默认配置。
4. 解析自然语言或工作流文件。
5. 执行安全评估。
6. dry-run 输出并退出。
7. normal 模式执行工作流并保存记录。

关键约束:

- dry-run 不能触发 setup。
- setup 不能被普通只读命令隐式强制执行。
- 记录保存失败不能导致只读工作流失败，除非处于严格审计模式。

### 6.3 测试分层

建议分层:

| 层级 | 内容 | 要求 |
| --- | --- | --- |
| Unit | parser、handler、storage、detector | 无真实 HOME、无端口、无外部命令 |
| Integration | CLI dist、workflow engine、API server | 临时 HOME，可 mock 外部命令 |
| Smoke | 用户场景文档映射 | 无破坏性命令，副作用走 dry-run |
| Manual | Chat REPL、真实外部 AI CLI、真实网络 | 文档记录，不作为默认 CI 阻断 |

## 7. 决策记录

| 日期 | 决策 | 原因 | 状态 |
| --- | --- | --- | --- |
| 2026-05-08 | 当前版本不应继续宣称全量测试通过 | 实测 `34 failed`，README 与实际不一致 | 待修复 |
| 2026-05-08 | `--dry-run` 应定义为零副作用预览 | 用户安全直觉与自动化脚本需要稳定语义 | 待修复 |
| 2026-05-08 | 测试必须脱离真实用户 HOME | 避免污染用户配置和 CI 权限失败 | 待修复 |

## 8. 完成定义

本计划视为完成需满足:

- `npm run build` 通过。
- `npm run typecheck` 通过。
- `npm test -- --run` 通过，或仅有明确环境跳过且文档说明。
- `node dist/cli.js run --dry-run "查看 git 状态"` 首次运行零副作用。
- `node dist/cli.js run "查看 git 状态"` 成功执行。
- `node dist/cli.js doctor` 对普通 CLI 使用给出准确结论。
- README、docs 快速开始、用户场景文档与当前能力一致。

