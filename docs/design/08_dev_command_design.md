# VectaHub 开发命令规范

> 本规范定义 `vectahub dev` 命令的功能，帮助多个 Agent 协同开发。

---

## 1. 开发命令设计

### 1.1 命令结构

```bash
vectahub dev <subcommand> [options]
```

### 1.2 子命令列表

| 子命令 | 描述 | 适用场景 |
|--------|------|----------|
| `init` | 初始化项目结构 | 首次开始开发 |
| `module` | 生成模块模板 | Agent 开始实现新模块 |
| `check` | 检查环境和依赖 | 开发前验证 |
| `test` | 运行模块测试 | 开发中验证 |
| `build` | 构建项目 | 完成开发后打包 |
| `validate` | 验证接口契约 | 确保模块间兼容 |
| `status` | 查看开发进度 | 追踪整体状态 |

---

## 2. 详细命令设计

### 2.1 `vectahub dev init`

初始化完整的项目结构。

**执行流程**:
```
1. 创建 src/ 目录结构
2. 创建 package.json
3. 初始化 TypeScript 配置
4. 创建基础测试框架
5. 生成模块接口定义文件
```

**输出结构**:
```
src/
├── cli.ts
├── nl/
│   ├── parser.ts
│   ├── intent-matcher.ts
│   └── templates/
├── workflow/
│   ├── engine.ts
│   ├── executor.ts
│   └── storage.ts
├── sandbox/
│   ├── detector.ts
│   └── sandbox.ts
├── utils/
│   ├── logger.ts
│   └── config.ts
└── types/
    └── index.ts
```

**参数**:
```bash
vectahub dev init [--yes] [--force]
```

### 2.2 `vectahub dev module <module-name>`

为指定模块生成开发模板。

**支持的模块**:
| 模块名 | 生成文件 |
|--------|----------|
| `cli` | `src/cli.ts` |
| `nl` | `src/nl/parser.ts`, `src/nl/intent-matcher.ts`, `src/nl/templates/` |
| `workflow` | `src/workflow/engine.ts` |
| `executor` | `src/workflow/executor.ts` |
| `sandbox` | `src/sandbox/detector.ts`, `src/sandbox/sandbox.ts` |
| `storage` | `src/workflow/storage.ts` |
| `utils` | `src/utils/` |

**执行流程**:
```
1. 检查模块是否已存在
2. 生成模块骨架代码（包含接口实现占位符）
3. 生成单元测试文件
4. 更新模块导出索引
```

**示例**:
```bash
vectahub dev module nl --agent "Agent B"
```

### 2.3 `vectahub dev check`

检查开发环境是否满足要求。

**检查项**:
| 检查项 | 要求 |
|--------|------|
| Node.js | >= 21.0.0 |
| TypeScript | >= 5.0.0 |
| tsup | >= 8.0.0 |
| Commander.js | >= 12.0.0 |
| 目录结构 | src/, docs/ 存在 |
| 类型定义 | types/index.ts 存在 |

**输出示例**:
```
✅ Node.js: 21.5.0 ✓
✅ TypeScript: 5.4.5 ✓
✅ tsup: 8.2.0 ✓
✅ 目录结构完整 ✓
✅ 所有模块已实现
```

### 2.4 `vectahub dev test <module-name>`

运行指定模块的单元测试。

**执行流程**:
```
1. 检查模块测试文件是否存在
2. 运行 Jest/Vitest 测试
3. 输出测试覆盖率报告
```

**示例**:
```bash
vectahub dev test nl
```

**输出示例**:
```
运行 NL Parser 模块测试...

✓ intent-matcher.test.ts
  ✓ should match IMAGE_COMPRESS intent
  ✓ should return confidence score
  ✓ should handle unknown intent

测试通过: 3/3
覆盖率: 85%
```

### 2.5 `vectahub dev validate`

验证模块接口契约是否符合规范。

**验证项**:
| 验证项 | 描述 |
|--------|------|
| 类型定义 | 是否导出正确的接口类型 |
| 方法签名 | 是否符合接口契约 |
| 参数校验 | 输入输出是否符合预期 |
| 依赖关系 | 模块间依赖是否正确 |

**输出示例**:
```
验证接口契约...

✅ NL Parser: 接口符合规范
✅ Workflow Engine: 接口符合规范
⚠️ Executor: 缺少 timeout 参数处理
✅ Sandbox: 接口符合规范
```

### 2.6 `vectahub dev status`

查看项目开发进度。

