# VectaHub 已实现功能清单

> 版本: 1.0.0 | 最后更新: 2026-05-02

本文档记录项目当前实际已实现的功能，作为产品开发的基线。

---

## 一、NL 解析器（关键词匹配）

| 功能 | 代码位置 | 状态 |
|------|----------|------|
| 意图匹配（13 种意图） | `src/nl/intent-matcher.ts` | ✅ |
| 参数提取 | `src/nl/parser.ts` | ✅ |
| 命令合成（GIT_WORKFLOW/SHELL_EXEC/FILE_FIND） | `src/nl/command-synthesizer.ts` | ✅ |
| LLM 客户端（OpenAI/Anthropic/Ollama） | `src/nl/llm.ts` | ✅ 已实现，未接入核心路径 |

**意图覆盖**：

| 意图 | 关键词 | 覆盖度 |
|------|--------|--------|
| FILE_FIND | 查找, 搜索, 找, find, file | 50% |
| GIT_WORKFLOW | 提交, commit, 推送, push, git | 60% |
| SHELL_EXEC | shell, 命令, exec | 40% |
| BACKUP | 备份, 复制, backup | 20% |
| CODE_REVIEW | 审查, review, 分析 | 20% |
| CI_PIPELINE | 测试, 部署, build, deploy | 30% |
| DATA_EXPORT | 导出, 转换 | 10% |
| FILE_DIFF | 比较, 差异, diff | 10% |
| FILE_PERMISSION | 权限, 授权, 拒绝 | 10% |
| FILE_SEARCH | 查找文件, 搜索文件 | 10% |
| NETWORK_INFO | 网络, 状态, ifconfig | 10% |
| SYSTEM_MONITOR | 系统, 监控, top | 10% |
| FILE_ARCHIVE | 压缩, 解压, zip | 10% |

## 二、工作流引擎

| 功能 | 代码位置 | 状态 |
|------|----------|------|
| 工作流创建 | `src/workflow/engine.ts` | ✅ |
| 步骤类型: exec | `src/workflow/engine.ts` + `executor.ts` | ✅ |
| 步骤类型: if | `src/workflow/executor.ts` | ✅ |
| 步骤类型: for_each | `src/workflow/executor.ts` | ✅ |
| 步骤类型: parallel | `src/workflow/executor.ts` | ✅ |
| 拓扑排序 | `src/workflow/engine.ts` | ✅ |
| 暂停/恢复 | `src/workflow/engine.ts` | ✅ |
| 中止执行 | `src/workflow/engine.ts` | ✅ |
| 执行状态机 | `src/workflow/engine.ts` | ✅ |
| 上下文传递 | `src/workflow/context-manager.ts` | ⚠️ 代码存在，引擎未使用 |

## 三、安全执行层

| 功能 | 代码位置 | 状态 |
|------|----------|------|
| 危险命令检测 | `src/sandbox/detector.ts` | ✅ |
| macOS 沙盒（sandbox-exec） | `src/sandbox/macos.ts` | ✅ |
| Linux 沙盒（bubblewrap） | `src/sandbox/linux.ts` | ✅ |
| 安全协议引擎（17 条规则） | `src/security-protocol/` | ✅ |
| 命令黑白名单 | `src/command-rules/` | ✅ |
| 执行模式（strict/relaxed/consensus） | `src/workflow/executor.ts` | ✅ |
| 审计日志 | `src/infrastructure/audit/` | ✅ |

## 四、工具集成

| 工具 | 子命令数 | 代码位置 |
|------|----------|----------|
| git | 17+ | `src/cli-tools/tools/git.ts` |
| npm | 10+ | `src/cli-tools/tools/npm.ts` |
| docker | 12 | `src/cli-tools/tools/docker.ts` |
| curl | 6 | `src/cli-tools/tools/curl.ts` |

## 五、CLI 命令

| 命令 | 实现位置 | 状态 |
|------|----------|------|
| `vectahub run <intent>` | `src/utils/run.ts` | ✅ 关键词匹配 |
| `vectahub run -f <file>` | `src/utils/run.ts` | ✅ |
| `vectahub generate <desc>` | `src/utils/generate.ts` | ✅ LLM 生成 YAML |
| `vectahub list` | `src/utils/list.ts` | ✅ |
| `vectahub history` | `src/utils/history.ts` | ✅ |
| `vectahub mode` | `src/utils/mode.ts` | ✅ |
| `vectahub tools list/search/categories/info` | `src/utils/tools.ts` | ✅ |
| `vectahub doctor` | `src/utils/doctor.ts` | ✅ |
| `vectahub setup` | `src/utils/setup.ts` | ✅ |
| `vectahub security` | `src/utils/security.ts` | ✅ |
| `vectahub audit` | `src/utils/audit.ts` | ✅ |
| `vectahub serve` | `src/utils/serve.ts` | ✅ |
| `vectahub client` | `src/utils/client.ts` | ✅ |
| `vectahub config` | `src/utils/config.ts` | ✅ |
| `vectahub dev (check/status/module/validate/test/build)` | `src/utils/dev-utils.ts` | ✅ |

## 六、基础设施

| 功能 | 代码位置 | 状态 |
|------|----------|------|
| 配置管理 | `src/infrastructure/config/` | ✅ |
| 错误处理 | `src/infrastructure/errors/` | ✅ |
| 日志 | `src/infrastructure/logger/` | ✅ |
| 审计系统 | `src/infrastructure/audit/` | ✅ |
| 首次运行向导 | `src/setup/` | ✅ |
| CLI 扫描 | `src/setup/cli-scanner.ts` | ✅ |

## 七、技能模块

| 技能 | 代码位置 | 状态 |
|------|----------|------|
| 5-Whys 分析 | `src/skills/iterative-refinement/5whys-analyzer.ts` | ✅ |
| 重试管理器 | `src/skills/iterative-refinement/retry-manager.ts` | ✅ |
| LLM 对话控制 | `src/skills/llm-dialog-control/` | ✅ |

## 八、未使用/占位实现

| 功能 | 问题 | 处理建议 |
|------|------|----------|
| IMAGE_COMPRESS/BATCH_RENAME/DELETE_FILE | 生成 echo 假命令 | 标记占位，等待 LLM 动态生成 |
| ContextManager | 280 行代码但引擎不使用 | 后续集成到引擎 |
| 命令签名验证 | 实现了但从未调用 | 标记实验性 |
| Gemini 提供商 | setup 支持配置但 llm.ts 不处理 | 待实现 |
