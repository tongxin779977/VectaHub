***

name: "vectahub"
description: "为指定模块生成开发模板"
--------------------------

***

# VectaHub 开发命令规范

> 本规范定义 `vectahub dev` 命令的功能，帮助多个 Agent 协同开发。
> **所有模块开发必须与 docs/design/ 下的设计文档严格对齐**。

***

## 0. 模块与文档映射

> 每个模块的研发任务、功能清单、架构设计都必须基于对应的设计文档。

### 0.1 模块文档映射表

| 模块名        | Agent   | 对应设计文档       | 文档路径                                                                                            |
| ---------- | ------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `cli`      | Agent A | CLI 入口设计     | [06\_workflow\_engine\_design.md](../../docs/design/06_workflow_engine_design.md#12-cli-入口)     |
| `nl`       | Agent B | NL Parser 设计 | [04\_nl\_parser\_skill\_design.md](../../docs/design/04_nl_parser_skill_design.md)              |
| `workflow` | Agent C | 工作流引擎设计      | [06\_workflow\_engine\_design.md](../../docs/design/06_workflow_engine_design.md)               |
| `executor` | Agent D | 执行器设计        | [06\_workflow\_engine\_design.md](../../docs/design/06_workflow_engine_design.md#7-executor-实现) |
| `sandbox`  | Agent E | 沙盒架构设计       | [02\_sandbox\_design.md](../../docs/design/02_sandbox_design.md)                                |
| `storage`  | Agent F | 存储设计         | [06\_workflow\_engine\_design.md](../../docs/design/06_workflow_engine_design.md#8-存储)          |
| `utils`    | Agent G | 工具函数设计       | [07\_module\_design.md](../../docs/design/07_module_design.md#11-技术架构)                          |

### 0.2 模块开发文档依赖

```
模块开发
    │
    ▼
1. 阅读对应设计文档
    │
    ▼
2. 提取功能清单（第 X 节：功能清单）
    │
    ├── 核心功能（P0）
    ├── 高级功能（P1-P2）
    └── 扩展功能（P3）
    │
    ▼
3. 提取架构信息
    │
    ├── 业务架构（业务流程、组件、规则）
    └── 技术架构（技术选型、模块结构、数据流、接口）
    │
    ▼
4. 生成研发任务
    │
    ▼
5. 按优先级实现功能
    │
    ▼
6. 验证实现与文档一致性
```

### 0.3 功能清单提取规则

每个模块的设计文档包含以下标准章节：

| 章节       | 内容                 | 用途          |
| -------- | ------------------ | ----------- |
| **功能清单** | 表格列出所有功能、状态、优先级    | 生成研发任务列表    |
| **业务架构** | 业务流程、组件表、业务规则      | 指导业务逻辑实现    |
| **技术架构** | 技术选型、模块结构、数据流、关键接口 | 指导代码结构和接口设计 |

**状态标识**：

- ✅ 已实现：功能已完成
- 🔲 待实现：功能尚未开始
- ⚠️ 部分实现：功能部分完成

**优先级**：

- P0：核心功能，必须优先实现
- P1：重要功能，第二阶段实现
- P2：增强功能，第三阶段实现
- P3：扩展功能，可选实现

***

## 1. 开发命令设计

### 1.1 命令结构

```bash
vectahub dev <subcommand> [options]
```

### 1.2 子命令列表

| 子命令        | 描述      | 适用场景          |
| ---------- | ------- | ------------- |
| `init`     | 初始化项目结构 | 首次开始开发        |
| `module`   | 生成模块模板  | Agent 开始实现新模块 |
| `check`    | 检查环境和依赖 | 开发前验证         |
| `test`     | 运行模块测试  | 开发中验证         |
| `build`    | 构建项目    | 完成开发后打包       |
| `validate` | 验证接口契约  | 确保模块间兼容       |
| `status`   | 查看开发进度  | 追踪整体状态        |

***

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

**重要**：生成模板前，必须先读取对应的设计文档，确保：
1. 功能清单与设计文档对齐
2. 模块结构与技术架构一致
3. 接口定义符合文档规范
4. 研发任务按优先级排列

**支持的模块及对应文档**：

| 模块名 | 设计文档 | 生成文件 | 核心功能（P0） |
|--------|----------|----------|----------------|
| `cli` | [06_workflow_engine_design.md](../../docs/design/06_workflow_engine_design.md#12-cli-入口) | `src/cli.ts` | run/list/mode/status/history 命令 |
| `nl` | [04_nl_parser_skill_design.md](../../docs/design/04_nl_parser_skill_design.md) | `src/nl/parser.ts`, `src/nl/intent-matcher.ts`, `src/nl/templates/` | 规则匹配、意图识别、参数提取、实体提取、命令合成 |
| `workflow` | [06_workflow_engine_design.md](../../docs/design/06_workflow_engine_design.md) | `src/workflow/engine.ts` | 顺序执行、for_each、if、parallel、状态机 |
| `executor` | [06_workflow_engine_design.md](../../docs/design/06_workflow_engine_design.md#7-executor-实现) | `src/workflow/executor.ts` | CLI 执行、危险检测、超时控制 |
| `sandbox` | [02_sandbox_design.md](../../docs/design/02_sandbox_design.md) | `src/sandbox/detector.ts`, `src/sandbox/sandbox.ts` | 平台检测、黑白名单、三种模式 |
| `storage` | [06_workflow_engine_design.md](../../docs/design/06_workflow_engine_design.md#8-存储) | `src/workflow/storage.ts` | 工作流 CRUD、执行记录 |
| `utils` | [07_module_design.md](../../docs/design/07_module_design.md#11-技术架构) | `src/utils/` | 日志、配置、安全检测 |

**执行流程**：

```
1. 读取模块对应的设计文档
   ↓
2. 从文档提取功能清单（第 X 节）
   ↓
3. 从文档提取架构信息
   ↓
4. 检查模块是否已存在
   ↓
5. 生成模块骨架代码（包含接口实现占位符）
   ↓
6. 生成单元测试文件
   ↓
7. 生成研发任务清单（按优先级排序）
   ↓
8. 更新模块导出索引
   ↓
9. 输出开发指南（引用文档章节）
```

**示例**:

```bash
# Agent B 开始开发 NL Parser
vectahub dev module nl --agent "Agent B"
```

**输出示例**：

```
正在为 NL Parser 模块生成开发模板...

📖 读取设计文档: docs/design/04_nl_parser_skill_design.md

✅ 提取功能清单:
  P0 核心功能:
    - [✅] 规则匹配
    - [✅] 意图识别
    - [✅] 参数提取
    - [✅] 实体提取
    - [🔲] LLM 集成
  P1 高级功能:
    - [🔲] 上下文理解
    - [🔲] 参数补全
  P2 扩展功能:
    - [🔲] 同义词识别
    - [🔲] 命令验证

📐 提取架构信息:
  - 业务架构: 11.1-11.3
  - 技术架构: 12.1-12.4
  - 模块结构: src/nl/
  - 数据流: parser.ts → intent-matcher.ts → workflow-generator.ts

📝 生成文件:
  ✓ src/nl/parser.ts
  ✓ src/nl/intent-matcher.ts
  ✓ src/nl/entity-extractor.ts
  ✓ src/nl/command-synthesizer.ts
  ✓ src/nl/templates/index.ts
  ✓ src/nl/index.ts
  ✓ src/nl/parser.test.ts

📋 研发任务清单:
  [P0] 实现 LLM 集成 (src/nl/llm.ts)
  [P1] 添加上下文理解支持
  [P2] 实现同义词识别

📖 开发指南:
  - 功能清单: 04_nl_parser_skill_design.md#10-功能清单
  - 业务架构: 04_nl_parser_skill_design.md#11-业务架构
  - 技术架构: 04_nl_parser_skill_design.md#12-技术架构

模块模板生成完成！请按照研发任务清单按优先级实现。
```

### 2.3 `vectahub dev check`

检查开发环境是否满足要求。

**检查项**:

| 检查项          | 要求                |
| ------------ | ----------------- |
| Node.js      | >= 21.0.0         |
| TypeScript   | >= 5.0.0          |
| tsup         | >= 8.0.0          |
| Commander.js | >= 12.0.0         |
| 目录结构         | src/, docs/ 存在    |
| 类型定义         | types/index.ts 存在 |

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

| 验证项  | 描述          |
| ---- | ----------- |
| 类型定义 | 是否导出正确的接口类型 |
| 方法签名 | 是否符合接口契约    |
| 参数校验 | 输入输出是否符合预期  |
| 依赖关系 | 模块间依赖是否正确   |

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

***

## 3. 开发工作流

### 3.1 Agent 开发流程（基于文档驱动）

```
Agent 开始开发
    │
    ▼
1. vectahub dev check                          # 检查环境
    │
    ▼
2. 阅读模块对应的设计文档
   docs/design/<模块>_design.md
    │
    ├── 阅读「功能清单」章节
    ├── 阅读「业务架构」章节
    └── 阅读「技术架构」章节
    │
    ▼
3. vectahub dev module <name>                  # 生成模板（自动对齐文档）
    │
    ├── 自动提取功能清单
    ├── 自动提取架构信息
    └── 生成研发任务清单
    │
    ▼
4. 按优先级实现模块代码
   [P0] 核心功能 → [P1] 高级功能 → [P2] 扩展功能
    │
    ▼
5. vectahub dev test <name>                    # 运行测试
    │
    ▼
6. vectahub dev validate                       # 验证接口
    │
    ├── 验证接口定义是否符合文档
    ├── 验证模块结构是否符合文档
    └── 验证功能实现是否与功能清单对齐
    │
    ▼
7. 更新功能状态
   在 vectahub-dev.config.yaml 中更新模块进度
    │
    ▼
8. 提交代码
```

### 3.2 协调整个项目（基于文档驱动）

```
项目负责人:
    │
    ▼
1. vectahub dev init                           # 初始化项目
    │
    ▼
2. 查看设计文档总览
   docs/design/README.md
    │
    ▼
3. 分配模块给各个 Agent
   根据 07_module_design.md 的模块划分
    │
    ▼
4. 每个 Agent 执行:
   vectahub dev module <name> --agent "Agent X"
    │
    ├── 自动读取对应设计文档
    ├── 提取功能清单和架构信息
    └── 生成研发任务清单
    │
    ▼
5. vectahub dev status                         # 监控进度
    │
    ├── 显示各模块功能完成度
    ├── 显示 P0/P1/P2 功能实现状态
    └── 显示与文档的对齐状态
    │
    ▼
6. vectahub dev validate                       # 验证集成
    │
    ├── 验证模块接口是否符合文档定义
    └── 验证模块协作是否符合文档流程
    │
    ▼
7. vectahub dev build                          # 构建发布
```

### 3.3 研发任务与文档对齐机制

#### 3.3.1 任务生成规则

```yaml
# 从设计文档生成研发任务的规则
task_generation:
  # 1. 从功能清单章节提取功能
  source:
    section: "功能清单"  # 每个文档的第 X 节
    fields:
      - 功能名称
      - 描述
      - 状态（✅/🔲/⚠️）
      - 优先级（P0/P1/P2/P3）
  
  # 2. 过滤待实现功能
  filter:
    status: ["🔲", "⚠️"]
  
  # 3. 按优先级排序
  sort:
    - 优先级升序（P0 → P3）
    - 同优先级按文档顺序
  
  # 4. 生成任务
  output:
    format: "[优先级] 功能描述 (文件路径)"
    example: "[P0] 实现 LLM 集成 (src/nl/llm.ts)"
```

#### 3.3.2 任务验证规则

```yaml
# 验证实现是否与文档对齐
task_validation:
  # 1. 验证功能实现
  feature_check:
    source: "设计文档 - 功能清单"
    check:
      - 功能是否已实现（代码存在）
      - 测试是否通过
      - 接口是否符合文档定义
  
  # 2. 验证架构一致性
  architecture_check:
    source: "设计文档 - 技术架构"
    check:
      - 模块结构是否一致
      - 文件命名是否一致
      - 导出接口是否一致
  
  # 3. 验证业务规则
  business_rules_check:
    source: "设计文档 - 业务架构"
    check:
      - 业务流程是否遵循文档定义
      - 业务规则是否实现
      - 组件交互是否正确
```

#### 3.3.3 进度追踪

```yaml
# 进度追踪基于功能清单
progress_tracking:
  # 模块进度 = 已实现功能数 / 总功能数
  module_progress: "completed_features / total_features * 100%"
  
  # 按优先级追踪
  priority_progress:
    P0: "P0_completed / P0_total"
    P1: "P1_completed / P1_total"
    P2: "P2_completed / P2_total"
    P3: "P3_completed / P3_total"
  
  # 文档对齐状态
  doc_alignment:
    status: ["aligned", "partial", "misaligned"]
    check_frequency: "每次 validate 命令"
```

#### 3.3.4 冲突解决

```yaml
# 当实现与文档不一致时的处理
conflict_resolution:
  # 1. 检测冲突
  detection:
    - 功能实现但文档标记为待实现
    - 功能未实现但文档标记为已实现
    - 接口定义与文档不一致
    - 模块结构与文档不一致
  
  # 2. 解决策略
  resolution:
    # 策略 A: 更新文档（实现优先）
    - type: "update_doc"
      condition: "实现正确，文档过时"
      action: "更新设计文档功能状态"
    
    # 策略 B: 修改实现（文档优先）
    - type: "update_implementation"
      condition: "文档正确，实现有误"
      action: "修改实现以符合文档"
    
    # 策略 C: 手动确认
    - type: "manual_confirm"
      condition: "不确定哪个正确"
      action: "提示用户确认"
```

***

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

***

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

| 状态            | 描述  |
| ------------- | --- |
| `pending`     | 待开始 |
| `in_progress` | 开发中 |
| `completed`   | 完成  |
| `blocked`     | 阻塞  |
| `review`      | 审核中 |

***

## 6. 错误处理

### 6.1 错误码

| 错误码    | 描述     | 示例              |
| ------ | ------ | --------------- |
| DEV001 | 环境检查失败 | Node.js 版本过低    |
| DEV002 | 模块不存在  | 尝试生成不存在的模块      |
| DEV003 | 测试失败   | 单元测试未通过         |
| DEV004 | 接口不兼容  | 方法签名不符合规范       |
| DEV005 | 构建失败   | TypeScript 编译错误 |

***

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

***

```yaml
version: 1.0.0
purpose: 开发流程标准化
scope: 项目初始化、模块开发、测试验证
```

