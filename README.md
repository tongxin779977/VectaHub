# VectaHub: Antigravity CACP Framework (Vite + React) 🚀

![VectaHub CACP Architecture](./public/assets/cacp_architecture.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?logo=vite)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.0+-61DAFB?logo=react)](https://reactjs.org/)
[![Protocol](https://img.shields.io/badge/Protocol-CACP%202.0-orange)](./.gemini/GEMINI.md)

> **VectaHub** (Antigravity CACP Framework) 是一个面向 AI 协作时代的工业级 Web 项目底座。它不仅提供了极致性能的 Vite + React 运行环境，更深度集成了基于 **Mailbox (异步信箱)** 机制的跨沙盒通信协议 (CACP 2.0)，实现了 AI Agent 与原生终端的无缝协同。

[English Version](./README_EN.md) | **中文说明**

---

## 🏗️ 核心引擎：CACP 2.0 (Cross-Agent Communication Protocol)

本项目最具竞争力的核心在于其 **CACP 2.0 异步驱动架构**。它彻底解决了 AI 助手在受限沙盒环境内无法执行原生二进制指令（如 `npm install`、`git push`、`docker build`）的痛点。

### 工业级通信 SOP

1.  **指令发信 (Command Post)**：Antigravity Agent 解析需求，将指令集序列化为 `.task` 格式写入 `.gemini/tasks/`。
2.  **高频监听 (Event Heartbeat)**：`gemini_watcher.sh` 作为守护进程，通过 2s 级心跳扫描“发件箱”，触发原生环境下的 Gemini CLI 提权执行。
3.  **执行回执 (Result Feedback)**：执行结果（Stdout/Stderr/ExitCode）被封装为 `.response` 实时回写，Agent 根据回执进行逻辑自愈。
4.  **权限归拨 (Permission Re-delegation)**：监听器执行完任务后，利用 `root` 权限自动执行 `chown` 与 `chmod`，确保所有 AI 生成的文件所有权实时回归 IDE 用户，根治 `EPERM` 权限死锁。

---

## 🛠️ 技术栈选型与优势

- **高效构建**: 基于 Vite 5.x 实现秒级热更新 (HMR)，确保极速开发体验。
- **现代 UI**: React 18.x (Concurrent Mode) 支持，保障高负载下的渲染流畅度。
- **协作底座**: Gemini CLI + CACP 2.0 构成的跨环境桥梁。
- **规则自治**: 结构化 `.gemini/GEMINI.md` 定义了项目的“数字宪法”，确立 Agent 行为边界。

---

## 🏗️ 架构深度解析：为什么它是“工业级”的？

作为一套 AI 驱动的代码自动化方案，VectaHub 的设计初衷是解决 **“从对话到交付”** 的最后 1 厘米。

### 1. 跨沙盒原子性 (Sandbox Traversal)

传统的 AI 助手受限于沙盒环境，无法触达复杂的本地二进制链（二进制隔离）。CACP 2.0 建立了基于“信箱”的解耦通信模型，让 Agent 专注于业务逻辑，让 Executor 专注于重型执行。

### 2. 动态权属自愈 (Auto-Chown)

在 AI 与人类混合开发的场景中，权限冲突（EPERM）是导致 CI/CD 失败的头号原因。`gemini_watcher.sh` 会在每次执行任务后自动进行所有权拨正，实现了 **“AI 生成，用户归属”** 的零感知体验。

### 3. 自主进化能力 (Self-Evolution & Bootstrapping)

VectaHub 理论上具备 **“根据文档完成自我进化”** 的能力。

- **文档驱动**：它可以读取项目内的 PRD 或 ADR 文档。
- **闭环自纠**：依托 CACP 协议，它能自主修改源码、运行测试、观察报错并迭代修复，直到实现逻辑对齐。
- **自产自销**：本项目自身的所有文档与协议架构，均是这一方案的实战产物。

---

## 🚀 快速开始

### 1. 初始化环境

```bash
git clone <your-repo-url>
cd <project-name>
npm install
```

### 2. 激活跨沙盒监听器 (关键步骤)

在原生终端（非 IDE 内嵌终端）中启动监听器。建议首次运行使用 `sudo` 以开启自动权限归拨功能：

```bash
sudo sh scripts/gemini_watcher.sh
```

### 3. 启动开发服务器

```bash
npm run dev
```

---

## 🛡️ 安全、隐私与权限管理

### 为什么需要 sudo？
在 CACP 2.0 架构中，`sudo` 是实现 **“生成即归属”** 的必要条件：
-   **突破沙盒约束**：沙盒内的 Agent 无法触达宿主机二进制环境。
-   **动态权属修正 (Auto-Chown)**：AI 生成的文件默认权限可能受限，监听器通过 `root` 权限将文件所有权强制拨正给当前用户 `$(whoami)`，确保开发过程无感、顺滑。

### 隐私保护
项目原生适配 **GitHub Ready**：
-   使用 `$(id -u):$(id -g)` 动态获取系统标识，杜绝硬编码。
-   敏感路径与凭证受 `.geminiignore` 保护，确保开源安全性。

---

## ✨ 全量自主生成声明 (Self-Provenance)

> **本项目的脚手架、CACP 通信协议架构、脚本逻辑以及您正在阅读的所有文档，均由本项目内置的 CACP 协议驱动 Agent 自动化生成。**

这不仅是一个模板，更是对 **AI 驱动软件工程 (AI-Driven Software Engineering)** 可行性的工业级实战验证。

---

## 📂 目录结构

```text
├── .agents/            # Agent 逻辑与工作流规约
├── .gemini/
│   ├── tasks/          # 任务指令发件箱
│   ├── responses/      # 执行回执收件箱
│   └── GEMINI.md       # CACP 2.0 协议规范 (项目宪法)
├── scripts/
│   └── gemini_watcher.sh # 跨环境通信守护进程 (2s 心跳)
├── src/                # 业务源码 (React + Vite)
└── vite.config.js      # 构建配置
```

---

## 📄 开源协议

基于 [MIT License](./LICENSE) 开源。
