# VectaHub 文档

> 最后更新: 2026-05-08

本文档目录只保留三类内容:

1. 当前可用功能
2. 开发者参考
3. VectaHub 2.0 Go 迁移设计

历史报告、归档计划和过期状态文档已从 `docs/` 中移除，避免与当前功能说明混淆。

## 当前可用功能

面向使用者，描述当前 TypeScript CLI 项目的实际使用方式。

| 文档 | 说明 |
|------|------|
| [快速开始](./current/getting-started.md) | 3 分钟上手 VectaHub |
| [常见问题](./current/faq.md) | 安装、配置、使用、安全和排障说明 |
| [CLI 命令](./current/cli-commands.md) | 当前 CLI 命令清单 |
| [用户场景](./current/user-scenarios.md) | VectaHub 1.0.0 的常见使用场景 |
| [全量模拟用户验收测试](./current/full-user-acceptance-test.md) | CLI、VS Code 插件和联动路径的端到端验收步骤 |
| [已知问题](./current/BUGS.md) | 当前待修复问题与修复建议 |

## 开发者参考

面向维护者和实现者，描述当前 TypeScript 实现的主要模块、接口和设计约束。

| 文档 | 说明 |
|------|------|
| [系统架构](./developer/architecture.md) | 当前 TypeScript 项目的整体架构 |
| [沙箱设计](./developer/sandbox.md) | 沙箱隔离、执行模式和命令规则 |
| [NL 意图识别架构](./developer/nl-architecture.md) | 自然语言意图识别和 fallback 流程 |
| [工作流引擎设计](./developer/workflow-engine.md) | 工作流执行、状态机、Executor 和存储 |

## VectaHub 2.0 Go 迁移设计

面向未来版本。这里的内容是 Go 重构目标，不代表当前 TypeScript 1.0 全部已经实现。

| 文档 | 说明 |
|------|------|
| [系统架构设计](./v2/system-architecture.md) | Go 重构总体架构、模块边界和迁移原则 |
| [功能点开发文档](./v2/feature-development.md) | 1.x 能力迁移目标和 2.0 新增能力 |
| [API 接口设计](./v2/api-interface.md) | CLI JSON、REST、gRPC 和插件 API 设计 |
| [数据模型设计](./v2/data-model.md) | 1.x 数据兼容、核心模型和存储策略 |
| [LLM-Native 优化方案](./v2/llm-native-optimization.md) | LLM 解析、表达式和诊断能力演进 |
| [VS Code 插件任务](./v2/vscode-extension-tasks.md) | VS Code 插件 MVP 实施任务 |
| [跨项目效率任务](./v2/cross-project-productivity.md) | 项目任务识别、预览和执行设计 |

## 阅读路径

新用户:

1. [快速开始](./current/getting-started.md)
2. [用户场景](./current/user-scenarios.md)
3. [常见问题](./current/faq.md)

维护者:

1. [系统架构](./developer/architecture.md)
2. [工作流引擎设计](./developer/workflow-engine.md)
3. [沙箱设计](./developer/sandbox.md)
4. [已知问题](./current/BUGS.md)

2.0 设计与迁移:

1. [系统架构设计](./v2/system-architecture.md)
2. [功能点开发文档](./v2/feature-development.md)
3. [API 接口设计](./v2/api-interface.md)
4. [数据模型设计](./v2/data-model.md)

## 当前状态说明

当前仓库是 TypeScript + Node.js + Commander.js + Vitest 项目，包版本以根目录 `package.json` 为准。

最近一次本地验证中，根项目类型检查可通过；扩展包 lint 仍存在待修复问题。因此文档不声明“全部校验通过”。发布前应重新执行:

```bash
npm run typecheck
npm run test:run
npm run build
npm run lint -w packages/vectahub-vscode-extension
```
