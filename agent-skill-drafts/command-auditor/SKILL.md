---
name: command-auditor
description: 当用户要求审查命令、安全检查、执行 shell/CLI 命令，或处理 rm/sudo/curl/wget/git push/publish 等高风险操作时触发。用于通用命令风险分级和确认策略，不绑定具体项目。
---

# Command Auditor

## When to Use

- 用户要求运行、生成或审查 shell/CLI 命令。
- 命令包含删除、写入系统路径、权限提升、网络下载执行、发布、推送或密钥相关操作。
- 需要判断命令是否可以直接执行、需要确认，或必须阻断。

## Risk Levels

| Level | Examples | Action |
|------|----------|--------|
| Critical | `rm -rf /`, `sudo rm`, 远程脚本管道执行，写入系统目录，泄露密钥 | 阻断并等待明确确认 |
| High | 删除项目文件、改配置、commit/push/publish、修改数据库/API 合约 | 复述风险并确认 |
| Medium | 安装依赖、网络请求、批量文件改动、迁移脚本 | 说明影响范围，必要时确认 |
| Low | 只读命令、测试、lint、状态查看 | 可直接执行 |

## Workflow

1. **Parse**：识别命令、参数、工作目录和输入来源。
2. **Classify**：按风险等级分类，说明原因。
3. **Sanitize**：避免直接拼接未校验用户输入；必要时建议安全参数或只读替代命令。
4. **Confirm**：高风险和破坏性操作必须先复述任务、风险、预期结果，等待确认。
5. **Report**：执行后只报告真实结果；没有运行就不要声称成功。

## Constraints

- 不暴露、打印或记录 secrets、token、password、private key。
- 不执行远程脚本管道安装，除非用户明确确认且来源可信。
- 不强推主分支，不绕过安全检查。
- 不发明项目专属审计 API；需要项目审计时先读取项目文档和源码。

## Output Shape

```markdown
## 命令审计

- 命令：
- 风险等级：
- 风险原因：
- 建议处理：
- 是否需要确认：
```
