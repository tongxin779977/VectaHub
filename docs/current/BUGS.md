# VectaHub 1.0 已知问题

> 更新日期: 2026-05-08
> 范围: 当前 TypeScript 1.0 CLI 与 VS Code 扩展集成

本文件只记录当前仍会影响使用或发布判断的问题。历史修复过程不再保留在 1.0 用户文档中。

## 当前问题

| ID | 问题 | 影响范围 | 状态 |
|----|------|----------|------|
| BUG-001 | 扩展包 lint 当前不干净 | 扩展包 CI | 待修复 |

## BUG-001: 扩展包 lint 当前不干净

现象:

`npm run lint -w packages/vectahub-vscode-extension` 失败，当前输出包含 5 个 error 和 14 个 warning。

主要错误:

- `packages/vectahub-vscode-extension/src/cli/adapter.ts`: `cliPath` 可改为 `const`。
- `packages/vectahub-vscode-extension/src/cli/discovery.ts`: 存在未使用 import 和空 block。
- `packages/vectahub-vscode-extension/src/project/packageManager.ts`: `vscode` import 未使用。

影响:

- 扩展包 CI 会被 lint 阻塞。
- GitHub Actions 如果启用扩展包 lint，会在该步骤失败。

建议修复:

1. 清理未使用 import 和变量。
2. 修复 `prefer-const`。
3. 移除空 block 或补充必要处理。
4. 保留 `no-explicit-any` 为 warning，逐步收敛。

## 已确认通过

最近一次本地验证:

```bash
npm run typecheck
```

结果: 通过。

## 发布前检查

发布或合并前至少执行:

```bash
npm run typecheck
npm exec -- vitest --run --exclude 'packages/vectahub-vscode-extension/src/test/**'
npm run build
npm run compile -w packages/vectahub-vscode-extension
npm run lint -w packages/vectahub-vscode-extension
```

VS Code 扩展集成测试需要 VS Code/Electron 环境，CI 中建议通过 `xvfb-run` 运行。
