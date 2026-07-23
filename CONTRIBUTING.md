# Contributing to VectaHub

感谢你考虑为 VectaHub 做贡献。本文档说明开发流程、提交规范与本地验证步骤。

## 工作流概览

VectaHub 使用 **trunk-based + 短期特性分支** 模式:

```
main      ── 受保护,只接受通过 PR 的合并
develop   ── 默认分支,日常集成目标
feat/*    ── 短期特性分支(<= 1 周)
fix/*     ── bug 修复分支
chore/*   ── 杂项(依赖、CI 文档)
docs/*    ── 纯文档变更
```

1. 从最新的 `develop` 拉特性分支:
   ```bash
   git fetch origin
   git switch -c feat/<short-kebab-description> origin/develop
   ```
2. 提交 PR **target `develop`**(默认分支),不要直接 target `main`。
3. `main` 仅通过发布流程(`release.yml`)周期性合并 `develop`,或者 hotfix。

## 本地开发

### 环境要求

- Node.js `>= 21`(仓库声明 `engines.node >=21`,CI 矩阵 20/22/24)
- npm `>= 10`(随 Node 22 自带)
- Git `>= 2.40`

### 一次性初始化

```bash
npm ci
npm run build
npm run prepare    # 启用 husky git hooks
```

### 日常命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动 CLI(`tsx` 监听模式) |
| `npm run typecheck` | 跑 `tsc --noEmit` |
| `npm run lint` | 跑 eslint |
| `npm test` | 跑 vitest 监听模式 |
| `npm run test:run` | 跑一次 vitest |
| `npm run build` | tsup 打包到 `dist/` |
| `npm run check:docs` | 校验文档链接与相对路径 |
| `npm run check:default-context-usage` | 校验 LLM 默认上下文用量 |
| `npm run package:vsix` | 打 VS Code 扩展包 |

## 提交规范

VectaHub 使用 **Conventional Commits** 强制(由 commitlint + husky 校验):

```
<type>(<scope>): <subject>

<body>

<footer>
```

`type` 必须为:

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `docs` | 仅文档变更 |
| `style` | 仅格式(空格、分号等) |
| `refactor` | 重构,无行为变化 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建/CI 变更 |
| `ci` | CI 配置 |
| `chore` | 杂项(依赖、配置) |
| `revert` | 回滚 |

`scope` 可选,常用:`cli`、`agent`、`workflow`、`template`、`provider`、`docs`、`ci`。

破坏性变更必须在 footer 写 `BREAKING CHANGE: <说明>`。

## PR 流程

1. **提交前**跑完自检清单(见 PR 模板)。
2. 推送到 `origin`:
   ```bash
   git push origin feat/<name>
   ```
3. 在 GitHub 开 PR,base 选择 **`develop`**。
4. CI 必须全绿(`CI` workflow 的 `root` + `vscode-extension` job)。
5. CODEOWNER review:触及 `.github/`、`docs/`、`packages/**` 等关键路径必须 `@tongxin779977` 通过。
6. Squash merge,commit message 自动从 PR title 生成(也需符合 Conventional Commits)。

## 测试要求

- 新功能必须有单元测试覆盖核心逻辑。
- Bug 修复必须先写一个失败用例,再修。
- 修改公共 API 必须更新 `docs/README.md`。
- 性能敏感路径请加 `*.bench.ts`(vitest bench)。

## 文档要求

- 新增/修改功能,文档与代码同 PR。
- 文档路径 `docs/<feature>.md`,在 `README.md` 导航表中登记。
- 命令、路径、链接必须真实存在(`npm run check:docs` 会校验)。

## 安全披露

请遵循 [`SECURITY.md`](./SECURITY.md),**不要** 在公开 issue 中粘贴漏洞细节。

## 行为准则

请阅读 [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)。

## 仓库边界

请阅读 [`docs/README.md`](./docs/README.md),明确哪些内容可以/不可以提交。