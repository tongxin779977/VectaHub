# VectaHub

> Natural Language Workflow Engine — 将任务描述转换为本地执行指令。

[![Version](https://img.shields.io/badge/version-1.1.0-blue)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D21.0.0-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-1185%20passing%20%7C%2014%20skipped-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()

[English](./README.md) · [中文](./docs/README.md)

---

## 简介

VectaHub 是一个命令行工具，旨在将自然语言描述转换为可执行的本地自动化流程。

-   **自然语言转换**: 识别用户意图并生成对应的任务列表。
-   **多种任务类型**: 涵盖文件查找、Git 操作、包管理、文件读写等。
-   **交互模式 (Chat)**: 提供支持上下文记忆的对话界面。
-   **混合解析模式**: 支持 LLM 解析，并可在无网络环境下降级为本地规则匹配。
-   **工作流编排**: 支持在 YAML 中定义条件、循环与并行步骤。
-   **安全机制**: 提供 Strict/Relaxed/Consensus 三种执行模式，内置危险命令检测。

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
