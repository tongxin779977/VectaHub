# VectaHub 文档

> 版本: 1.0.1 · 最后更新: 2026-05-06

---

## 快速开始

| 文档 | 说明 |
|------|------|
| [快速开始](./getting-started.md) | 3 分钟上手 VectaHub |
| [常见问题](./faq.md) | 遇到问题先看这里 |
| [用户场景](./guides/user-scenarios.md) | 20 个真实使用场景 |

---

## 使用指南

| 文档 | 说明 |
|------|------|
| [CLI 命令](./guides/cli-commands.md) | 完整命令参考 |

---

## 技术参考

| 文档 | 说明 |
|------|------|
| [系统架构](./reference/01_system_architecture.md) | 整体架构设计 |
| [沙箱设计](./reference/02_sandbox_design.md) | 沙箱隔离机制 |
| [NL 意图识别架构](./reference/03_nl_architecture.md) | 自然语言意图识别系统 |
| [工作流引擎设计](./reference/06_workflow_engine_design.md) | 工作流引擎设计 |

---

## 产品文档

| 文档 | 说明 |
|------|------|
| [产品定位](./product/01_product_positioning.md) | 产品定位与核心价值 |
| [已实现功能](./product/00_implemented_features.md) | 1.0 版本功能清单 |
| [1.0 产品路线图](./product/02_1.0_product_roadmap.md) | 1.0 开发计划（已完成） |

---

## 归档文档

以下为已完成/过期的设计规划文档，保留作为历史参考：

| 文档 | 状态 |
|------|------|
| [架构重构计划 v2](./archive/01_architecture-refactoring-plan-v2.md) | 已归档 |
| [架构重构计划 v1](./archive/02_architecture-refactoring-plan.md) | 已归档 |
| [Agent 开发任务](./archive/04_agent_tasks.md) | 已完成 |
| [测试任务](./archive/05_test_tasks.md) | 已完成 |
| [工程改进计划](./archive/11_engineering_improvement_plan.md) | 已完成 |

---

## 测试报告

| 文档 | 说明 |
|------|------|
| [LLM 集成测试报告](./reports/LLM_INTEGRATION_TEST_REPORT.md) | LLM 功能集成测试 |

---

## 阅读指引

### 新用户

1. [快速开始](./getting-started.md) — 3 分钟上手
2. [用户场景](./guides/user-scenarios.md) — 20 个真实例子
3. [常见问题](./faq.md) — 遇到问题先看这里

### 开发者

1. [系统架构](./reference/01_system_architecture.md) — 理解整体设计
2. [NL 意图识别架构](./reference/03_nl_architecture.md) — 核心 NL 系统
3. [CLI 命令](./guides/cli-commands.md) — 命令参考

### 产品经理

1. [产品定位](./product/01_product_positioning.md) — VectaHub 是什么
2. [已实现功能](./product/00_implemented_features.md) — 功能清单
3. [1.0 路线图](./product/02_1.0_product_roadmap.md) — 开发计划

---

## VectaHub 1.0 状态

**VectaHub 1.0.1** · 71 个测试文件 / 905 个测试用例全部通过

- 16 种意图类型，99.2% 识别准确率
- Chat REPL 交互式对话
- LLM 优先 + 关键词降级
- 20 个 AI 模块 + 3 个 CLI 插件
- 安全沙箱 + 危险命令检测
- 完整 CLI 命令体系
