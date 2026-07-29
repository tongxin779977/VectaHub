# AGENTS.md

> VectaHub 项目的开发 agent 单入口。
> 详细规范见 `docs/README.md`;本文只列高信号、repo-specific 的事实。

## Project

- **类型**:单用户、本地优先的 TypeScript CLI(workflow engine)
- **包管理**:npm workspaces(`packages/*`)
- **Node**:`>=21`(详见 `package.json:engines`),CI 测试 Node 22/24
- **TypeScript**:5.9,strict,ESM(NodeNext),target ES2022
- **构建**:tsup,产物在 `dist/`(gitignored)
- **测试**:vitest 4.1
- **当前版本**:`1.0.42`(同步在 3 个 `package.json`,见 `scripts/bump-version.mjs`)
- **可见性**:**public repository** —— 任何提交都可被公开读取。详见 `docs/README.md`

## Required Commands(顺序敏感)

CI(`.github/workflows/ci.yml`)按此顺序执行。**先跑过再声明通过**。

CI 实际跑的是 `test:coverage`(非 `test:run`),且 smoke test 有两条,还有 coverage 门禁和 benchmark 回归 job:

```bash
npm run typecheck               # tsc --noEmit
npm run lint                    # eslint src --ext .ts
npm run check:default-context-usage   # getDefaultContext() 白名单
npm run check:docs               # 文档内部链接检查
npm run test:coverage            # vitest --run --coverage(主 CI 排除 vscode-extension)
node scripts/check-coverage-threshold.mjs  # 覆盖率门禁(ubuntu+node22 only)
npm run build                    # tsup
node dist/cli.js --version       # 构建产物 smoke test #1
node dist/cli.js version --json  # 构建产物 smoke test #2
```

CI 还有独立 job:`benchmark`(`npm run bench` + `scripts/check-bench-regression.mjs`,>10% WARN,>25% FAIL)和 `vscode-extension`(`compile` + `lint` + `test`)。

本地开发常用(非 CI 顺序):

```bash
npm run test:run                 # vitest --run(无 coverage,本地首选)
npx vitest run src/path/to/file.test.ts  # 定向测试
npm test -w packages/vectahub-vscode-extension  # 扩展测试
npm run dev -- <command>         # tsx 开发入口(不依赖全局安装)
```

VS Code extension:

```bash
npm run compile:extension        # tsc + prepare-doc-task-contract-core
npm run package:vsix             # 打 .vsix(gitignored)
```

## Repository Layout

- **CLI 入口**:`src/cli.ts`(2 行 shim)→ `src/cli-bootstrap.ts`(`--version` 快速路径)→ `src/cli-main.ts`(DI composition root + 命令注册)→ `src/cli-command-registry.ts`(34 个 lazy proxy 命令)
- **核心层**(各目录有独立 AGENTS.md,详见下方 Hierarchy):
  - `src/cli-main.ts` + `src/cli-command-registry.ts` CLI 组装与命令注册
  - `src/infrastructure/` DI 容器(InfrastructureContext)、environment、config、logger、audit、trace、event、testing
  - `src/types/` 共享领域类型(28 文件,纯 interface/type,无运行时逻辑)
  - `src/utils/` 遗留兼容层(re-export 代理 + 未迁移工具,正在向 infrastructure/ 迁移)
  - `src/nl/` 自然语言路由(确定性 routing + ACP fallback)
  - `src/orchestration-plan/` 编排计划层(Intent/DocTask → OrchestrationPlan → WorkflowDraft → execute)
  - `src/execution/` 执行持久化层(ExecutionRecord JSONL 存储、rerun/resume/archive、queue)
  - `src/workflow/` workflow 引擎(`exec`/`if`/`for_each`/`parallel`/`opencli`/`delegate`)
  - `src/skills/` skills 系统(registry/executor/manager + ai-modules/iterative-refinement/llm-dialog-control)
  - `src/chat/` 交互式 REPL(`vectahub chat` 命令,NL → workflow → execute)
  - `src/agent-runtime/` Agent registry / descriptor / transport(适配器已移除)
  - `src/agent-runtime/transport/` ACP 传输层(AcpTransport/trace-bridge/audit-bridge/security-bridge)
  - `src/agent-runtime/acp/` ACP 客户端(acp-client/acp-types/acp-result-mapper)
  - `src/security-protocol/` 命令风险评估 pipeline(3 层 evaluator + circuit-breaker)
  - `src/sandbox/` 进程/文件系统隔离(sandbox-exec/bubblewrap/unshare/directory)
  - `src/command-rules/` 静态 blocklist/allowlist 规则引擎
  - `src/commands/` 命令实现(95 文件,LLM 命令已移除)
