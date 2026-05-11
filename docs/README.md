# VectaHub 文档

> 最后更新: 2026-05-10

本文档目录现只保留两类核心内容，作为唯一的 Single Source of Truth (SSOT):

1. **VectaHub 1.x 核心架构与演进 (Features)**
2. **VectaHub 2.0 跨项目蓝图与 Go 迁移设计 (V2)**

历史废弃目录 (`current` 和 `developer`) 已被移除，彻底清理过期架构与死链接。

## 1. VectaHub 1.x 核心架构与演进 (v1/features)

面向维护者与核心开发者，记录当前 TypeScript 项目在 Phase 6 经历的 LLM Native 架构重构，以及最新的意图映射、防护层和可观测性设计。

| 文档 | 说明 |
|------|------|
| [LLM Self-Bootstrap 设计](./v1/features/llm-self-bootstrap-design.md) | VectaHub V1 Phase 6 核心架构演进方案 (从硬编码走向意图映射) |
| [路线图与里程碑](./v1/features/llm-self-bootstrap-roadmap.md) | Phase 6 任务拆解、时间线与最终闭环验收状态 |
| [实施细节说明](./v1/features/llm-self-bootstrap-implementation.md) | 逐文件、逐任务的落地细节，包括防腐层与分层记忆的实现 |
| [风险与指标](./v1/features/llm-self-bootstrap-issues.md) | 遗留问题、运行时防漂移风险及 LLMObservability 指标 |

## 2. VectaHub 2.0 蓝图预研 (v2)

面向未来版本。这里的内容是架构演进目标，主要探索多 Daemon 通信与跨项目元数据共享。

| 文档 | 说明 |
|------|------|
| [系统架构设计](./v2/system-architecture.md) | V2 总体架构、模块边界和迁移原则 |
| [功能点开发文档](./v2/feature-development.md) | 1.x 能力迁移目标和 2.0 新增能力 |
| [API 接口设计](./v2/api-interface.md) | 跨项目通信 JSON-RPC、REST 协议及插件 API 设计 |
| [数据模型设计](./v2/data-model.md) | 1.x 数据兼容、核心模型和存储策略 |
| [LLM-Native 优化方案](./v2/llm-native-optimization.md) | LLM 解析、表达式和诊断能力演进 |
| [VS Code 插件任务](./v2/vscode-extension-tasks.md) | VS Code 插件深层集成任务 |
| [跨项目效率任务](./v2/cross-project-productivity.md) | 项目任务识别、跨项目依赖联调设计 |

## 3. 治理规范 (Governance)

面向所有 vibecoding 场景，确保 AI 辅助编码的一致性。

| 文件 | 位置 | 说明 |
|------|------|------|
| [Vibecoding 治理原则](../.agent/vibecoding-governance.md) | `.agent/` | 全局原则层（跨工具、跨项目，alwaysApply） |
| [文档检索 Skill](../.agent/skills/vibecoding-context-loader/SKILL.md) | `.agent/skills/` | Token-Smart 文档按需加载（on-demand） |
| [代码风格指南](../.trae/rules/code-style-guide.md) | `.trae/rules/` | V1 TypeScript 风格细则 |
| [依赖管理策略](../.trae/rules/dependency-policy.md) | `.trae/rules/` | V1 依赖白名单与审批流程 |

## 阅读路径

**新任核心开发者:**
请务必按照以下顺序阅读 `v1/features` 下的文档，理解最新的意图防腐层架构：
1. [LLM Self-Bootstrap 设计](./v1/features/llm-self-bootstrap-design.md)
2. [实施细节说明](./v1/features/llm-self-bootstrap-implementation.md)

**架构师/V2 设计者:**
1. [跨项目效率任务](./v2/cross-project-productivity.md)
2. [系统架构设计](./v2/system-architecture.md)
3. [API 接口设计](./v2/api-interface.md)

## 当前状态说明

当前 VectaHub (V1.0.0-Beta) 已完成 **Phase 6: LLM 架构全面升级**。所有基于硬编码与 Regex 的弱链接均已被基于 JSON Schema 和确定性映射的**防腐层 (Anti-Corruption Layer)** 替代。

系统测试全量绿色通过：

```bash
npm run typecheck
npx vitest run
```
