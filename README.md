# VectaHub

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-21+-339933?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)

> **用自然语言定义本地自动化工作流，安全执行，可复用。**

---

## 一句话定位

说人话，自动编排工作流，安全执行。

| 你想要 | 传统方式 | VectaHub |
|--------|----------|----------|
| 压缩文件 | 写 bash 脚本 | `"压缩当前目录的所有图片"` |
| 跑测试后部署 | 写 Makefile | `"跑测试，通过了就部署"` |
| 备份数据库 | 写 cron + 脚本 | `"每天凌晨备份数据库到外接硬盘"` |

---

## 快速开始

### 安装

```bash
npm install -g vectahub
```

### 首次配置

```bash
vectahub setup
```

首次运行会引导你配置 LLM 提供商（OpenAI / Anthropic / Ollama）。如果跳过配置，VectaHub 会降级使用关键词匹配模式。

### 使用自然语言执行

```bash
vectahub run "查看 git 状态"
vectahub run "查找昨天修改的所有 .ts 文件"
vectahub run "跑测试，通过了就构建"
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

## 核心功能

### 工作流引擎

- **五种步骤类型**: `exec`（本地命令）、`if`（条件）、`for_each`（循环）、`parallel`（并行）、`opencli`（网站适配器）
- **拓扑排序**: 自动处理步骤依赖
- **暂停/恢复**: 中断后从断点继续
- **DryRun 模式**: 预览不执行

### 安全执行

- **三层检测**: 安全协议引擎 + 命令黑白名单 + 危险命令正则匹配
- **多平台沙箱**: macOS sandbox-exec / Linux bubblewrap
- **三种模式**: `strict`（严格）、`relaxed`（宽松）、`consensus`（协商确认）

### 工具集成

内置工具元数据注册（git/npm/docker/curl），以及 OpenCLI 适配器基础集成。

### LLM 集成

支持 OpenAI / Anthropic / Ollama 三大提供商，用于自然语言意图解析和 YAML 工作流生成。

---

## CLI 命令

```bash
# 工作流
vectahub run <intent>            # 自然语言执行
vectahub run -f <file>           # 从 YAML 文件执行
vectahub generate <desc>         # LLM 生成 YAML 工作流
vectahub list                    # 列出保存的工作流
vectahub history                 # 查看执行历史

# 工具管理
vectahub tools list              # 列出所有工具
vectahub tools search <keyword>  # 搜索工具
vectahub tools categories        # 查看工具分类
vectahub tools info <name>       # 查看工具详情

# 执行模式
vectahub mode                    # 查看/切换模式

# 其他
vectahub doctor                  # 系统诊断
vectahub setup                   # 首次配置向导
vectahub security                # 安全管理
vectahub audit                   # 查看审计日志
```

---

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 21+
- **构建**: tsup
- **CLI**: Commander.js
- **配置**: YAML

---

## 开源协议

基于 [MIT License](./LICENSE) 开源。
