# 发布指南

本文记录当前仓库中可以确认的发布和打包入口。实际发布前必须结合当前分支、版本策略和 registry 权限再次确认。

## 当前脚本

`package.json` 中与发布相关的脚本：

| 命令 | 用途 |
|------|------|
| `npm run bump` | 运行 `scripts/bump-version.mjs`。 |
| `npm run build` | 构建 CLI。 |
| `npm run compile:extension` | 编译 VS Code extension。 |
| `npm run package:vsix` | 编译并打包 VSIX。 |
| `npm run release` | 依次运行 bump、build、package:vsix，并执行 `npm link`。 |
| `npm run prepublishOnly` | npm publish 前运行 build。 |

## 发布前检查

建议发布前至少运行：

```bash
npm install
npm run typecheck
npm run test:run
npm run build
npm run compile:extension
```

如果要发布 VSIX：

```bash
npm run package:vsix
```

如果要发布 npm 包，确认 `prepublishOnly` 会执行：

```bash
npm run prepublishOnly
```

## 版本检查

发布前确认以下版本信息一致：

- `package.json` 中的 `version`
- README 或文档中的版本徽章
- npm 或 VSIX 发布目标版本

如果发现版本漂移，应先修正文档或版本文件，再继续发布。

## VSIX 打包

当前 `package:vsix` 会：

1. 编译 `packages/vectahub-vscode-extension`。
2. 清理 `.DS_Store`。
3. 在 extension workspace 中运行 `npx vsce package --allow-missing-repository --no-yarn --no-dependencies`。

打包失败时优先检查 extension 编译、依赖安装和 `vsce` 输出。

## npm 发布边界

当前 `package.json` 的 `files` 只包含：

```json
["dist"]
```

发布 npm 前必须确认 `dist` 已由 `npm run build` 生成，并且 CLI 入口 `dist/cli.js` 存在。

## 发布记录

当前计划不修改根目录，不新增 `CHANGELOG.md`。如果未来启用变更日志，建议遵循 Keep a Changelog，并在发布 PR 中记录新增、修复、破坏性变更和迁移说明。