**输出示例**:
```
VectaHub 开发进度

┌─────────────┬────────────┬─────────┬──────────┐
│    模块      │    Agent   │  状态   │  进度    │
├─────────────┼────────────┼─────────┼──────────┤
│ CLI         │ Agent A    │  开发中  │   75%    │
│ NL Parser   │ Agent B    │  开发中  │   60%    │
│ Workflow    │ Agent C    │  完成    │  100%    │
│ Executor    │ Agent D    │  完成    │  100%    │
│ Sandbox     │ Agent E    │  完成    │  100%    │
│ Storage     │ Agent F    │  完成    │  100%    │
│ Utils       │ Agent G    │  完成    │  100%    │
└─────────────┴────────────┴─────────┴──────────┘

整体进度: 100%
下一步: 无
```

---

## 3. 开发工作流

### 3.1 Agent 开发流程

```
Agent 开始开发
    │
    ▼
1. vectahub dev check        # 检查环境
    │
    ▼
2. vectahub dev module <name> # 生成模板
    │
    ▼
3. 实现模块代码
    │
    ▼
4. vectahub dev test <name>  # 运行测试
    │
    ▼
5. vectahub dev validate     # 验证接口
    │
    ▼
6. 提交代码
```

### 3.2 协调整个项目

```
项目负责人:
    │
    ▼
1. vectahub dev init         # 初始化项目
    │
    ▼
2. 分配模块给各个 Agent
    │
    ▼
3. vectahub dev status       # 监控进度
    │
    ▼
4. vectahub dev validate     # 验证集成
    │
    ▼
5. vectahub dev build        # 构建发布
```

---

## 4. 配置文件

### 4.1 `vectahub-dev.config.yaml`

```yaml
# 开发配置
modules:
  - name: cli
    agent: Agent A
    status: in_progress
    progress: 75
    dependencies: []
  
  - name: nl
    agent: Agent B
    status: completed
    progress: 100
    dependencies: []
  
  - name: workflow
    agent: Agent C
    status: in_progress
    progress: 50
    dependencies: [nl]
  
  - name: executor
    agent: Agent D
    status: pending
    progress: 0
    dependencies: [workflow, sandbox]
  
  - name: sandbox
    agent: Agent E
    status: pending
    progress: 0
    dependencies: []
  
  - name: storage
    agent: Agent F
    status: pending
    progress: 0
    dependencies: [workflow]
  
  - name: utils
    agent: Agent G
    status: completed
    progress: 100
    dependencies: []

# 测试配置
test:
  coverage:
    threshold: 80
    exclude: ["**/templates/**"]

# 构建配置
build:
  entry: src/cli.ts
  outDir: dist
  format: ["esm", "cjs"]
```

---

## 5. 输出格式规范

### 5.1 JSON 输出模式

```bash
vectahub dev status --json
```

**输出**:
```json
{
  "project": "VectaHub",
  "version": "2.1.0",
  "status": "in_development",
  "overallProgress": 32,
  "modules": [
    {
      "name": "cli",
      "agent": "Agent A",
      "status": "in_progress",
      "progress": 75,
      "dependencies": []
    }
  ]
}
```

### 5.2 进度状态枚举

| 状态 | 描述 |
|------|------|
| `pending` | 待开始 |
| `in_progress` | 开发中 |
| `completed` | 完成 |
| `blocked` | 阻塞 |
| `review` | 审核中 |

---

## 6. 错误处理

### 6.1 错误码

| 错误码 | 描述 | 示例 |
|--------|------|------|
| DEV001 | 环境检查失败 | Node.js 版本过低 |
| DEV002 | 模块不存在 | 尝试生成不存在的模块 |
| DEV003 | 测试失败 | 单元测试未通过 |
| DEV004 | 接口不兼容 | 方法签名不符合规范 |
| DEV005 | 构建失败 | TypeScript 编译错误 |

---

## 7. 使用示例

### 7.1 完整开发流程

```bash
# 1. 初始化项目
vectahub dev init --yes

# 2. Agent B 开始开发 NL Parser
vectahub dev module nl --agent "Agent B"

# 3. 编写代码后运行测试
vectahub dev test nl

# 4. 验证接口
vectahub dev validate

# 5. 查看整体进度
vectahub dev status
```

### 7.2 CI/CD 集成

```bash
# 在 CI 中运行
vectahub dev check && \
vectahub dev test --all && \
vectahub dev validate && \
vectahub dev build
```

---

## 6. 功能清单

