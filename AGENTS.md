# AGENTS.md

> VectaHub 项目的开发 agent 单入口。
> 详细规范见 `docs/agent-operating-guide.md`;本文只列高信号、repo-specific 的事实。

## Project

- **类型**:单用户、本地优先的 TypeScript CLI(workflow engine)
- **包管理**:npm workspaces(`packages/*`)
- **Node**:`>=21`(详见 `package.json:engines`)
- **TypeScript**:5.9,strict,ESM(NodeNext),target ES2022
- **构建**:tsup,产物在 `dist/`(gitignored)
- **测试**:vitest 4.1
- **当前版本**:见 `package.json:version`(同步在 3 个 `package.json`,见 `scripts/bump-version.mjs`)
- **可见性**:**public repository** —— 任何提交都可被公开读取。详见 `docs/repository-permissions.md`

## Required Commands(顺序敏感)

CI(`.github/workflows/ci.yml`)按此顺序执行。**先跑过再声明通过**。

```bash
npm run typecheck               # tsc --noEmit
npm run lint                    # eslint src --ext .ts
npm run check:default-context-usage   # getDefaultContext() 白名单
npm run check:docs               # 文档内部链接检查
npm run test:run                 # vitest --run(主 CI 排除 vscode-extension)
npm run build                    # tsup
node dist/cli.js --version       # 构建产物 smoke test
```

定向测试:

```bash
npx vitest run src/path/to/file.test.ts
npm test -w packages/vectahub-vscode-extension
```

VS Code extension:

```bash
npm run compile:extension        # tsc + prepare-doc-task-contract-core
npm run package:vsix             # 打 .vsix(gitignored)
```

## Repository Layout

- **CLI 入口**:`src/cli.ts` → `src/cli-bootstrap.ts`(`--version` 快速路径)→ `src/cli-main.ts`(命令注册)
- **核心层**(`docs/architecture.md` 详述):
  - `src/cli-main.ts` CLI 组装
  - `src/infrastructure/` DI、environment、config、logger、audit、trace、event
  - `src/nl/` 自然语言路由
  - `src/workflow/` workflow 引擎(`exec`/`if`/`for_each`/`parallel`/`opencli`/`delegate`)
  - `src/skills/` skills 与 AI module 系统
  - `src/agent-runtime/` Agent CLI registry / descriptor / adapter
  - `src/security-protocol/` 命令风险、策略、脱敏
  - `src/commands/` 命令实现
- **Workspace 包**:
  - `packages/doc-task-contract-core/` 共享文档任务合同逻辑(`@vectahub/doc-task-contract-core`)
  - `packages/vectahub-vscode-extension/` VS Code extension(独立 tsc + vitest)
- **运行时数据(用户层,不要提交)**:`.vectahub/`、`.vectahub-workflows/`、agent-homes/、logs/
- **构建/缓存(gitignored)**:`dist/`、`*.tsbuildinfo`、`out/`、`.test-reports/`、`*.vsix`

## 已知文档缺口

`docs/README.md:43-46` 引用了 `docs/contracts/` 和 `docs/standards/` 这两个目录,**实际不存在**(设计缺口)。这两个目录不要当作权威入口;权威文档是 `docs/architecture.md`、`docs/agent-operating-guide.md`、`docs/testing.md`、`docs/usage.md`、`docs/release.md`、`docs/repository-permissions.md` 等直接存在的文件。

## Mandatory Boundaries

### Default Context Boundary(`getDefaultContext()`)

只允许出现在:
- `src/infrastructure/context.ts`(定义点)
- `src/cli-main.ts`、`src/cli-bootstrap.ts`(composition roots)
- `src/**/compat-bridge.ts` 或 `src/**/*-bridge.ts`(显式桥接)

其他文件直接调用 `getDefaultContext()` 是 **contract violation**,会被 `npm run check:default-context-usage` 阻塞。普通业务模块必须接收 `InfrastructureContext` 或更窄依赖(构造函数 / `createX(ctx)` factory)。

详见 `docs/agent-operating-guide.md` 的 "Default Context Boundary" 段。

### Behavior vs Configuration

- history / event / notification / telemetry / audit / returned-collection 改动 = **行为改动**
- 行为改动前必须有 characterization test
- 持久化字段改动要写明 writer / reader / 兼容性预期

