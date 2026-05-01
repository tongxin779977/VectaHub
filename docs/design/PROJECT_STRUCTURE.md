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
| `.vectahub/` | VectaHub 用户数据 | ❌ 否 |

---

## 4. 文档结构

### 4.1 设计文档

```
docs/
├── design/
│   ├── README.md             # 文档索引 (01-09)
│   ├── 01_system_architecture.md    # 系统架构
│   ├── 02_sandbox_design.md         # 沙盒设计
│   ├── 03_ai_cli_framework_design.md # AI CLI 框架
│   ├── 04_nl_parser_skill_design.md  # NL 解析器
│   ├── 05_vscode_plugin_design.md    # VSCode 插件
│   ├── 06_workflow_engine_design.md  # 工作流引擎
│   ├── 07_module_design.md           # 模块化设计
│   ├── 08_dev_command_design.md      # 开发者命令
│   └── 09_cli_tools_integration.md   # CLI 工具集成
└── interview-java-oa.md      # 其他文档
```

### 4.2 临时文档 (不提交)

```
.trae/documents/
├── AI_CLI_环境发现与智能降级设计文档.md
└── AI_CLI_环境发现与智能降级集成计划.md
```

---

## 5. 文件命名规范

### 5.1 源文件

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| **模块入口** | `index.ts` | `src/nl/index.ts` |
| **核心实现** | 小写连字符 | `intent-matcher.ts` |
| **测试文件** | 同名 + `.test.ts` | `parser.ts` → `parser.test.ts` |
| **类型定义** | `types.ts` | `src/cli-tools/types.ts` |

### 5.2 测试文件

```
src/
├── module.ts           # 实现
└── module.test.ts      # 测试 (同名 + .test.ts)
```

**规则**：
- 测试文件与源文件同目录
- 使用 `.test.ts` 后缀
- 使用 Vitest 框架

---

## 6. Git 忽略规则

### 6.1 必须忽略

| 模式 | 说明 | 示例 |
|------|------|------|
| `node_modules/` | 依赖 | `node_modules/` |
| `dist/` | 构建输出 | `dist/` |
| `.env` | 环境变量 | `.env`, `.env.local` |
| `.vectahub/` | 用户数据 | `.vectahub/` |
| `.trae/documents/` | 临时文档 | `.trae/documents/` |
| `*.log` | 日志文件 | `npm-debug.log` |
| `.DS_Store` | macOS 元数据 | `.DS_Store` |
| `test-*.ts` | 临时测试文件 | `test-cli-tools.ts` |

### 6.2 必须提交

| 文件 | 说明 |
|------|------|
| `package.json` | 项目依赖 |
| `tsconfig.json` | TypeScript 配置 |
| `.gitignore` | Git 规则 |
| `docs/design/*.md` | 设计文档 |
| `src/**/*.ts` | 源代码 |
| `src/**/*.test.ts` | 测试代码 |

---

## 7. 模块依赖关系

```
cli.ts
  ├── nl/ (自然语言解析)
  │   ├── parser.ts
  │   ├── intent-matcher.ts
  │   └── templates/
  ├── workflow/ (工作流引擎)
  │   ├── engine.ts
  │   ├── executor.ts
  │   └── storage.ts
  ├── sandbox/ (沙盒)
  │   ├── sandbox.ts
  │   └── detector.ts
  ├── cli-tools/ (工具注册)
  │   ├── registry.ts
  │   ├── discovery/
  │   └── tools/
  ├── command-rules/ (命令规则)
  │   ├── engine.ts
  │   └── matcher.ts
  ├── security-protocol/ (安全协议)
  │   └── manager.ts
  └── utils/ (工具函数)
      ├── config.ts
      ├── logger.ts
      └── ...
```

---

## 8. 清理建议

### 8.1 可以删除的临时文件

| 文件 | 原因 |
|------|------|
| `test-cli-tools.ts` | 临时测试脚本 |
| `test-imports.ts` | 临时测试脚本 |
| `test-setup.ts` | 已整合到 vitest.config.ts |
| `test-tools-commands.ts` | 临时测试脚本 |

### 8.2 需要移动的文件

| 文件 | 当前路径 | 建议路径 | 原因 |
|------|----------|----------|------|
| `FRAMEWORK_GUIDE.md` | 根目录 | `docs/` | 文档应放在 docs 目录 |
| `README_EN.md` | 根目录 | 合并到 `README.md` | 避免分散 |

---

## 9. 文件统计

| 类型 | 数量 | 说明 |
|------|------|------|
| **源文件 (.ts)** | ~80 | 核心代码 |
| **测试文件 (.test.ts)** | ~25 | 单元测试 |
| **设计文档 (.md)** | 10 | 架构设计 |
| **配置文件** | 4 | 项目配置 |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-02
status: design_complete
```
