# VectaHub

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-21+-339933?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)

> **用自然语言定义本地自动化工作流，安全执行，可复用。**

---

## 🎯 一句话介绍

说人话，自动编排工作流，安全执行。

| 你想要 | 传统方式 | VectaHub |
|--------|----------|----------|
| 压缩文件 | 写 bash 脚本 | `"压缩当前目录的所有图片"` |
| 跑测试后部署 | 写 Makefile | `"跑测试，通过了就部署"` |
| 备份数据库 | 写 cron + 脚本 | `"每天凌晨备份数据库到外接硬盘"` |

---

## 🚀 快速开始

### 1. 安装

```bash
npm install -g vectahub
```

### 2. 首次配置（可选但推荐）

```bash
vectahub setup
```

首次运行会引导你配置 LLM 提供商（OpenAI / Anthropic / Ollama）。如果跳过配置，VectaHub 会降级使用关键词匹配模式，依然可以使用！

### 3. 检查环境

```bash
vectahub doctor
```

确保所有依赖都正常安装。

### 4. 你的第一条命令

```bash
vectahub run "查看当前目录文件"
```

---

## ✨ 核心功能

### 🤖 自然语言理解

- **LLM 优先**: 使用大语言模型理解你的意图
- **智能降级**: LLM 不可用时自动使用关键词匹配
- **16种意图**: 覆盖常见自动化场景

### 🔄 工作流引擎

- **五种步骤类型**: `exec`（本地命令）、`if`（条件）、`for_each`（循环）、`parallel`（并行）、`opencli`（网站适配器）
- **拓扑排序**: 自动处理步骤依赖
- **暂停/恢复**: 中断后从断点继续
- **DryRun 模式**: 预览不执行

### 🔒 安全执行

- **三层检测**: 安全协议引擎 + 命令黑白名单 + 危险命令正则匹配
- **多平台沙箱**: macOS sandbox-exec / Linux bubblewrap
- **三种模式**: `strict`（严格）、`relaxed`（宽松）、`consensus`（协商确认）

### 🔧 工具集成

内置工具元数据注册（git/npm/docker/curl），以及 OpenCLI 适配器基础集成。

---

## 💡 常用示例

### 自然语言执行

```bash
# 简单查询
vectahub run "查看 git 状态"
vectahub run "查找昨天修改的所有 .ts 文件"

# 复合任务
vectahub run "跑测试，通过了就构建"
vectahub run "压缩图片，然后备份到桌面"

# Dry Run（预览）
vectahub run --dry-run "删除缓存文件"
```

### 使用 YAML 工作流

创建 `workflow.yaml`：

```yaml
name: 提交并推送
steps:
  - id: step1
    type: exec
    cli: git
    args: ["add", "-A"]
  - id: step2
    type: exec
    cli: git
    args: ["commit", "-m", "update"]
  - id: step3
    type: exec
    cli: git
    args: ["push"]
mode: relaxed
```

然后运行：

```bash
vectahub run -f workflow.yaml
```

### 使用 LLM 生成工作流

```bash
vectahub generate "每天早上获取热榜并保存"
```

---

## 📚 文档索引

| 文档 | 说明 |
|------|------|
| **[快速开始](./docs/getting-started.md)** | 新手必读，3分钟上手 |
| **[常见问题](./docs/faq.md)** | 遇到问题？先看这里 |
| **[CLI 命令](./docs/guides/cli-commands.md)** | 完整命令参考 |
| **[用户场景](./docs/guides/user-scenarios.md)** | 20个真实使用场景 |
| **[产品定位](./docs/product/01_product_positioning.md)** | 了解 VectaHub 适合谁 |

---

## 🛠️ 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 21+
- **构建**: tsup
- **CLI**: Commander.js
- **配置**: YAML

---

## 📊 项目状态

✅ **VectaHub 1.0.0 已发布！**

- 650 个测试用例全部通过
- 完整的 CLI 命令体系
- 安全沙箱隔离
- LLM 优先 + 关键词降级

---

## 📄 开源协议

基于 [MIT License](./LICENSE) 开源。
