# Security Policy

VectaHub 重视安全。本文档说明如何报告漏洞以及我们的响应承诺。

## 支持版本

| 版本 | 支持状态 |
|---|---|
| `>= 1.0.x` | ✅ 积极支持 |
| `< 1.0.0` | ❌ 不再支持 |

VS Code 扩展版本与 npm 包同步。

## 报告漏洞

**请不要** 在公开 GitHub issue 中报告未修复的安全问题。

请通过以下任一私密渠道报告:

- **GitHub Security Advisories**(推荐):
  打开 [New security advisory](https://github.com/tongxin779977/VectaHub/security/advisories/new) 起草。
- **Email**: <security@vectahub.dev>(若有;若无,请用上方 GitHub 渠道)

报告应包含:

1. 受影响的版本/分支/提交 SHA
2. 漏洞类别(命令注入、SSRF、路径穿越、依赖漏洞、供应链...)
3. 触发条件与最小复现步骤
4. 潜在影响(数据泄露、权限提升、远程代码执行等)
5. 已知缓解措施(若有)
6. 是否已被利用

请**不要** 在初报中附加真实用户数据、未脱敏日志或利用代码。

## 响应承诺

| 阶段 | 时限 |
|---|---|
| 初次确认 | 3 个工作日内 |
| 初步评估与影响面确认 | 7 个工作日内 |
| 修复 / 缓解方案 | 严重 7 日,中 30 日,低 90 日 |
| 公开披露 | 修复发布后 90 日内,或与 reporter 协商 |

严重等级评估依据:

- **Critical**:远程未授权代码执行、凭据泄露
- **High**:权限提升、显著数据泄露
- **Medium**:需特定条件的注入、有限数据泄露
- **Low**:信息泄露、理论问题、最佳实践偏离

## 安全最佳实践(贡献者)

提交前自查:

- 不引入 `.env`、token、private key、真实凭据
- 不引入真实用户数据、私有 prompt、未脱敏日志
- 路径穿越:`path.resolve` + 检查最终路径仍在允许目录内
- 命令注入:`shell-quote` quote 用户输入,不要直接拼字符串
- SSRF:网络请求限定白名单或允许的协议
- 依赖:`npm audit` 通过(由 CI 强制)

## 自动安全机制

仓库已经启用以下自动化:

- `npm audit` 每日扫描(`.github/workflows/security.yml`)
- Dependabot 周/月级依赖更新
- CI 失败自动 issue(`.github/workflows/self-healing.yml`)
- `.gitignore` 与 `.github/CODEOWNERS` 防止敏感文件被误提交

## 致谢

我们感谢负责任的披露。可在 CVE 公开时附 reporter 致谢(经本人同意)。