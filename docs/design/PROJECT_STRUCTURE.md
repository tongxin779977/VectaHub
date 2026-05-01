# VectaHub 项目结构梳理

> 本文档定义 VectaHub 项目的完整目录结构、模块职责和文件组织规范

---

## 1. 项目概览

```
vectahub/
├── src/                      # 源代码
│   ├── index.ts              # 入口点
│   ├── cli.ts                # CLI 命令行入口
│   ├── cli.test.ts           # CLI 测试
│   ├── cli-tools/            # CLI 工具注册系统
│   ├── command-rules/        # 命令规则引擎 (黑白名单)
│   ├── nl/                   # 自然语言解析器
│   ├── sandbox/              # 沙盒执行
│   ├── security-protocol/    # 安全协议
│   ├── skills/               # Skill 扩展系统
│   ├── types/                # 全局类型定义
│   ├── utils/                # 工具函数
│   └── workflow/             # 工作流引擎
├── docs/                     # 设计文档
│   ├── design/               # 架构设计文档
│   └── README.md             # 文档索引
├── .trae/                    # Trae IDE 配置
├── .vectahub/                # VectaHub 用户数据 (不提交)
├── package.json              # 项目配置
├── tsconfig.json             # TypeScript 配置
├── vitest.config.ts          # 测试配置
└── README.md                 # 项目说明
```

---

## 2. 源代码结构

### 2.1 核心模块

