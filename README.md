# VectaHub: Natural Language Workflow Automation Engine 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-21+-339933?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)

> **VectaHub** 是一个自然语言驱动的工作流自动化引擎。只需用自然语言描述你要做的事，它会自动生成、执行、并记录整个工作流。

[English Version](./README_EN.md) | **中文说明**

---

## 核心价值：一句话说清 VectaHub

| 工具 | 你要做什么 | 实际工作 |
|------|-----------|----------|
| Taskfile | 写 YAML: `tasks: { compress: ... }` | 说"压缩图片" |
| Shell Script | 写 bash: `for f in *.jpg; do...` | 说"压缩图片" |
| Claude Code | 手动指导 AI 每一步 | 说"压缩图片" |
| **VectaHub** | **说什么就做什么** | **说"压缩图片"** |

---

## 🎯 核心使用场景

### 场景 1：日常文件处理

```bash
$ vectahub "压缩当前目录的图片"

🤖 解析意图: IMAGE_COMPRESS
📋 生成工作流:
  Step 1: find . -type f \( -name "*.jpg" -o -name "*.png" \)
  Step 2: for each: convert ${item} -resize 50% ${item}
⏳ 模式: CONSENSUS

确认执行? [Y/n] y
▶️ 执行中...
✅ 完成: 12 个文件已压缩
```

### 场景 2：开发者工作流

```bash
$ vectahub "跑测试，通过就部署"

🤖 解析意图: CI_PIPELINE
📋 生成工作流:
  Step 1: npm test
  Step 2: if (exit_code == 0) then npm run deploy
⏳ 模式: STRICT (CI 场景自动严格)

▶️ 执行中...
  ▶ npm test ... ✅
  ▶ npm run deploy ... ✅
```

### 场景 3：Git 协作

```bash
$ vectahub "提交并推送所有更改"

🤖 解析意图: GIT_WORKFLOW
📋 生成工作流:
  Step 1: git add -A
  Step 2: git commit -m "update"
  Step 3: git push
```

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        VectaHub                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  NL Parser  │───▶│   Workflow  │───▶│  Executor   │   │
│  │   (意图解析) │    │   Engine    │    │   (执行器)   │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│         │                  │                  │           │
│         ▼                  ▼                  ▼           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │ Intent       │    │ Workflow    │    │ Sandbox     │   │
│  │ Templates    │    │ Storage     │    │ (macOS)     │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 |
|------|------|
| **NL Parser** | 将自然语言转为 Workflow 对象 |
| **Workflow Engine** | 管理工作流生命周期、步骤执行 |
| **Executor** | 在沙盒中执行 CLI 命令 |
| **Sandbox** | macOS 沙盒隔离，保证安全执行 |
| **CLI Tools Registry** | 标准化 CLI 工具集成 |

---

## 🛡️ 安全机制

### 三种执行模式

| 模式 | 非危险命令 | 危险命令 | 适用场景 |
|------|-----------|----------|----------|
| **STRICT** | 自动执行 | 报错 | CI/CD |
| **RELAXED** | 自动执行 | 报错 | 开发调试 |
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

## 📦 内置意图模板

| Intent | 描述 | 示例 |
|--------|------|------|
| `IMAGE_COMPRESS` | 压缩图片 | "压缩当前目录图片" |
| `FILE_FIND` | 查找文件 | "找出所有大于 100M 的文件" |
| `BACKUP` | 备份文件/目录 | "备份 Documents 到外接硬盘" |
| `CI_PIPELINE` | CI 流程 | "跑测试，通过就部署" |
| `BATCH_RENAME` | 批量重命名 | "把所有 .jpeg 改成 .jpg" |
| `GIT_WORKFLOW` | Git 操作 | "提交并推送" |

---

## 🚀 快速开始

### 1. 安装

```bash
npm install -g vectahub
```

### 2. 运行自然语言命令

```bash
vectahub run "压缩当前目录的图片"
vectahub run "提交并推送所有更改"
vectahub run "找出所有大于 100M 的文件"
```

### 3. 从文件运行工作流

```bash
vectahub run -f workflow.yaml
```

---

## 📂 项目结构

```
VectaHub/
├── docs/design/              # 设计文档
├── src/
│   ├── cli.ts               # CLI 入口
│   ├── nl/                  # 自然语言解析
│   │   ├── parser.ts
│   │   ├── intent-matcher.ts
│   │   └── templates/
│   ├── workflow/            # 工作流引擎
│   │   ├── engine.ts
│   │   ├── executor.ts
│   │   └── storage.ts
│   ├── sandbox/            # 沙盒隔离
│   │   ├── detector.ts
│   │   └── sandbox.ts
│   ├── cli-tools/          # CLI 工具集成
│   │   ├── registry.ts
│   │   └── tools/
│   └── utils/              # 工具函数
├── workflows/               # 用户工作流
└── intents/                # 自定义意图
```

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
