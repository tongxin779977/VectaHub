# VectaHub CLI 命令清单

> 版本: 6.0.0 | 最后更新: 2026-05-02

---

## 运行命令（日常使用）

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub run <intent>` | 自然语言执行工作流 | `[intent...]` 自然语言描述 | `vectahub run "查看 git 状态"` |
| `vectahub run -f <file>` | 从 YAML 文件执行 | `-f, --file <file>` 工作流文件路径 | `vectahub run -f workflow.yaml` |
| `vectahub run -m <mode>` | 指定执行模式 | `-m, --mode <strict\|relaxed\|consensus>` | `vectahub run -m strict "rm old.log"` |
| `vectahub run -s` | 执行后保存工作流 | `-s, --save` | `vectahub run -s "压缩图片"` |
| `vectahub run -y` | 跳过确认 | `-y, --yes` | `vectahub run -y "删除缓存"` |
| `vectahub run --no-edit` | 跳过命令编辑 | `--no-edit` | `vectahub run --no-edit "ls"` |
| `vectahub generate <desc>` | LLM 生成 YAML 工作流 | `<desc>` 自然语言描述 | `vectahub generate "每天备份数据库"` |
| `vectahub list` | 列出保存的工作流 | 无 | `vectahub list` |
| `vectahub history` | 查看执行历史 | 无 | `vectahub history` |
| `vectahub mode` | 查看/切换执行模式 | 无 | `vectahub mode` |

## 工具管理

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub tools list` | 列出所有工具 | 无 | `vectahub tools list` |
| `vectahub tools search <kw>` | 搜索工具 | `<keyword>` 关键词 | `vectahub tools search git` |
| `vectahub tools categories` | 查看工具分类 | 无 | `vectahub tools categories` |
| `vectahub tools info <name>` | 查看工具详情 | `<name>` 工具名 | `vectahub tools info git` |

## 配置

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub setup` | 首次配置向导 | 无 | `vectahub setup` |
| `vectahub config show` | 显示当前配置 | 无 | `vectahub config show` |
| `vectahub config reset` | 重置配置 | 无 | `vectahub config reset` |
| `vectahub config tools` | 列出外部 CLI 工具 | 无 | `vectahub config tools` |

## 安全

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub security` | 安全管理 | 无 | `vectahub security` |
| `vectahub audit` | 查看审计日志 | 无 | `vectahub audit` |

## 系统

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub doctor` | 系统诊断 | 无 | `vectahub doctor` |
| `vectahub serve` | 启动 Socket 服务 | 无 | `vectahub serve` |
| `vectahub client <cmd>` | Socket 客户端 | `submit/status/list/mode/config/shutdown` | `vectahub client submit "ls"` |

## 开发命令

| 命令 | 说明 | 参数 | 示例 |
|------|------|------|------|
| `vectahub dev check` | 开发检查 | 无 | `vectahub dev check` |
| `vectahub dev status` | 开发状态 | 无 | `vectahub dev status` |
| `vectahub dev module` | 模块信息 | 无 | `vectahub dev module` |
| `vectahub dev validate` | 开发验证 | 无 | `vectahub dev validate` |
| `vectahub dev test` | 开发测试 | 无 | `vectahub dev test` |
| `vectahub dev build` | 开发构建 | 无 | `vectahub dev build` |
