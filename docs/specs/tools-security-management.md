# 工具与安全规则规格

## 目标

本文档覆盖 CLI 工具注册、工具命令查询、命令规则评估、安全规则管理和直接命令执行。实现依据为 `src/commands/tools.ts`、`src/commands/security.ts` 和 `src/commands/run-command.ts`。

## 工具注册与查询

`tools` 命令管理 CLI tool registry。

| 命令 | 用途 | JSON |
|------|------|------|
| `tools list` | 列出已注册工具。 | 支持 |
| `tools agents` | 列出 AI Agent CLI 安装、版本、启用和权限状态。 | 支持 |
| `tools info <toolName>` | 查看工具信息。 | 否 |
| `tools commands <toolName>` | 查看工具命令列表。 | 否 |
| `tools command <toolName> <commandName>` | 查看单个命令详情。 | 否 |
| `tools test <toolName> <command>` | 检查指定工具命令是否危险。 | 否 |
| `tools known` | 查看已知可注册工具。 | 否 |
| `tools register <toolName|all>` | 注册已知工具。 | 否 |
| `tools search <keyword>` | 搜索工具和命令。 | 否 |
| `tools categories` | 列出工具分类。 | 否 |
| `tools category <name>` | 列出某分类下工具。 | 否 |

当前 `register all` 不代表所有工具完整实现；代码中会提示完整工具定义需要逐个补齐。

## 命令规则引擎

| 命令 | 用途 |
|------|------|
| `tools rules --template <default|strict|relaxed>` | 查看命令规则模板。 |
| `tools eval <command...> --template <template>` | 用规则引擎评估命令。 |

规则引擎先于安全协议用于快速判定 block/allow。没有命中的命令继续进入安全协议。

## 安全规则管理

`security` 命令管理安全协议规则。

| 命令 | 用途 | JSON |
|------|------|------|
| `security status` | 查看安全规则总数、启用数、数据库版本等。 | 否 |
| `security policy` | 查看当前安全策略配置。 | 否 |
| `security list` | 列出规则，支持 `--enabled` / `--disabled`。 | 否 |
| `security add` | 新增规则。 | 否 |
| `security update <ruleId>` | 更新规则。 | 否 |
| `security delete <ruleId>` | 删除规则。 | 否 |
| `security enable <ruleId>` | 启用规则。 | 否 |
| `security disable <ruleId>` | 禁用规则。 | 否 |
| `security import <filePath>` | 从 JSON 文件导入规则。 | 否 |
| `security export <filePath>` | 导出规则，可 `--include-disabled`。 | 否 |
| `security test <command>` | 检测命令风险。 | 支持 |
| `security reset --force` | 重置默认规则。 | 否 |
| `security config` | 查看安全配置摘要。 | 否 |

## 直接命令执行

`run-command <command...>` 会先执行安全扫描，再构造单步 workflow 执行命令。

支持选项：

- `--mode strict|relaxed|consensus`
- `--json`
- `--dry-run`

行为：

- strict 模式下危险命令会被阻断。
- relaxed 模式下危险命令会输出警告并继续。
- dry-run 只输出将执行的命令和安全检测结果。
- 执行结果会保存为 source=`direct` 的执行记录。

## 安全要求

- 修改规则属于安全敏感操作，必须有审计记录。
- `security reset` 必须使用 `--force`。
- JSON 输出只能输出结构化风险结果，不混入人类说明。
- 工具 registry 中标记 dangerous 的命令不能绕过安全协议。

## 相关文档

- [安全与权限闭环规格](./security-permission-loop.md)
- [CLI 命令面规格](./cli-command-surface.md)
