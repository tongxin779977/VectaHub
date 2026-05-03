# VectaHub CLI 命令清单

> 版本: 1.0.0 | 最后更新: 2026-05-03

---

## 📖 使用命令（日常使用）

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub run <intent>` | 自然语言执行工作流 | `[intent...]` 自然语言描述 | `vectahub run "查看 git 状态"` |
| `vectahub run -f <file>` | 从 YAML 文件执行 | `-f, --file <file>` 工作流文件路径 | `vectahub run -f workflow.yaml` |
| `vectahub run -m <mode>` | 指定执行模式 | `-m, --mode <strict\|relaxed\|consensus>` | `vectahub run -m strict "rm old.log"` |
| `vectahub run -s` | 执行后保存工作流 | `-s, --save` | `vectahub run -s "压缩图片"` |
| `vectahub run -y` | 跳过确认 | `-y, --yes` | `vectahub run -y "删除缓存"` |
| `vectahub run --no-edit` | 跳过命令编辑 | `--no-edit` | `vectahub run --no-edit "ls"` |
| `vectahub run --dry-run` | 预览不执行 | `--dry-run` | `vectahub run --dry-run "删除文件"` |
| `vectahub generate <desc>` | LLM 生成 YAML 工作流 | `<desc>` 自然语言描述 | `vectahub generate "每天备份数据库"` |
| `vectahub list` | 列出保存的工作流 | 无 | `vectahub list` |
| `vectahub history` | 查看执行历史 | 无 | `vectahub history` |
| `vectahub mode` | 查看/切换执行模式 | `[mode]` 可选，要设置的模式 | `vectahub mode strict` |

---

## 🔧 工具管理

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub tools list` | 列出所有工具 | 无 | `vectahub tools list` |
| `vectahub tools search <kw>` | 搜索工具 | `<keyword>` 关键词 | `vectahub tools search git` |
| `vectahub tools categories` | 查看工具分类 | 无 | `vectahub tools categories` |
| `vectahub tools info <name>` | 查看工具详情 | `<name>` 工具名 | `vectahub tools info git` |

---

## 📋 模板管理

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub templates list` | 列出可用模板 | `-c, --category <category>` 按分类过滤，`-t, --tag <tag>` 按标签过滤 | `vectahub templates list` |
| `vectahub templates use <name>` | 实例化模板 | `<name>` 模板名，`-p, --param <key=value>` 参数（可多次），`-o, --output <file>` 输出文件，`-s, --save` 保存到工作流库 | `vectahub templates use git-commit -s` |
| `vectahub templates save <workflow-id>` | 保存工作流为模板 | `<workflow-id>` 工作流 ID，`-n, --name <name>` 模板名，`-d, --description <desc>` 描述，`-c, --category <category>` 分类，`-t, --tags <tags>` 逗号分隔标签 | `vectahub templates save wf_1 -n daily-check` |

---

## ⚙️ 配置

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub setup` | 首次配置向导 | 无 | `vectahub setup` |
| `vectahub config show` | 显示当前配置 | 无 | `vectahub config show` |
| `vectahub config reset` | 重置配置 | 无 | `vectahub config reset` |
| `vectahub config tools` | 列出外部 CLI 工具 | 无 | `vectahub config tools` |

---

## 🔒 安全

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub security list` | 列出所有安全规则 | `--enabled` 仅显示启用规则，`--disabled` 仅显示禁用规则 | `vectahub security list` |
| `vectahub security add` | 添加安全规则 | `--name <name>` 规则名，`--description <desc>` 描述，`--category <cat>` 分类，`--severity <sev>` 严重程度，`--pattern <pattern>` 匹配模式（可多次），`--cli-tool <tool>` CLI 工具（可多次） | `vectahub security add --name "我的规则"` |
| `vectahub security update <rule-id>` | 更新安全规则 | `<rule-id>` 规则 ID，其他选项同 add | `vectahub security update my-rule` |
| `vectahub security delete <rule-id>` | 删除安全规则 | `<rule-id>` 规则 ID | `vectahub security delete my-rule` |
| `vectahub security enable <rule-id>` | 启用安全规则 | `<rule-id>` 规则 ID | `vectahub security enable my-rule` |
| `vectahub security disable <rule-id>` | 禁用安全规则 | `<rule-id>` 规则 ID | `vectahub security disable my-rule` |
| `vectahub security test <command>` | 测试命令安全性 | `<command>` 要测试的命令，`--cli-tool <tool>` CLI 工具 | `vectahub security test "git status"` |
| `vectahub security import <file>` | 导入安全规则 | `<file>` JSON 文件路径 | `vectahub security import rules.json` |
| `vectahub security export <file>` | 导出安全规则 | `<file>` 输出文件路径，`--include-disabled` 包含禁用规则 | `vectahub security export rules.json` |
| `vectahub security config` | 显示安全配置 | 无 | `vectahub security config` |
| `vectahub security status` | 显示安全状态 | 无 | `vectahub security status` |
| `vectahub security policy` | 显示安全策略详情 | 无 | `vectahub security policy` |

---

## 📊 审计

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub audit list` | 列出审计日志 | `--event <type>` 按事件类型过滤，`--module <name>` 按模块过滤，`--limit <number>` 最大数量 | `vectahub audit list --limit 20` |
| `vectahub audit query` | 查询审计日志（同 list） | 同 list | `vectahub audit query` |
| `vectahub audit stats` | 显示审计统计 | 无 | `vectahub audit stats` |

---

## 🩺 系统

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub doctor` | 系统诊断 | `--verbose` 显示详细诊断信息 | `vectahub doctor --verbose` |
| `vectahub serve` | 启动 Socket 服务 | 无 | `vectahub serve` |
| `vectahub client <cmd>` | Socket 客户端 | `<cmd>` submit/status/list/mode/config/shutdown | `vectahub client submit "ls"` |

---

## 🛠️ 开发命令（开发人员专用）

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub dev check` | 开发检查 | 无 | `vectahub dev check` |
| `vectahub dev status` | 开发状态 | 无 | `vectahub dev status` |
| `vectahub dev module` | 模块信息 | 无 | `vectahub dev module` |
| `vectahub dev validate` | 开发验证 | 无 | `vectahub dev validate` |
| `vectahub dev test` | 开发测试 | 无 | `vectahub dev test` |
| `vectahub dev build` | 开发构建 | 无 | `vectahub dev build` |

---

## ⏰ 定时任务

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub schedule` | 定时任务管理 | 详见子命令 | `vectahub schedule` |

---

## 👻 守护进程

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub daemon` | 守护进程管理 | 详见子命令 | `vectahub daemon` |

---

## 📝 帮助

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub --help` | 显示主帮助 | 无 | `vectahub --help` |
| `vectahub <command> --help` | 显示命令帮助 | 无 | `vectahub run --help` |
