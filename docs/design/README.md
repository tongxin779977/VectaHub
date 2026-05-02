# VectaHub 设计文档索引

> 本文档是所有设计文档的索引和总览
> 基于方案C：极简产品业务方案 - 工作流编辑器 + 工作流执行引擎

---

## 📚 文档列表

| 编号 | 文档 | 描述 | 状态 |
|------|------|------|------|
| 01 | [01_system_architecture.md](01_system_architecture.md) | 系统架构总览 | ✅ 保留 |
| 02 | [02_sandbox_design.md](02_sandbox_design.md) | 沙盒架构设计 | ✅ 保留 |
| 06 | [06_workflow_engine_design.md](06_workflow_engine_design.md) | 工作流引擎核心设计 | ✅ 核心 |

---

## 🎯 产品定位（方案C）

**一句话**：VectaHub 是一个「工作流编辑器 + 工作流执行引擎」

- **输入**：自然语言（5-10个高频场景）→ 生成工作流；或直接编辑 YAML/JSON
- **核心**：工作流编排（步骤、条件、循环、并行）
- **执行**：委托给 OpenCLI 或本地命令
- **保障**：审计日志 + 危险命令检查

---

## 🗑️ 已删除的内容

| 内容 | 原因 |
|------|------|
| AI CLI 环境发现与智能降级 | 大部分用户只用一个 AI CLI，甚至不用 |
| 复杂的 NL Parser | 维护成本高，用简单规则 + YAML 编辑 |
| 复杂实体提取 | 同上，工作流里直接写就行 |
| 对话历史管理 | 工作流步骤间传递才需要 |

---

## 🚀 核心功能

### 1. YAML 工作流格式

```yaml
name: HackerNews 热榜保存
description: 看热榜，提取链接，保存到文件

steps:
  - id: step1
    type: opencli
    site: hackernews
    command: top
    args: ["--limit", "10"]
    output: hn_data

  - id: step2
    type: shell
    command: node
    args: ["-e", "console.log(JSON.parse(process.stdin.read()).map(i => i.url).join('\\n'))"]
    input: "{{ step1.output }}"
    output: urls

  - id: step3
    type: shell
    command: tee
    args: ["hn-top-urls.txt"]
    input: "{{ step2.output }}"

mode: relaxed
```

### 2. CLI 命令

```bash
# 工作流
vectahub run <intent>            # 简单自然语言（5-10个高频场景）
vectahub run -f <workflow.yaml>  # 从文件运行
vectahub save <name>             # 保存工作流
vectahub list                    # 列出保存的工作流
vectahub history                 # 查看执行历史

# OpenCLI 辅助
vectahub opencli list            # 列出 OpenCLI 可用的网站
vectahub opencli help <site>     # 查看某个网站的帮助

# 执行模式
vectahub mode                    # 查看当前模式
vectahub mode strict/relaxed/consensus

# 其他
vectahub doctor                  # 诊断
vectahub version                 # 版本
```

---

## 📂 源码结构（精简后）

```
src/
├── index.ts                    # 入口
├── cli.ts                      # CLI 命令
├── nl/
│   ├── parser.ts               # 简化的 NL 解析器（高频场景）
│   ├── intent-matcher.ts       # 简单意图匹配
│   ├── llm.ts                  # LLM 兜底（可选）
│   └── templates/              # 意图模板（5-10个）
├── workflow/
│   ├── engine.ts               # 工作流引擎
│   ├── executor.ts             # 执行器
│   ├── context-manager.ts      # 工作流上下文（步骤间传递）
│   ├── storage.ts              # 存储
│   └── session-manager.ts      # 会话管理
├── sandbox/
│   ├── detector.ts             # 危险命令检测
│   └── sandbox.ts              # macOS 沙盒
├── security-protocol/
│   └── manager.ts              # 安全协议
├── command-rules/
│   └── engine.ts               # 命令规则
├── cli-tools/
│   ├── registry.ts             # CLI 工具注册
│   └── discovery/              # 简化的发现（只保留 known-tools）
└── utils/
    ├── audit.ts                # 审计日志
    ├── config.ts               # 配置
    ├── logger.ts               # 日志
    └── history.ts              # 历史
```

---

## 📚 参考项目

| 项目 | 描述 |
|------|------|
| [OpenCLI](https://github.com/jackwener/OpenCLI) | 浏览器自动化 + AI Agent（互补！）|
| [Taskfile](https://taskfile.dev/) | 任务运行器 |
| [Just](https://github.com/casey/just) | 命令运行器 |

---

```yaml
version: 4.0.0
lastUpdated: 2026-05-02
totalDocuments: 3
mindset: 极简、真实、可预测、不杜撰
status: plan_c_refactoring
```