- **Workspace 包**(详见 `packages/AGENTS.md`):
  - `packages/doc-task-contract-core/` 共享文档任务合同逻辑(`@vectahub/doc-task-contract-core`,纯 JS + .d.ts,无构建)
  - `packages/vectahub-vscode-extension/` VS Code extension(独立 tsc + vitest,通过 child_process + --json 协议消费 CLI)
- **文档**:
  - `docs/` 公开 ACP 改造蓝图(`00-vision.md` 到 `09-execution-plan.md`,入口 `docs/README.md`)
  - `docs-private/` 私有开发文档(已 gitignored,含 backlog/design/contracts/standards/ui)
- **运行时数据(用户层,不要提交)**:`.vectahub/`、`.vectahub-workflows/`、agent-homes/、logs/
- **构建/缓存(gitignored)**:`dist/`、`*.tsbuildinfo`、`out/`、`.test-reports/`、`*.vsix`

### AGENTS.md Hierarchy

每个有 AGENTS.md 的目录只记载该目录的非显然事实,不重复父级内容:

```
./AGENTS.md                          ← 你在这里
├── src/commands/AGENTS.md
├── src/orchestration-plan/AGENTS.md
├── src/infrastructure/AGENTS.md
├── src/workflow/AGENTS.md
├── src/security-protocol/AGENTS.md
├── src/sandbox/AGENTS.md
├── src/nl/AGENTS.md
├── src/agent-runtime/AGENTS.md
├── src/execution/AGENTS.md
├── src/skills/AGENTS.md
├── src/types/AGENTS.md
├── src/utils/AGENTS.md
├── src/chat/AGENTS.md
├── packages/AGENTS.md
└── docs-private/AGENTS.md
```

## 文档集

`docs/00-vision.md` 到 `docs/09-execution-plan.md`(ACP 改造蓝图,全部完成),入口 `docs/README.md`。

## Mandatory Boundaries

### Default Context Boundary(`getDefaultContext()`)

只允许出现在:
- `src/infrastructure/context.ts`(定义点)
- `src/cli-main.ts`、`src/cli-bootstrap.ts`(composition roots)
- `src/**/compat-bridge.ts` 或 `src/**/*-bridge.ts`(显式桥接)

其他文件直接调用 `getDefaultContext()` 是 **contract violation**,会被 `npm run check:default-context-usage` 阻塞。普通业务模块必须接收 `InfrastructureContext` 或更窄依赖(构造函数 / `createX(ctx)` factory)。

详见 `docs/README.md` 的 "Default Context Boundary" 段。

### Behavior vs Configuration

- history / event / notification / telemetry / audit / returned-collection 改动 = **行为改动**
- 行为改动前必须有 characterization test
- 持久化字段改动要写明 writer / reader / 兼容性预期

### Public Repository Safety

不要提交:`.env`、token、private key、真实日志、未脱敏 trace、`.vectahub/`、Agent home、私有任务文档、`.vsix`。详见 `docs/README.md`。

## Testing

- 主测试:`npm run test:run`(vitest,本地首选)或 `npm run test:coverage`(CI 用)
- 单元为主,优先在 `src/**/*.test.ts`(跟随源码);扩展测试在 `packages/vectahub-vscode-extension/test/`
- 内存化测试:用 `createTestInfrastructureContext()`(MockEnvironmentService + MockLoggerService + MockAuditService)避免文件系统副作用
- 用 `setDefaultContext()` 的测试必须在 `afterEach` 调 `resetDefaultContext()`;设 `process.env.VECTAHUB_HOME` 的测试必须清理
- 覆盖率门禁:lines/functions/statements >= 50%,branches >= 45%(`scripts/check-coverage-threshold.mjs`)
- benchmark 回归:`npm run bench` + `scripts/check-bench-regression.mjs`(>10% WARN,>25% FAIL)

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

`<command>` 占位见 `docs/README.md`:`<docPath>` / `<taskId>` / `<taskLabel>` / `<tool>` / `<runId>` / `<traceId>`。

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

## Token Discipline

- explore agent 默认用 `thoroughness: "quick"`,只在明确要求"very thorough"时才升级
- 多个独立搜索任务用 `run_in_background: true` 并行,不要串行
- 派发 3+ 个独立 task 时,一次性全部 `run_in_background: true`,等全部完成再收集结果

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