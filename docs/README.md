# VectaHub 文档

> 版本: 2.0 · 最后更新: 2026-05-06

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

## 设计文档

### VectaHub 2.0（Go 语言版本）

| 文档 | 说明 |
|------|------|
| [系统架构设计](./design/01_SYSTEM_ARCHITECTURE_V2.md) | 系统功能架构、模块划分、交互流程及技术选型 |
| [功能点开发文档](./design/02_FEATURE_DEVELOPMENT_V2.md) | 各功能点的需求描述、实现方案、接口定义及开发进度 |
| [API 接口设计](./design/03_API_INTERFACE_V2.md) | CLI、gRPC、REST API 及插件 API 接口定义 |
| [数据模型设计](./design/04_DATA_MODEL_V2.md) | 核心数据模型、关系及存储策略 |

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
| [已实现功能](./product/00_implemented_features.md) | 1.0 版本功能清单（归档） |
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

1. [系统架构设计](./design/01_SYSTEM_ARCHITECTURE_V2.md) — Go 版本整体设计
2. [API 接口设计](./design/03_API_INTERFACE_V2.md) — 接口定义参考
3. [CLI 命令](./guides/cli-commands.md) — 命令参考

### 产品经理

1. [产品定位](./product/01_product_positioning.md) — VectaHub 是什么
2. [功能点开发文档](./design/02_FEATURE_DEVELOPMENT_V2.md) — 功能清单与进度

---

## VectaHub 2.0（Go 语言版本）

**计划中** · Go 1.21+

| 特性 | 说明 |
|------|------|
| **语言** | Go 1.21+ |
| **CLI 框架** | Cobra |
| **配置管理** | Viper |
| **日志** | Zap |
| **HTTP 服务** | Gin |
| **RPC 服务** | gRPC |
| **容器隔离** | Docker SDK |
| **LLM 集成** | go-openai |
| **监控** | Prometheus + OpenTelemetry |
| **测试** | testify |

### 开发计划

| 阶段 | 时间 | 主要任务 |
|------|------|---------|
| **Phase 1** | 第 1 周 | 基础设施 + CLI 框架 |
| **Phase 2** | 第 2-3 周 | 核心模块（NL、工作流、沙箱） |
| **Phase 3** | 第 4 周 | 调试器 + 插件系统 |
| **Phase 4** | 第 5 周 | 监控 + 后台服务 |
| **Phase 5** | 第 6 周 | 安全增强 + 测试 |

**总开发时间：6 周**
