# VectaHub: Workflow Editor & Engine + OpenCLI 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-21+-339933?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)

> **VectaHub** 是一个工作流编辑器 + 工作流执行引擎。用自然语言（5-10个高频场景）或 YAML 编辑工作流，它会自动编排、执行、并记录整个流程。
>
> **与 OpenCLI 互补**：VectaHub 做工作流编排，OpenCLI 做网站操作。

[English Version](./README_EN.md) | **中文说明**

---

## 核心价值：一句话说清 VectaHub

| 工具 | 你要做什么 | 实际工作 |
|------|-----------|----------|
| Taskfile | 写 YAML: `tasks: { compress: ... }` | 说"压缩图片" |
| Shell Script | 写 bash: `for f in *.jpg; do...` | 说"压缩图片" |
| **VectaHub** | **YAML 编辑 + 工作流编排** | **写 YAML 或说高频场景** |

---

## 🎯 核心使用场景

### 场景 1：高频场景（简单自然语言）

```bash
$ vectahub run "看 HackerNews 热榜"

🤖 匹配高频场景: HACKERNEWS_TOP
📋 生成工作流:
  Step 1: opencli hackernews top --limit 10
⏳ 模式: RELAXED
▶️ 执行中...
✅ 完成
```

### 场景 2：YAML 工作流（推荐！）

创建 `workflow.yaml`:

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

然后运行：

```bash
$ vectahub run -f workflow.yaml

📋 加载工作流: HackerNews 热榜保存
▶️ 执行中...
  Step 1: opencli hackernews top ... ✅
  Step 2: node ... ✅
  Step 3: tee hn-top-urls.txt ... ✅
✅ 完成
```

### 场景 3：本地工作流

```yaml
name: 提交并推送
steps:
  - id: step1
    type: shell
    command: git
    args: ["add", "-A"]
  - id: step2
    type: shell
    command: git
    args: ["commit", "-m", "update"]
  - id: step3
    type: shell
    command: git
    args: ["push"]
mode: strict
```

---

## 🏗️ 系统架构（方案C）

```
┌─────────────────────────────────────────────────────────────┐
│                        VectaHub                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐
│  │  用户交互层                                              │
│  │  - 简单自然语言（5-10个高频场景）                        │
│  │  - YAML/JSON 工作流编辑                                 │
│  └─────────────────────────────────────────────────────────┘
│                            │
│                            ▼
│  ┌─────────────────────────────────────────────────────────┐
│  │  工作流引擎层（核心）                                   │
│  │  - 步骤调度（顺序/条件/循环/并行）                      │
│  │  - 上下文传递（步骤间数据流转）                         │
│  │  - 审计日志（全程记录）                                 │
│  └─────────────────────────────────────────────────────────┘
│                            │
│                            ▼
│  ┌─────────────────────────────────────────────────────────┐
│  │  执行委托层                                              │
│  │  - OpenCLI（90+网站）                                   │
│  │  - 本地命令（Shell/Git）                                │
│  └─────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 |
|------|------|
| **Workflow Engine** | 工作流引擎核心：调度、上下文、审计 |
| **Executor** | 执行器：OpenCLI + 本地命令 |
| **Sandbox** | macOS 沙盒隔离，安全保障 |
| **简单 Intent Matcher** | 只匹配 5-10 个高频场景 |

---

## 🛡️ 安全机制

### 三种执行模式

| 模式 | 非危险命令 | 危险命令 | 适用场景 |
|------|-----------|----------|----------|
| **STRICT** | 自动执行 | 报错 | CI/CD |
| **RELAXED** | 自动执行 | 确认后执行 | 开发调试 |
| **CONSENSUS** | 确认后执行 | 确认后执行 | 交互执行 |

### 危险命令检测

```typescript
const DANGEROUS_PATTERNS = {
  critical: [
    /^sudo\s+/,                          // 提权
    /^chmod\s+777/,                      // 全局权限
    /^rm\s+-rf\s+\/(?!sandbox)/,         // 递归删除根目录
  ]
};
```

---

## 🚀 快速开始

### 1. 安装

```bash
npm install -g vectahub
```

### 2. 运行简单自然语言（高频场景）

```bash
vectahub run "看 HackerNews 热榜"
vectahub run "压缩当前目录图片"
```

### 3. 从文件运行工作流（推荐）

```bash
# 创建 workflow.yaml
vectahub run -f workflow.yaml
```

### 4. OpenCLI 辅助命令

```bash
vectahub opencli list            # 列出 OpenCLI 可用的网站
vectahub opencli help <site>     # 查看某个网站的帮助
```

---

## 📦 高频场景列表（5-10个）

| 场景 | 自然语言 |
|------|---------|
| HACKERNEWS_TOP | "看 HackerNews 热榜" |
| BILIBILI_HOT | "看 B站热榜" |
| IMAGE_COMPRESS | "压缩当前目录图片" |
| GIT_COMMIT_PUSH | "提交并推送" |
| RUN_TESTS | "跑测试" |

---

## 📂 项目结构（精简后）

```
VectaHub/
├── docs/design/              # 设计文档（3个核心文档）
├── .trae/documents/          # 方案文档
├── src/
│   ├── cli.ts               # CLI 入口
│   ├── nl/                  # 简化的 NL（高频场景）
│   │   ├── parser.ts
│   │   ├── intent-matcher.ts
│   │   └── templates/
│   ├── workflow/            # 工作流引擎（核心）
│   │   ├── engine.ts
│   │   ├── executor.ts
│   │   ├── context-manager.ts
│   │   ├── storage.ts
│   │   └── session-manager.ts
│   ├── sandbox/            # 沙盒隔离
│   │   ├── detector.ts
│   │   └── sandbox.ts
│   ├── cli-tools/          # CLI 工具集成
│   │   ├── registry.ts
│   │   └── discovery/      # 简化（只保留 known-tools）
│   └── utils/              # 工具函数
│       ├── audit.ts
│       ├── history.ts
│       └── config.ts
└── workflows/               # 用户工作流
```

---

## 🗑️ 已删除的内容

| 内容 | 原因 |
|------|------|
| AI CLI 环境发现与智能降级 | 大部分用户只用一个 AI CLI，甚至不用 |
| 复杂的 NL Parser | 维护成本高，用简单规则 + YAML 编辑 |
| 复杂实体提取 | 同上，工作流里直接写就行 |
| 对话历史管理 | 工作流步骤间传递才需要 |

---

## 🛠️ 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 21+
- **构建**: tsup
- **CLI**: Commander.js
- **配置**: YAML

---

## 📄 开源协议

基于 [MIT License](./LICENSE) 开源。

---

```yaml
version: 4.0.0
lastUpdated: 2026-05-02
mindset: 极简、真实、可预测、不杜撰
status: plan_c_refactoring
```
