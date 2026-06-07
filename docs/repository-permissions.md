# 仓库可见性与提交权限

> Document Status: Current Repository Policy
> Authority: 公开仓库内容边界、Git 提交边界和 GitHub 治理建议。
> Last Verified: 2026-06-07

## 当前可见性

VectaHub 当前 GitHub 仓库是 public repository。任何提交到仓库的文件，都应被视为可被公开读取、复制和索引。

Git 不能在同一个公开仓库内实现“某些已提交文件只给部分人看”。如果内容不能公开，就不应该提交到这个仓库。

## 可以提交

- 源码、测试、构建配置和公开 CI/CD workflow。
- 公开产品文档、使用手册、架构说明、合同规格和标准。
- 不含真实凭证、真实用户数据或私有路径的示例。
- 脱敏后的错误摘要、排障步骤和验证说明。

## 不可以提交

- `.env`、API key、token、password、private key、auth 文件。
- 真实用户数据、私有任务文档、未脱敏 prompt、完整 stdout/stderr、完整 trace。
- `.vectahub/`、`.vectahub-workflows/`、Agent home、IDE 临时目录、运行缓存。
- `node_modules/`、`dist/`、coverage、日志、`.vsix` 产物和本地构建输出。
- 包含公司内部信息、客户信息或未获授权第三方内容的文档。

## GitHub 权限建议

当前建议在 GitHub 仓库设置中启用：

- 保护 `main` 分支。
- 禁止 force push 到 `main`。
- 要求 Pull Request 合并。
- 要求 `CI` 通过后才能合并。
- 对 `.github/**`、`README.md`、`AGENTS.md`、`docs/contracts/**`、`docs/standards/**` 和本文档启用 CODEOWNERS review。
- 发布 workflow 的 secrets 仅配置在 GitHub Secrets，不写入文档、日志或源码。

## CODEOWNERS 边界

`.github/CODEOWNERS` 已声明关键路径的默认 owner。它只有在 GitHub branch protection 启用 “Require review from Code Owners” 后才会强制生效。

## 文档分级

| 类型 | 是否可提交 | 说明 |
|------|------------|------|
| Public product docs | 可以 | README、产品说明、使用手册。 |
| Maintainer docs | 可以 | 架构、开发、测试、发布、合同和标准。 |
| Historical design docs | 可以，需标注 | 必须写清 `Target Design`、`Migration Contract` 或 `Historical Reference`。 |
| Local/private docs | 不可以 | 私有任务、客户信息、未脱敏日志、个人配置。 |

## 提交前检查

提交前至少确认：

- 没有新增 `.env`、token、private key、真实日志或未脱敏 trace。
- 新文档中的命令、路径和链接真实存在。
- 当前能力与目标设计分开描述。
- 删除或移动文档后已检查相对链接。
