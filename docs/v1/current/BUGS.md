# VectaHub 1.1 已知问题

> 更新日期: 2026-05-09
> 范围: 当前 TypeScript 1.1 CLI 与 VS Code 扩展集成

本文件只记录当前仍会影响使用或发布判断的问题。
历史修复过程不再保留在 1.0 用户文档中。
要求输出的问题可追溯到一些具体的代码行，而不是模糊的描述。

## 当前问题

| ID     | 问题     | 影响范围   | 状态     |
| ------ | ------ | ------ | ------ |
| <br /> | <br /> | <br /> | <br /> |


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
