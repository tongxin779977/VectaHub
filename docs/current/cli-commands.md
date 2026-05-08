# VectaHub 1.0 CLI 命令参考

> 适用版本: VectaHub 1.0.0
> 说明: 本页按当前源码暴露的命令整理。部分懒加载命令的完整参数以 `vectahub <command> --help` 为准。

## 全局选项

| 选项 | 说明 |
|------|------|
| `-v, --verbose` | 输出更多运行信息 |
| `-d, --debug` | 调试模式，包含详细日志 |
| `--non-interactive` | 非交互模式，适合 CI/CD |
| `--help` | 查看帮助 |
| `--version` | 查看版本 |

## 日常执行

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub run [intent...]` | 从自然语言生成并执行工作流 | `vectahub run "查看 git 状态"` |
| `vectahub run -f <file>` | 从 YAML/JSON 文件执行工作流 | `vectahub run -f workflow.yaml` |
| `vectahub run --dry-run` | 只预览，不执行 | `vectahub run --dry-run "删除缓存"` |
| `vectahub run --json` | 输出 JSON 结果 | `vectahub run --dry-run --json "查看 git 状态"` |
| `vectahub run -m <mode>` | 指定执行模式 | `vectahub run -m strict "查看目录"` |
| `vectahub run -s` | 执行后保存工作流 | `vectahub run -s "运行测试"` |
| `vectahub run -y` | 跳过确认 | `vectahub run -y "查看 git 状态"` |
| `vectahub run --no-edit` | 跳过命令编辑 | `vectahub run --no-edit "查看目录"` |

`run` 的模式值为 `strict`、`relaxed`、`consensus`。

## 配置和诊断

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub version` | 显示版本 | `vectahub version --json` |
| `vectahub doctor` | 检查本地环境 | `vectahub doctor` |
| `vectahub setup` | 运行安装和配置流程 | `vectahub setup` |
| `vectahub config show` | 显示当前配置 | `vectahub config show` |
| `vectahub config reset` | 重置配置并重新配置 | `vectahub config reset` |
| `vectahub config tools` | 列出已配置外部 CLI | `vectahub config tools` |
| `vectahub completion <shell>` | 生成 shell 补全脚本 | `vectahub completion zsh` |

## 工作流与历史

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub list` | 列出保存的工作流 | `vectahub list` |
| `vectahub list versions <workflowId>` | 查看工作流版本 | `vectahub list versions wf_1` |
| `vectahub rollback <workflowId> <version>` | 回滚工作流版本 | `vectahub rollback wf_1 2` |
| `vectahub history` | 查看执行历史 | `vectahub history` |
| `vectahub detail <executionId>` | 查看执行详情 | `vectahub detail exec_123` |
| `vectahub rerun <executionId>` | 重新执行历史记录 | `vectahub rerun exec_123` |
| `vectahub resume <executionId>` | 恢复失败或暂停的执行 | `vectahub resume exec_123` |
| `vectahub archive` | 归档执行记录 | `vectahub archive --list` |
| `vectahub export` | 导出 VectaHub 数据 | `vectahub export -o backup` |
| `vectahub import <file>` | 导入 VectaHub 数据 | `vectahub import backup/export.json --dry-run` |

## 生成和模板

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub generate <description>` | 使用 LLM 生成 YAML 工作流 | `vectahub generate "检查项目并运行测试"` |
| `vectahub generate -o <file>` | 指定输出文件 | `vectahub generate "构建项目" -o build.yaml` |
| `vectahub generate -s` | 保存到工作流库 | `vectahub generate "每日检查" -s` |
| `vectahub generate -e` | 生成后立即执行 | `vectahub generate "运行测试" -e` |
| `vectahub templates list` | 列出模板 | `vectahub templates list` |
| `vectahub templates use <name>` | 使用模板 | `vectahub templates use git-commit` |
| `vectahub templates save <workflowId>` | 保存工作流为模板 | `vectahub templates save wf_1 -n daily-check` |

