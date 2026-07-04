## 变更说明

<!-- 简洁描述这次 PR 解决的问题 / 引入的能力 / 修复的 bug -->

## 关联 Issue

<!-- 关联的 issue 编号,例如 Closes #123,Refs #456 -->

## 变更类型

- [ ] feat: 新功能
- [ ] fix: bug 修复
- [ ] refactor: 重构(无行为变化)
- [ ] perf: 性能优化
- [ ] test: 测试相关
- [ ] docs: 文档变更
- [ ] build: 构建/CI 变更
- [ ] chore: 杂项(依赖、配置等)

## 变更范围

<!-- 勾选涉及范围,reviewer 据此分流 -->

- [ ] `src/` 核心代码
- [ ] `packages/vectahub-vscode-extension/` VS Code 扩展
- [ ] `packages/doc-task-contract-core/` 契约核心
- [ ] `templates/` 工作流模板
- [ ] `config/` 配置
- [ ] `docs/` 文档
- [ ] `.github/` 工作流 / 治理
- [ ] `scripts/` 脚本

## 自检清单

- [ ] 已运行 `npm run typecheck`
- [ ] 已运行 `npm run lint`
- [ ] 已运行 `npm test`
- [ ] 已运行 `npm run build`
- [ ] 已运行 `npm run check:docs`
- [ ] 已运行 `npm run check:default-context-usage`
- [ ] 新增/修改的代码包含测试
- [ ] 公共 API 变更已更新 `docs/capabilities-reference.md`
- [ ] 未引入凭证、真实用户数据或私有路径(参见 `docs/repository-permissions.md`)
- [ ] Commit message 符合 Conventional Commits(`feat:` / `fix:` / `chore:` / ...)

## 风险与影响

<!--
- 是否有破坏性变更?(是 → 描述迁移路径)
- 是否影响持久化(schema、文件格式、配置)?
- 是否触及安全相关代码?
- 是否需要发布前额外验证(手动 smoke、人工 review)?
-->

## 测试说明

<!--
- 怎么手工验证这次改动?
- 跑了哪些自动化测试?
- 有没有贴关键日志或截图?
-->

## Reviewer 重点关注

<!--
希望 reviewer 重点看哪几个文件/哪几个决策?
-->