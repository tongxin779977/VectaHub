# VectaHub 模块健康度评估框架

本目录包含 VectaHub 项目模块健康度评估的完整框架文档。

## 文档结构

| 文档 | 说明 |
|------|------|
| [scoring-framework.md](./scoring-framework.md) | 评分框架总览：评分体系、等级定义、权重分配 |
| [google-standards.md](./google-standards.md) | 谷歌工程规范条例：必须遵守的核心规范条目 |
| [dimensions.md](./dimensions.md) | 20 个评分维度的详细说明、评分标准和扣分规则 |
| [evaluation-template.md](./evaluation-template.md) | 评估报告输出模板和示例 |

## 快速开始

### 评估流程

1. 阅读 [google-standards.md](./google-standards.md) 了解必须遵守的规范条例
2. 阅读 [dimensions.md](./dimensions.md) 了解每个维度的评分标准
3. 对目标模块逐维度评分，参考 [evaluation-template.md](./evaluation-template.md) 输出报告
4. 汇总评分，识别关键问题和改进方向

### 评分体系

- **20 个评分维度**，每个维度满分 5 分，总分 100 分
- 维度分为 7 组：架构设计、类型安全、代码风格、错误处理、测试质量、第三方依赖、可维护性
- 评分等级：A (90-100) / B (75-89) / C (60-74) / D (40-59) / F (0-39)

### 适用范围

本框架适用于 VectaHub 项目 `src/` 目录下的所有模块：

| 层次 | 模块 |
|------|------|
| 入口 & 命令层 | CLI Entry, Commands, Chat REPL, API Server |
| 业务逻辑层 | Workflow Engine, NL Engine, Skills, Agent Runtime, Execution, Debugger, Monitoring |
| 安全 & 沙箱层 | Sandbox, Security Protocol, Command Rules |
| 基础设施层 | Infrastructure, Types, Utils, CLI Tools, Setup, Daemon |

## 维护说明

- 本框架基于 Google Engineering Practices 和 Google TypeScript Style Guide
- 评分标准应随项目演进定期更新
- 新增维度或修改标准需经团队评审确认