## 安全

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub mode` | 查看或切换执行模式 | `vectahub mode strict` |
| `vectahub security status` | 查看安全状态 | `vectahub security status` |
| `vectahub security policy` | 查看安全策略 | `vectahub security policy` |
| `vectahub security list` | 列出安全规则 | `vectahub security list --enabled` |
| `vectahub security test <command>` | 测试命令安全性 | `vectahub security test "git status"` |
| `vectahub security add` | 添加规则 | `vectahub security add --name safe --pattern "git status"` |
| `vectahub security update <ruleId>` | 更新规则 | `vectahub security update my-rule --severity high` |
| `vectahub security delete <ruleId>` | 删除规则 | `vectahub security delete my-rule` |
| `vectahub security enable <ruleId>` | 启用规则 | `vectahub security enable my-rule` |
| `vectahub security disable <ruleId>` | 禁用规则 | `vectahub security disable my-rule` |
| `vectahub security import <file>` | 导入规则 | `vectahub security import rules.json` |
| `vectahub security export <file>` | 导出规则 | `vectahub security export rules.json` |
| `vectahub security reset` | 重置为默认规则 | `vectahub security reset --force` |
| `vectahub security config` | 显示安全配置 | `vectahub security config` |

## 工具管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub tools list` | 列出已注册工具 | `vectahub tools list --json` |
| `vectahub tools info <toolName>` | 查看工具信息 | `vectahub tools info git` |
| `vectahub tools commands <toolName>` | 查看工具命令 | `vectahub tools commands npm` |
| `vectahub tools command <toolName> <commandName>` | 查看具体命令 | `vectahub tools command git status` |
| `vectahub tools test <toolName> <command>` | 测试工具命令风险 | `vectahub tools test git "git status"` |
| `vectahub tools known` | 列出可注册工具 | `vectahub tools known` |
| `vectahub tools register <toolName>` | 注册工具 | `vectahub tools register git` |
| `vectahub tools rules` | 查看规则引擎状态 | `vectahub tools rules` |
| `vectahub tools eval <command...>` | 用规则引擎评估命令 | `vectahub tools eval git status` |
| `vectahub tools search <keyword>` | 搜索工具和命令 | `vectahub tools search git` |
| `vectahub tools categories` | 查看工具分类 | `vectahub tools categories` |
| `vectahub tools category <name>` | 查看分类下工具 | `vectahub tools category vcs` |

## 审计和监控

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub audit list` | 查看最近审计日志 | `vectahub audit list --limit 20` |
| `vectahub audit query` | 查询审计日志 | `vectahub audit query --module workflow` |
| `vectahub audit stats` | 查看审计统计 | `vectahub audit stats` |
| `vectahub monitor start` | 启动性能监控 | `vectahub monitor start` |
| `vectahub monitor stop` | 停止性能监控 | `vectahub monitor stop` |
| `vectahub monitor status` | 查看当前指标 | `vectahub monitor status` |
| `vectahub monitor alerts` | 查看告警 | `vectahub monitor alerts` |
| `vectahub monitor reset` | 重置指标和告警 | `vectahub monitor reset` |
| `vectahub monitor config` | 配置阈值 | `vectahub monitor config --cpu-warning 80` |

## 服务和后台任务

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub serve` | 启动后台服务 | `vectahub serve` |
| `vectahub serve --daemon` | 守护进程模式启动服务 | `vectahub serve --daemon` |
| `vectahub client submit <input>` | 提交服务任务 | `vectahub client submit "查看 git 状态"` |
| `vectahub client status <taskId>` | 查看任务状态 | `vectahub client status task_1` |
| `vectahub client list` | 列出服务任务 | `vectahub client list` |
| `vectahub client mode [mode]` | 查看或设置服务沙箱模式 | `vectahub client mode STRICT` |
| `vectahub client config` | 查看服务配置 | `vectahub client config` |
| `vectahub client shutdown` | 关闭服务 | `vectahub client shutdown` |
| `vectahub daemon start` | 启动守护进程 | `vectahub daemon start` |
| `vectahub daemon stop` | 停止守护进程 | `vectahub daemon stop` |
| `vectahub daemon status` | 查看守护进程状态 | `vectahub daemon status` |
| `vectahub schedule add` | 添加定时任务 | `vectahub schedule add -n check -c "* * * * *" -e "npm test"` |
| `vectahub schedule list` | 查看定时任务 | `vectahub schedule list` |
| `vectahub schedule remove --id <id>` | 删除定时任务 | `vectahub schedule remove --id schedule_1` |

## 调试、插件和开发

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub debug` | 工作流调试命令组 | `vectahub debug state` |
| `vectahub plugins list` | 列出插件 | `vectahub plugins list` |
| `vectahub plugins info <pluginId>` | 查看插件信息 | `vectahub plugins info demo` |
| `vectahub plugins enable <pluginId>` | 启用插件 | `vectahub plugins enable demo` |
| `vectahub plugins disable <pluginId>` | 禁用插件 | `vectahub plugins disable demo` |
| `vectahub verify` | 运行校验检查 | `vectahub verify --type typecheck` |
| `vectahub test [module]` | 运行模块测试 | `vectahub test workflow` |
| `vectahub build` | 构建项目 | `vectahub build` |
| `vectahub check` | 检查项目配置 | `vectahub check` |
| `vectahub dev` | 开发辅助命令组 | `vectahub dev status` |

## JSON 输出说明

1.0 中已有部分命令提供 `--json`，例如:

- `vectahub version --json`
- `vectahub run --dry-run --json "<intent>"`
- `vectahub tools list --json`
- `vectahub security test --json "<command>"`

不要假设所有命令都有稳定 JSON 输出。自动化调用时应只依赖明确暴露 `--json` 的命令，并处理非零退出码。