### 6.1 核心功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **项目初始化** | 初始化 VectaHub 项目结构 | ✅ 已实现 | P0 |
| **依赖安装** | 自动安装项目依赖 | ✅ 已实现 | P0 |
| **配置生成** | 生成默认配置文件 | ✅ 已实现 | P0 |
| **模板生成** | 生成工作流模板文件 | ✅ 已实现 | P0 |

### 6.2 开发辅助

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **模块创建** | 快速创建新模块脚手架 | 🔲 待实现 | P1 |
| **模板生成** | 生成测试文件模板 | 🔲 待实现 | P1 |
| **接口验证** | 验证模块接口契约 | 🔲 待实现 | P0 |
| **类型检查** | TypeScript 类型验证 | ✅ 已实现 | P0 |

### 6.3 测试功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **单元测试** | 运行模块单元测试 | ✅ 已实现 | P0 |
| **集成测试** | 运行端到端测试 | 🔲 待实现 | P1 |
| **覆盖率检查** | 检查测试覆盖率 | ✅ 已实现 | P0 |
| **性能测试** | 运行性能基准测试 | 🔲 待实现 | P2 |

### 6.4 构建功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **TS 编译** | TypeScript 编译为 JS | ✅ 已实现 | P0 |
| **代码打包** | 打包为可执行文件 | 🔲 待实现 | P1 |
| **依赖优化** | 优化依赖体积 | 🔲 待实现 | P2 |
| **源映射** | 生成 Source Map | 🔲 待实现 | P1 |

### 6.5 CI/CD 集成

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **CI 检查** | CI 环境自动检查 | ✅ 已实现 | P0 |
| **自动测试** | CI 自动运行测试 | ✅ 已实现 | P0 |
| **构建验证** | 验证构建产物 | 🔲 待实现 | P1 |
| **发布准备** | 生成发布包 | 🔲 待实现 | P2 |

---

## 7. 业务架构

### 7.1 开发流程

```
创建任务 → 初始化模块 → 编写代码 → 运行测试 → 验证接口 → 构建打包 → 提交代码
```

### 7.2 业务组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **ProjectInit** | 项目初始化 | 项目名称 | 项目结构 |
| **ModuleCreator** | 模块创建器 | 模块名称 | 模块文件 |
| **TestRunner** | 测试运行器 | 测试配置 | 测试结果 |
| **TypeChecker** | 类型检查器 | TS 代码 | 类型报告 |
| **Builder** | 构建工具 | 源代码 | 编译产物 |
| **Validator** | 接口验证器 | 模块接口 | 验证报告 |

### 7.3 业务规则

1. **模块隔离**：每个模块独立开发和测试
2. **接口契约**：模块必须遵循定义的接口
3. **测试覆盖**：核心模块覆盖率 >= 80%
4. **类型安全**：所有代码必须通过类型检查
5. **提交检查**：提交前必须通过所有检查

---

## 8. 技术架构

### 8.1 技术选型

| 分类 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **CLI 框架** | Commander.js | 12.x | 命令行解析 |
| **构建工具** | tsup | 8.x | TypeScript 打包 |
| **测试框架** | Vitest | 1.x | 单元测试 |
| **类型检查** | tsc | 5.x | TypeScript 编译器 |
| **代码检查** | ESLint | 8.x | 代码规范检查 |

### 8.2 模块结构

```
src/commands/dev/
├── init.ts                   # 项目初始化
├── create.ts                 # 模块创建
├── test.ts                   # 测试运行
├── build.ts                  # 构建打包
├── validate.ts               # 接口验证
├── status.ts                 # 状态查询
└── utils/                    # 工具函数
    ├── project.ts            # 项目工具
    └── templates.ts          # 模板生成
```

### 8.3 数据流

```
用户命令 → dev/init.ts → 项目结构 → dev/test.ts → 测试结果 → dev/build.ts → 编译产物
```

### 8.4 关键接口

| 接口 | 方法 | 描述 |
|------|------|------|
| **ProjectInit** | `init(name)` | 初始化项目 |
| **ModuleCreator** | `create(name, type)` | 创建模块 |
| **TestRunner** | `run(module)` | 运行测试 |
| **TypeChecker** | `check(files)` | 类型检查 |
| **Builder** | `build(config)` | 构建项目 |
| **Validator** | `validate(module)` | 接口验证 |

---

```yaml
version: 1.0.0
purpose: 开发流程标准化
scope: 项目初始化、模块开发、测试验证
```