### Public Repository Safety

不要提交:`.env`、token、private key、真实日志、未脱敏 trace、`.vectahub/`、Agent home、私有任务文档、`.vsix`。详见 `docs/repository-permissions.md`。

## Testing

- 主测试:`npm run test:run`(vitest)
- 单元为主,优先在 `src/**/*.test.ts`(跟随源码)
- 内存化测试:用 `createTestInfrastructureContext()` 避免文件系统副作用;参考 `docs/testing.md:115-144`
- `src/commands/run-task.ts` 等核心命令的测试矩阵在 `docs/testing.md:147-164`,改这些文件前对照

## Local CLI Usage

本地验证优先用 dev 入口(不依赖全局安装):

```bash
npm run dev -- <command> [--json]
```

只在验证构建产物时:

```bash
npm run build
node dist/cli.js <command>
```

`<command>` 占位见 `docs/testing.md:96-103`:`<docPath>` / `<taskId>` / `<taskLabel>` / `<tool>` / `<runId>` / `<traceId>`。

## Project-Level Agent System

本仓库有独立的多 agent 体系,与 `~/.agents/AGENTS.md` 的全局规则**并存**:

- **元数据 + tool 分配**:`.agents/manifest.yaml`(声明当前 scope、primary/support agent、skill/MCP 政策、handoff 政策)
- **当前 tool 的 adapter**:`.agents/tools/{trae-solo,opencode,cline,codex,antigravity}.md`(必读)
- **通用规则 + L0-L4 权限**:`.agents/global.md`、`.agents/permissions.md`
- **Skill/MCP 注册表**(全空,新增需走审批):`.agents/skills/{pending,approved,rejected}.yaml`、`.agents/mcp/{pending,approved,rejected}.yaml`
- **项目级 skill**(动态发现):`.opencode/skills/vectahub-*/`
- **Karpathy 整合 patch log**:`.opencode/skills/_meta/karpathy-integration.md`(全局 skill 的本地改动记录)

## Workflow Conventions

- 代码改动完成 → 必须自动执行:`npm run bump` → `npm run build` → `git add .` → `git commit -m "<type>(<scope>): ..."`
- `npm run bump` 同时修改根 + vscode-extension + doc-task-contract-core 三个 `package.json` 的 patch 号
- **AGENTS.md / 文档 / skill 改动**:不在硬性 commit 流程中 —— 完成后询问用户,不要自动 `bump + build + commit`
- commit message 格式:`<type>(<scope>): <lowercase active-voice description>`

### Pull Request Flow

远端 `main` 受 governance 保护,必须通过 PR 合并(由 `0a10e5a` 的 husky + `23b22dd` 的 governance docs 引入)。

- **agent 负责**:在本任务收尾时自动 `gh pr create`(L3 external write,需要显式确认后执行)
- **用户负责**:Review 并 merge PR(agent 不自动 merge / 不 force push)

agent 收到 PR 触发任务时的标准动作:

```bash
# 1. 本地先 rebase 集成远端新 commit(pull --rebase)
git pull --rebase

# 2. 推送到独立 feature branch(maint 受保护不能直接 push)
git push -u origin <type>/<scope>-<short-desc>

# 3. 用 gh CLI 开 PR 并把 URL 返回给用户审核
gh pr create \
  --base main \
  --head <type>/<scope>-<short-desc> \
  --title "<type>(<scope>): <description>" \
  --body "<changed files / verification / risks>"
```

PR body 必须包含(对应 Output Contract):
- changed files
- verification commands 实际跑过 + 结果
- failed / skipped verification
- residual risks / follow-up

## Output Contract

完成任何实现任务必须报告:
1. changed files
2. verification commands 实际跑过 + 结果
3. failed / skipped verification 及原因
4. residual risks / follow-up

**不要声称测试、lint、typecheck、build 通过,除非它们实际跑过并通过。**

## Small Bugfix Boundary

small bugfix 可以:
- 加或调测试、隔离纯逻辑、改进错误处理(不改变 public contract)

**不能**(默认情况下):
- 加依赖、新建 schema validator、新建持久化文件、改 CLI output contract、改 public API、改存储格式、大重构、删 exported function、删测试、删模块入口、改 history/event/notification/audit/returned-collection 语义

若候选改动落入以上任一,按设计任务处理,**先确认再动手**。