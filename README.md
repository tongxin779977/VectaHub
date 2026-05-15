# VectaHub

> Natural Language Workflow Engine — 将任务描述转换为本地执行指令。

[![Version](https://img.shields.io/badge/version-1.1.1-blue)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D21.0.0-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-1185%20passing%20%7C%2014%20skipped-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()

[English](./README.md) · [中文](./docs/README.md)

---

## 简介

VectaHub 是一个命令行工具，旨在将自然语言描述转换为可执行的本地自动化流程。

-   **自然语言转换**: 基于 LLM Tool Calling 的意图识别，生成结构化任务列表。
-   **多种任务类型**: 涵盖文件查找、Git 操作、包管理、文件读写等。
-   **交互模式 (Chat)**: 提供支持分层记忆（L1/L2/L3）的对话界面。
-   **工作流编排**: 支持在 YAML 中定义条件、循环与并行步骤。
-   **安全机制**: 提供 Strict/Relaxed/Consensus 三种执行模式，内置危险命令检测。
-   **强类型防腐层**: Schema 驱动的类型安全映射，防映射漂移测试保护。

---

## 安装

### 环境要求

- Node.js >= 21.0.0
- macOS 或 Linux

### 安装

```bash
npm install -g vectahub
```

### 快速开始

```bash
# 自动生成并执行
vectahub run "查看 Git 状态"

# 仅预览不执行
vectahub run --dry-run "删除 node_modules"

# 直接执行明确指令（含安全扫描）
vectahub run-command -- npm test
```

---

## 核心功能

### 1. 任务执行

```bash
vectahub run "找出当前目录下所有的 .ts 文件"
vectahub run "安装 react 和 lodash"
```

### 2. 对话界面

```bash
vectahub chat
# 进入交互式界面
> /help
```

### 3. 声明式定义 (YAML)

```yaml
name: check-project
steps:
  - id: status
    type: exec
    cli: git
    args: ["status"]
  - id: test
    type: exec
    cli: npm
    args: ["test"]
```

```bash
vectahub run -f check-project.yaml
```

### 4. 安全防护

-   **分词级扫描**: 能够识别并拦截 `&&` 或 `|` 连接的复合命令中的危险操作。
-   **环境隔离**: 默认隔离用户主目录，支持 `VECTAHUB_HOME` 自定义数据路径。

### 5. 文档任务预览

`run-task` 面向文档驱动的 Agent 任务，当前有两种预览相关模式：

```bash
# 只生成本地 dry-run 预览命令，不实际执行 Agent
vectahub run-task --tool aider --task-id T1 --task-label "补测试" --doc ./docs/task.md --dry-run --json

# 只生成任务边界合同摘要，不要求 --tool
vectahub run-task --task-id T1 --task-label "补测试" --doc ./docs/task.md --contract-preview --json
```

- `--dry-run` 会先构建 `agentTaskContract` 摘要，再返回一条本地预览命令；该分支不加载 LLM、不做 tool help discovery、不执行 Agent。
- `--contract-preview` 只返回合同摘要，用于查看任务边界、允许文件、禁止文件和建议验证命令；该分支不要求 `--tool`，也不进入命令生成流程。
- 两个分支在 `--json` 下都会返回 `ok`、`command`、`output`、`outputTruncated` 和 `agentTaskContract`；其中 `--contract-preview` 的 `command` 和 `output` 为空字符串。
- 正常执行路径会额外标记命令生成来源：已知 Agent adapter 返回 `commandGenerationPath: "adapter"`，未知或自定义 CLI fallback 返回 `commandGenerationPath: "llm-fallback"`；`fallbackUsed` 标记是否实际使用了 fallback 命令。
- 审计日志写入失败会以告警方式降级处理，不中断主流程；如果日志目录无写权限，可能看到 `Failed to write audit log`。

---

## 架构工作原理

VectaHub Phase 6 采用基于 LLM Tool Calling 和强类型防腐层的新架构，确保安全和准确性：

```
用户输入
    │
    ▼
┌─────────────────────────────────────┐
│  大模型意图提取 (LLM Intent Extraction) │
│  - 调用 LLM 进行意图识别              │
│  - 提取参数并生成结构化输出           │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Semantic Guardrails (语义护栏)      │
│  - 验证意图合法性                     │
│  - 检测危险命令和敏感操作             │
│  - 应用安全策略                       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  确定性 Workflow Mapping            │
│  - Schema 驱动的类型安全映射          │
│  - 防映射漂移测试保护                 │
│  - 生成可预测的工作流定义             │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  执行器 (Executor)                   │
│  - 步骤编排与执行                    │
│  - 沙箱隔离环境                      │
│  - 审计日志记录                      │
└─────────────────────────────────────┘
```

### 分层记忆系统

| 层级 | 名称 | 存储时长 | 用途 |
|------|------|----------|------|
| **L1** | 会话记忆 | 当前会话 | 对话上下文保持 |
| **L2** | 工作流记忆 | 执行期间 | 步骤间状态传递 |
| **L3** | 长期记忆 | 持久化 | 历史执行记录、知识沉淀 |

### LLMObservability

系统内置完整的 LLM 可观测性能力：
- **意图追踪**: 记录每次 LLM 调用的输入输出
- **性能监控**: 追踪响应时间和调用频率
- **成本估算**: 基于 token 消耗计算 API 成本
- **质量评估**: 意图匹配准确率统计

---

## 项目结构

```
vectahub/
├── src/
│   ├── cli.ts                  # 程序入口
│   ├── nl/                     # 自然语言识别逻辑
│   ├── workflow/               # 任务编排与执行引擎
│   ├── chat/                   # 交互式对话实现
│   ├── sandbox/                # 命令检测与隔离环境
│   ├── commands/               # CLI 子命令实现
│   └── utils/                  # 工具类与分词器
├── docs/                       # 文档目录
└── package.json
```

---

## 开发

```bash
# 构建项目
npm run build

# 运行测试
npm test
```

### 测试状态
目前已通过 **1185** 个单元测试用例。跳过的项主要为特定操作系统环境相关的集成测试。

---

## 技术栈

TypeScript · Node.js · Commander.js · Vitest

---

## 许可证

MIT
