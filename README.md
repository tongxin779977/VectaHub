# VectaHub

> Natural Language Workflow Engine — 用自然语言描述任务，自动执行本地工作流。

[![Version](https://img.shields.io/badge/version-1.0.0-blue)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D21.0.0-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-1178%20passing%20%7C%2018%20skipped-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()

[English](./README.md) · [中文](./docs/README.md)

---

## 简介

VectaHub 是一个 CLI 工具，将自然语言指令转换为可执行的本地自动化工作流。核心特性：

- **NL → Workflow**：用中文或英文描述意图，自动识别并生成工作流
- **16 种意图类型**：文件查找、Git 操作、脚本执行、系统信息、包安装、文件创建等
- **Chat REPL**：交互式对话界面，支持上下文记忆和多轮对话
- **LLM 优先 + 关键词降级**：配置 LLM 获得更强理解力，未配置时自动降级为关键词匹配
- **YAML 工作流**：声明式工作流定义，支持条件、循环、并行
- **AI 模块系统**：20 个可插拔模块 + 3 个 CLI 插件，按需激活
- **安全沙箱**：三级执行模式（relaxed / strict / consensus），危险命令自动检测

---

## 安装

### 环境要求

- Node.js >= 21.0.0
- macOS 或 Linux

### 安装

```bash
npm install -g vectahub
# 或在项目中本地安装
npm install --save-dev vectahub
```

### 首次运行

```bash
# 自然语言执行
vectahub run "查看当前目录"

# 交互式 Chat
vectahub chat

# 预览模式（不实际执行）
vectahub run --dry-run "提交代码"
```

不配置 LLM 也能使用——VectaHub 会自动降级为关键词匹配模式。

---

## 核心功能

### 1. 自然语言执行

```bash
vectahub run "找出所有 ts 文件"
vectahub run "帮我提交代码，提交信息是修复登录 bug"
vectahub run "安装 react 和 react-dom"
```

### 2. Chat REPL

```bash
vectahub chat
# 进入交互式对话
> 查看 git 状态
> 帮我提交这些改动
> /help    # 查看所有命令
> /quit    # 退出
```

### 3. YAML 工作流

```yaml
name: daily-check
steps:
  - id: check-status
    type: exec
    cli: git
    args: ["status"]
  - id: run-tests
    type: exec
    cli: npm
    args: ["test"]
mode: relaxed
```

```bash
vectahub run -f daily-check.yaml
```

### 4. AI 模块系统

内置模块按需激活（零影响设计）：

| 模块 | 说明 |
|------|------|
| `semantic-matching` | 语义意图匹配增强 |
| `agent-delegate` | 代理委托执行 |
| `intelligent-diagnosis` | 智能诊断分析 |
| `cli.feishu` | 飞书适配器 |
| `cli.opencli` | OpenCLI 90+ 网站工具 |
| `cli.gemini` | Gemini CLI 适配器 |

### 5. 安全机制

```bash
# 查看当前执行模式
vectahub mode

# 切换为严格模式
vectahub mode strict

# 测试命令安全性
vectahub security test "rm -rf /"
```

---

## 命令一览

| 命令 | 说明 |
|------|------|
| `vectahub run <input>` | 自然语言执行或 YAML 工作流 |
| `vectahub chat` | 交互式 Chat REPL |
| `vectahub generate <input>` | LLM 生成 YAML 工作流 |
| `vectahub templates list` | 查看内置模板 |
| `vectahub templates use <name>` | 使用模板 |
| `vectahub tools list` | 查看可用工具 |
| `vectahub tools info <name>` | 查看工具详情 |
| `vectahub mode [mode]` | 查看/切换执行模式 |
| `vectahub list` | 查看已保存的工作流 |
| `vectahub serve` | 启动 API 服务器 |
| `vectahub setup` | 首次运行配置向导 |
| `vectahub version` | 查看版本 |
| `vectahub help` | 帮助信息 |

---

## 项目结构

```
vectahub/
├── src/
│   ├── cli.ts                  # CLI 入口
│   ├── index.ts                # 包入口
│   ├── types/                  # 类型定义
│   ├── nl/                     # NL 意图识别（16 种意图）
│   ├── workflow/               # 工作流引擎（engine/scheduler/executor）
│   ├── chat/                   # Chat REPL + 上下文管理
│   ├── sandbox/                # 沙箱隔离 + 危险检测
│   ├── skills/                 # AI 模块系统（20 模块 + 3 CLI 插件）
│   ├── commands/               # CLI 命令实现（run/chat 等）
│   ├── infrastructure/         # 基础设施（审计/配置/日志）
│   └── utils/                  # 工具函数
├── docs/                       # 文档目录
│   ├── getting-started.md      # 快速开始
│   ├── faq.md                  # 常见问题
│   ├── guides/                 # 使用指南
│   ├── reference/              # 技术参考
│   ├── product/                # 产品文档
│   └── archive/                # 归档文档
└── package.json
```

---

## 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npx tsx src/cli.ts run "查看当前目录"

# 类型检查
npm run typecheck

# 运行测试
npm test
```

### 测试覆盖

| 模块 | 要求 |
|------|------|
| Workflow Engine | >= 80% |
| Executor | >= 75% |
| 其他模块 | >= 70% |

当前状态：**100 个测试文件通过，1178 个测试用例通过，18 个测试用例跳过**。

说明：跳过项为需要外部条件的场景，例如当前环境不允许绑定本地 API 端口时的 API 集成测试。

### 代码规范

- 2 空格缩进，必须分号，单引号
- Import 顺序：内置 → 第三方 → 内部 → 类型
- 新组件使用 `createXxx()` 工厂函数，不导出 class
- TDD：先写失败测试 → 最少代码通过 → 重构

---

## 技术栈

TypeScript · Node.js · Commander.js · Vitest

---

## 许可证

MIT
