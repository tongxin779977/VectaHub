# VectaHub 1.1 已知问题

> 更新日期: 2026-05-09
> 范围: 当前 TypeScript 1.1 CLI 与 VS Code 扩展集成

本文件只记录当前仍会影响使用或发布判断的问题。
历史修复过程不再保留在 1.0 用户文档中。
要求输出的问题必须包含：
1. **代码溯源 (Trace)**: 精确到具体文件和行号。
2. **预期行为 (DoD)**: 明确定义修复后的正确状态。
3. **验证方式**: 提供具体的测试步骤或检查项，确保修复可闭环验证。

## 当前问题

| ID | 问题描述 (溯源) | 预期行为 (Definition of Done) | 验证方式 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **GH Actions 按钮位置错误**<br>(Trace: `tasksView.ts:L88`) | 将 `fetchGhErrors` 按钮 from `vhItems` 移动到 `gitItems` 集合中。 | 侧边栏“Git 仓库”分类下出现该按钮，且功能正常。 | 待修复 |
| 2 | **获取错误记录无反馈/不刷新**<br>(Trace: `fetchGhErrors.ts:L11`) | 1. 实时流式输出 CLI 的 stdout/stderr 到 Output Channel；<br>2. 同步成功后自动触发 `TasksViewProvider.refresh()`。 | 点击后 Output 频道出现实时命令执行日志；完成后“诊断队列”分类自动更新。 | 已修复 |
| 3 | **缺少“执行自定义意图”入口**<br>(Trace: `tasksView.ts:L93`) | 在 `vhItems` 数组中新增一个关联 `vectahubTasks.runIntent` 的 `TaskTreeItem`。 | 插件“VectaHub 核心”分类下出现该按钮，点击可弹出自然语言输入框。 | 待修复 |
| 4 | **硬编码路径依赖**<br>(Trace: `system-workflows.ts:L25`) | 1. 将 `node dist/cli.js` 替换为动态路径（如使用环境变量或相对可执行文件路径）；<br>2. 确保 `templates/` 路径可配置或相对于项目根目录寻址。 | 修改构建输出目录或在非根目录下运行工作流，确认 `commandToFix` 仍能正确触发。 | 已修复 |
| 5 | **GitHub Actions 修复能力字段名错误**<br>(Trace: `github-actions-repair.ts:L54`) | 将 `--json id,name,conclusion,createdAt` 中的 `id` 字段替换为 `databaseId`，因为 GitHub CLI 实际返回的字段名是 `databaseId` 而非 `id`。 | 运行 `vectahub run "处理github上所有的actions错误"` 或其他使用该能力的意图，确认第一步 "discover" 能正常执行并返回数据。 | 已修复 |



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