| 目录 | 职责 | 关键文件 | 状态 |
|------|------|----------|------|
| **src/** | 入口点 | `index.ts`, `cli.ts` | ✅ 已实现 |
| **src/cli-tools/** | CLI 工具注册系统 | `registry.ts`, `types.ts` | ✅ 已实现 |
| **src/command-rules/** | 命令黑白名单 | `engine.ts`, `matcher.ts` | ✅ 已实现 |
| **src/nl/** | 自然语言解析 | `parser.ts`, `intent-matcher.ts` | ✅ 已实现 |
| **src/sandbox/** | 沙盒执行 | `sandbox.ts`, `detector.ts` | ✅ 部分实现 |
| **src/security-protocol/** | 安全协议 | `manager.ts`, `types.ts` | ✅ 已实现 |
| **src/skills/** | Skill 扩展 | `iterative-refinement/` | ✅ 已实现 |
| **src/types/** | 类型定义 | `index.ts` | ✅ 已实现 |
| **src/utils/** | 工具函数 | `config.ts`, `logger.ts` | ✅ 已实现 |
| **src/workflow/** | 工作流引擎 | `engine.ts`, `executor.ts` | ✅ 已实现 |

---

### 2.2 详细模块结构

#### **src/cli-tools/** - CLI 工具注册系统

```
src/cli-tools/
├── index.ts                  # 模块入口
├── registry.ts               # 工具注册表
├── registry.test.ts          # 注册表测试
├── types.ts                  # 类型定义
├── command-rules/            # 命令规则
│   ├── audit.ts              # 审计日志
│   ├── engine.ts             # 规则引擎
│   ├── index.ts              # 模块入口
│   ├── templates.ts          # 规则模板
│   └── types.ts              # 类型定义
├── discovery/                # 工具发现
│   ├── ai-tools.ts           # AI 工具检测
│   ├── index.ts              # 模块入口
│   ├── known-tools.ts        # 已知工具列表
│   ├── scanner.ts            # 扫描器
│   └── types.ts              # 类型定义
├── registration/             # 工具注册
│   ├── config.ts             # 配置加载
│   ├── index.ts              # 模块入口
│   └── types.ts              # 类型定义
└── tools/                    # 内置工具
    ├── git.ts                # Git 工具适配器
    └── npm.ts                # NPM 工具适配器
```

#### **src/command-rules/** - 命令规则引擎

```
src/command-rules/
├── index.ts                  # 模块入口
├── engine.ts                 # 规则引擎
├── engine.test.ts            # 引擎测试
├── loader.ts                 # 规则加载器
├── matcher.ts                # 规则匹配器
├── matcher.test.ts           # 匹配器测试
└── types.ts                  # 类型定义
```

#### **src/nl/** - 自然语言解析器

```
src/nl/
├── index.ts                  # 模块入口
├── parser.ts                 # NL 解析器
├── parser.test.ts            # 解析器测试
├── intent-matcher.ts         # 意图匹配器
├── param-extractor.ts        # 参数提取器
├── command-synthesizer.ts    # 命令合成器
├── command-synthesizer.test.ts
├── command-validator.ts      # 命令验证器
├── entity-extractor.ts       # 实体提取器
├── entity-extractor.test.ts
├── synonym-matcher.ts        # 同义词匹配
├── synonym-matcher.test.ts
├── i18n.ts                   # 国际化
├── i18n.test.ts
├── context-manager.ts        # 上下文管理
├── context-manager.test.ts
├── custom-intent.ts          # 自定义意图
├── llm.ts                    # LLM 集成 (预留)
├── progress.ts               # 进度追踪
└── templates/                # 意图模板
    ├── index.ts              # 模板导出
    └── .gitkeep              # 保留目录
```

#### **src/workflow/** - 工作流引擎

```
src/workflow/
├── index.ts                  # 模块入口
├── engine.ts                 # 工作流引擎
├── engine.test.ts            # 引擎测试
├── executor.ts               # 执行器
├── executor.test.ts          # 执行器测试
├── storage.ts                # 工作流存储
├── storage.test.ts           # 存储测试
├── storage_index.ts          # 存储索引
├── context-manager.ts        # 上下文管理
├── context-manager.test.ts
├── ai-delegate.ts            # AI 委派执行器
├── ai-delegate.test.ts       # 委派测试
├── ai-env-detector.ts        # AI 环境检测
├── ai-env-detector.test.ts
├── ai-fallback-strategy.ts   # AI 降级策略
├── ai-fallback-strategy.test.ts
├── ai-provider-registry.ts   # AI 提供者注册表
└── session-manager.ts        # AI 会话管理
    └── session-manager.test.ts
```

#### **src/sandbox/** - 沙盒执行

```
src/sandbox/
├── index.ts                  # 模块入口
├── sandbox.ts                # 沙盒实现
├── sandbox.test.ts           # 沙盒测试
├── detector.ts               # 危险命令检测
└── detector.test.ts          # 检测器测试
```

#### **src/security-protocol/** - 安全协议

```
src/security-protocol/
├── index.ts                  # 模块入口
├── manager.ts                # 安全管理器
├── default-rules.ts          # 默认规则
└── types.ts                  # 类型定义
```

#### **src/skills/** - Skill 扩展系统

```
src/skills/
└── iterative-refinement/     # 迭代优化 Skill
    ├── index.ts              # 模块入口
    ├── index.test.ts         # 测试
    ├── 5whys-analyzer.ts     # 5 Whys 分析器
    ├── 5whys-analyzer.test.ts
    ├── retry-manager.ts      # 重试管理器
    ├── retry-manager.test.ts
    ├── types.ts              # 类型定义
    └── example.ts            # 示例
```

#### **src/utils/** - 工具函数

```
src/utils/
├── index.ts                  # 模块入口 (导出所有工具)
├── config.ts                 # 配置加载
├── logger.ts                 # 日志工具
├── errors.ts                 # 错误定义
├── audit.ts                  # 审计日志
├── audit-cmd.ts              # 审计命令
├── ai.ts                     # AI 工具辅助
├── ai-config.ts              # AI 配置
├── build.ts                  # 构建辅助
├── check.ts                  # 检查工具
├── doctor.ts                 # 诊断工具
├── history.ts                # 历史记录
├── list.ts                   # 列表工具
├── mode.ts                   # 模式管理
├── module.ts                 # 模块工具
├── run.ts                    # 运行辅助
├── security.ts               # 安全辅助
├── serve.ts                  # 服务辅助
├── status.ts                 # 状态工具
├── test.ts                   # 测试辅助
├── tools.ts                  # 工具辅助
└── validate.ts               # 验证工具
```

#### **src/types/** - 全局类型定义

```
src/types/
└── index.ts                  # 所有共享类型定义
```

---

## 3. 配置文件

| 文件 | 用途 | 是否提交 |
|------|------|----------|
| `package.json` | 项目配置、依赖管理 | ✅ 是 |
| `tsconfig.json` | TypeScript 编译配置 | ✅ 是 |
| `vitest.config.ts` | Vitest 测试配置 | ✅ 是 |
| `.gitignore` | Git 忽略规则 | ✅ 是 |
| `.env` | 环境变量 (API Keys) | ❌ 否 |
| `.env.local` | 本地环境变量 | ❌ 否 |
| `.vectahub/` | VectaHub 用户数据 |