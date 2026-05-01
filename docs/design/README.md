# VectaHub 设计文档索引

> 本文档是所有设计文档的索引和总览

---

## 📚 文档列表

| 编号 | 文档 | 描述 | 状态 |
|------|------|------|------|
| 01 | [01_system_architecture.md](01_system_architecture.md) | 系统架构总览 | ✅ 重写 |
| 02 | [02_sandbox_design.md](02_sandbox_design.md) | 沙盒架构设计 | ✅ 保留 |
| 03 | [03_ai_cli_framework_design.md](03_ai_cli_framework_design.md) | AI Agent CLI 适配器框架 | ✅ 保留 |
| 04 | [04_nl_parser_skill_design.md](04_nl_parser_skill_design.md) | 自然语言解析 Skill 设计 | ✅ 保留 |
| 05 | [05_vscode_plugin_design.md](05_vscode_plugin_design.md) | VSCode 插件设计 | ✅ 保留 |
| 06 | [06_workflow_engine_design.md](06_workflow_engine_design.md) | 自然语言工作流引擎 | ✅ 重写 |
| 10 | [AI_CLI_环境发现与智能降级设计文档.md](../../.trae/documents/AI_CLI_环境发现与智能降级设计文档.md) | AI CLI 环境发现与智能降级 | ✅ 已实现 |

---

## 🎯 需求对照表

| 用户需求 | 对应设计章节 |
|----------|--------------|
| 自然语言生成工作流 | [06_workflow_engine_design.md](06_workflow_engine_design.md) |
| 可追溯可审查的 CLI 操作 | [06_workflow_engine_design.md - 执行记录](06_workflow_engine_design.md#53-执行记录) |
| 对标 OpenCLI (互补) | [01_system_architecture.md - 定位](01_system_architecture.md#11-与-opencli-的关系) |
| 不需要 sudo | [02_sandbox_design.md](02_sandbox_design.md) |
| 沙盒三种模式 | [02_sandbox_design.md](02_sandbox_design.md) |
| 支持 AI Agent CLI | [03_ai_cli_framework_design.md](03_ai_cli_framework_design.md) |
| NL 解析变任务列表 | [06_workflow_engine_design.md - NL Parser](06_workflow_engine_design.md#4-nl-parser-实现) |
| 生成 VSCode 插件 | [05_vscode_plugin_design.md](05_vscode_plugin_design.md) |
| 保留 CACP 2.0 | [03_ai_cli_framework_design.md](03_ai_cli_framework_design.md) |

---

## 🔄 实现优先级

### Phase 1: 最小可行产品 (MVP)

| 功能 | 描述 | 状态 |
|------|------|------|
| NL Parser | 规则匹配意图解析 | 待实现 |
| Workflow Engine | 顺序执行 | 待实现 |
| Basic Executor | 无沙盒执行 | 待实现 |
| CLI: `vectahub run <intent>` | 命令行入口 | 待实现 |

### Phase 2: 核心功能

| 功能 | 描述 | 状态 |
|------|------|------|
| For_each / If 步骤类型 | 循环和条件 | 待实现 |
| macOS Sandbox | 沙盒执行 | 待实现 |
| 危险命令检测 | 正则匹配 | 待实现 |
| 执行记录 | JSON 日志 | 待实现 |

### Phase 3: 完善生态

| 功能 | 描述 | 状态 |
|------|------|------|
| 意图模板市场 | 用户贡献模板 | 待实现 |
| Workflow 保存/加载 | YAML 持久化 | 待实现 |
| 定时任务 | cron 集成 | 待实现 |
| Linux/Windows 支持 | 跨平台 | 待实现 |

### Phase 4: AI 环境发现 (已完成)

| 功能 | 描述 | 状态 |
|------|------|------|
| 环境扫描 | 启动时检测 AI CLI 工具 | ✅ 已实现 |
| 智能降级 | 自动选择最佳替代方案 | ✅ 已实现 |
| CLI 命令 | `vectahub ai status/rescan/list` | ✅ 已实现 |
| 工作流集成 | delegate 步骤类型 | ✅ 已实现 |

---

## 📁 VectaHub CLI 命令

```bash
# 工作流
vectahub run <intent>           # 自然语言运行
vectahub run -f <workflow.yaml>  # 文件运行
vectahub save <name>             # 保存工作流
vectahub list                    # 列出工作流
vectahub edit <id>              # 编辑工作流
vectahub delete <id>            # 删除工作流

# 执行控制
vectahub pause                   # 暂停
vectahub resume                  # 继续
vectahub abort                   # 终止
vectahub status                  # 查看状态
vectahub history                 # 查看历史

# 沙盒控制
vectahub mode                    # 查看当前模式
vectahub mode strict/relaxed/consensus

# 状态
vectahub doctor                  # 诊断
vectahub version                 # 版本
```

---

## 🆚 OpenCLI 互补定位

```
┌─────────────────────────────────────────────────────────┐
│                    用户需求                               │
└─────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
    ┌──────────────────┐      ┌──────────────────┐
    │     OpenCLI      │  +   │    VectaHub      │
    │   浏览器自动化    │      │   本地工作流     │
    │  (网站操作)      │      │  (文件/脚本)     │
    └──────────────────┘      └──────────────────┘
```

**OpenCLI**: 刷网站、爬数据、操作已登录的 Chrome
**VectaHub**: 压缩图片、批量重命名、CI/CD 流程、备份同步

---

## 📂 源码结构

```
src/
├── index.ts                    # 入口
├── cli.ts                      # CLI 命令
├── nl/
│   ├── parser.ts               # NL 解析器
│   ├── intent-matcher.ts       # 意图匹配
│   └── templates/              # 意图模板
├── workflow/
│   ├── engine.ts               # 工作流引擎
│   ├── executor.ts             # 执行器
│   ├── storage.ts              # 存储
│   └── types.ts                # 类型定义
├── sandbox/
│   ├── detector.ts             # 危险命令检测
│   ├── macos.ts               # macOS 沙盒
│   └── linux.ts               # Linux 沙盒
└── utils/
    ├── logger.ts
    └── config.ts
```

---

## 📚 参考项目

| 项目 | 描述 |
|------|------|
| [OpenCLI](https://github.com/jackwener/OpenCLI) | 浏览器自动化 + AI Agent |
| [Taskfile](https://taskfile.dev/) | 任务运行器 |
| [Just](https://github.com/casey/just) | 命令运行器 |
| [Airplane](https://www.airplane.dev/) | 工作流平台 |

---

```yaml
version: 3.0.0
lastUpdated: 2026-05-02
totalDocuments: 7
status: design_complete_all_features_implemented
```
