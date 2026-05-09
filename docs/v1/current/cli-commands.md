# VectaHub 1.0 CLI 命令参考

> 适用版本: 1.1.1
> 最后更新: 2026-05-09

本文档列出了 VectaHub CLI 目前支持的主要命令及其用法。

## 全局选项

| 选项 | 说明 |
|------|------|
| `-v, --verbose` | 输出详细运行日志 |
| `-d, --debug` | 开启调试模式 |
| `--non-interactive` | 禁用交互式询问 |
| `--help` | 显示命令帮助信息 |
| `--version` | 显示当前版本号 |

## 任务执行

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub run [intent]` | 解析自然语言并运行工作流 | `vectahub run "检查 Git 状态"` |
| `vectahub run-command -- [cmd]` | 直接执行命令并进行安全扫描 | `vectahub run-command -- npm test` |
| `vectahub run -f <file>` | 运行指定的 YAML/JSON 工作流文件 | `vectahub run -f my_task.yaml` |
| `vectahub run --dry-run` | 预览执行计划而不实际运行命令 | `vectahub run --dry-run "删除缓存"` |
| `vectahub run --json` | 以 JSON 格式输出执行结果 | `vectahub run --json "git status"` |

## 环境与配置

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub doctor` | 检查本地环境依赖项 | `vectahub doctor` |
| `vectahub setup` | 初始化配置向导 | `vectahub setup` |
| `vectahub config show` | 查看当前配置信息 | `vectahub config show` |
| `vectahub mode [mode]` | 切换执行模式 (strict/relaxed/consensus) | `vectahub mode strict` |

## 历史记录管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub history` | 查看最近的执行记录列表 | `vectahub history` |
| `vectahub detail <id>` | 查看特定执行记录的详细步骤 | `vectahub detail exec_2026...` |
| `vectahub rerun <id>` | 重新执行历史记录中的任务 | `vectahub rerun exec_xxx` |

## 模板与生成

| 命令 | 说明 | 示例 |
|------|------|------|
| `vectahub generate <desc>` | 使用配置的 LLM 生成工作流 YAML | `vectahub generate "构建 Docker 镜像"` |
| `vectahub templates list` | 列出本地可用的任务模板 | `vectahub templates list` |

---
**提示**: 使用 `vectahub <command> --help` 获取各子命令的完整参数说明。
