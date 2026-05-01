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
⚠️ 缺少模块: executor (待实现)
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
│ NL Parser   │ Agent B    │  完成    │  100%    │
│ Workflow    │ Agent C    │  开发中  │   50%    │
│ Executor    │ Agent D    │  待开始  │    0%    │
│ Sandbox     │ Agent E    │  待开始  │    0%    │
│ Storage     │ Agent F    │  待开始  │    0%    │
│ Utils       │ Agent G    │  完成    │  100%    │
└─────────────┴────────────┴─────────┴──────────┘

整体进度: 32%
下一步: 实现 Executor 模块
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

```yaml
version: 1.0.0
purpose: 开发流程标准化
scope: 项目初始化、模块开发、测试验证
```
