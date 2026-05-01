# VectaHub 项目规则汇总

> 本文件整合了 VectaHub 项目的所有 AI 协作规则、技能和命令定义。

---

## 1. 项目概述

**VectaHub** 是一个自然语言驱动的工作流引擎，定位为 **OpenCLI 的本地自动化互补方案**。

| 维度 | OpenCLI | VectaHub |
|------|---------|----------|
| **核心能力** | 浏览器自动化 | 本地工作流自动化 |
| **交互方式** | CLI + Chrome 扩展 | 自然语言 |
| **执行环境** | 你的 Chrome (已登录) | 本地沙盒 |
| **适用场景** | 刷网站、爬数据、自动化网页操作 | 文件处理、脚本编排、CI/CD |

### 1.1 核心价值主张

**一句话**：用自然语言描述你要做的事，VectaHub 自动生成、执行、并记录。

| 工具 | 你要做什么 | VectaHub 做什么 |
|------|-----------|----------------|
| Taskfile | 写 YAML: `tasks: { compress: ... }` | 说"压缩图片" |
| Shell Script | 写 bash: `for f in *.jpg; do...` | 说"压缩图片" |
| Claude Code | 手动指导 AI 每一步 | 说"压缩图片" |

### 1.2 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 21+
- **构建**: tsup
- **CLI**: Commander.js
- **配置**: YAML

### 1.3 目录结构

```
VectaHub/
├── docs/design/              # 设计文档
├── src/
│   ├── cli.ts               # CLI 入口
│   ├── nl/                  # 自然语言解析
│   │   ├── parser.ts
│   │   ├── intent-matcher.ts
│   │   └── templates/
│   ├── workflow/            # 工作流引擎
│   │   ├── engine.ts
│   │   ├── executor.ts
│   │   └── storage.ts
│   └── sandbox/             # 沙盒隔离
│       └── detector.ts
├── workflows/               # 用户工作流
└── intents/                 # 自定义意图
```

---

## 2. 核心工作流

### 2.1 用户输入 → 执行

```
用户: "压缩当前目录的图片"
    │
    ▼
┌─────────────────────────────┐
│       NL Parser              │
│  • 匹配意图: IMAGE_COMPRESS  │
│  • 提取参数: { pattern: * } │
│  • 生成 Steps               │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│     Workflow Engine          │
│  • 顺序执行 Steps           │
│  • 支持 for_each / if       │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│       Executor               │
│  • 危险命令检测              │
│  • 沙盒模式 (STRICT/RELAXED/│
│    CONSENSUS)               │
└─────────────────────────────┘
    │
    ▼
执行记录 → 保存到 ~/.vectahub/
```

---

## 3. 意图模板系统

### 3.1 内置意图

| Intent | 描述 | 示例 |
|--------|------|------|
| `IMAGE_COMPRESS` | 压缩图片 | "压缩当前目录图片" |
| `FILE_FIND` | 查找文件 | "找出所有大于 100M 的文件" |
| `BACKUP` | 备份文件/目录 | "备份 Documents 到外接硬盘" |
| `CI_PIPELINE` | CI 流程 | "跑测试，通过就部署" |
| `BATCH_RENAME` | 批量重命名 | "把所有 .jpeg 改成 .jpg" |
| `GIT_WORKFLOW` | Git 操作 | "提交并推送" |

### 3.2 意图匹配规则

```javascript
const INTENT_PATTERNS = {
  IMAGE_COMPRESS: {
    keywords: ['压缩', '缩小', 'resize', 'compress', '图片'],
    weight: 0.9,
    cli: ['convert', 'sharp', 'cwebp']
  },
  GIT_WORKFLOW: {
    keywords: ['提交', 'commit', '推送', 'push', 'git'],
    weight: 0.95,
    cli: ['git']
  }
};
```

---

## 4. 沙盒架构

### 4.1 三种执行模式

| 模式 | 非危险命令 | 危险命令 | 适用场景 |
|------|-----------|----------|----------|
| **STRICT** | 自动执行 | 报错 | CI/CD |
| **RELAXED** | 自动执行 | 报错 | 开发调试 |
| **CONSENSUS** | 确认后执行 | 确认后执行 | 交互执行 |

### 4.2 危险命令检测

```javascript
const DANGEROUS_PATTERNS = {
  critical: [
    /^sudo\s+/,                          // 提权
    /^chmod\s+777/,                      // 全局权限
    /^rm\s+-rf\s+\/(?!sandbox)/,         // 递归删除根目录
  ],
  high: [
    />\s*\/etc\//,                       // 覆写系统文件
    /^mount\s+--bind/,                   // 绑定挂载
  ]
};
```

---

## 5. 工作流类型

### 5.1 Step 类型

| 类型 | 描述 |
|------|------|
| `exec` | 执行单个 CLI 命令 |
| `for_each` | 遍历列表，为每个元素执行 body |
| `if` | 条件执行 |
| `parallel` | 并行执行 |

### 5.2 Workflow 结构

```typescript
interface Workflow {
  id: string;
  name: string;
  mode: 'strict' | 'relaxed' | 'consensus';
  steps: Step[];
  createdAt: Date;
}

interface Step {
  id: string;
  type: 'exec' | 'for_each' | 'if' | 'parallel';
  cli?: string;
  args?: string[];
  body?: Step[];
  condition?: string;
  items?: string;      // for_each
  outputVar?: string; // 存储输出
}
```

---

## 6. 执行记录

### 6.1 执行状态

| 状态 | 描述 |
|------|------|
| `PENDING` | 等待执行 |
| `RUNNING` | 执行中 |
| `PAUSED` | 暂停 |
| `COMPLETED` | 完成 |
| `FAILED` | 失败 |

### 6.2 记录结构

```json
{
  "executionId": "exec_001",
  "workflowId": "wf_001",
  "status": "COMPLETED",
  "startedAt": "2026-05-01T10:00:00Z",
  "endedAt": "2026-05-01T10:00:03Z",
  "duration": 3241,
  "steps": [
    {
      "stepId": "step_001",
      "status": "COMPLETED",
      "output": ["a.jpg", "b.jpg"]
    }
  ]
}
```

---

## 7. VectaHub CLI 命令

```bash
# 工作流
vectahub run <intent>           # 自然语言运行
vectahub run -f <workflow.yaml>  # 文件运行
vectahub save <name>             # 保存工作流
vectahub list                    # 列出工作流
vectahub history                 # 查看历史

# 执行控制
vectahub pause                   # 暂停
vectahub resume                  # 继续
vectahub abort                   # 终止
vectahub status                  # 查看状态

# 沙盒控制
vectahub mode                    # 查看当前模式
vectahub mode strict/relaxed/consensus

# 状态
vectahub doctor                  # 诊断
vectahub version                 # 版本
```

---

## 8. 设计文档索引

| 文档 | 内容 |
|------|------|
| [01_system_architecture.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/01_system_architecture.md) | 系统架构总览 |
| [02_sandbox_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/02_sandbox_design.md) | 沙盒架构设计 |
| [03_ai_cli_framework_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/03_ai_cli_framework_design.md) | AI Agent CLI 适配器框架 |
| [04_nl_parser_skill_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/04_nl_parser_skill_design.md) | 自然语言解析 Skill 设计 |
| [05_vscode_plugin_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/05_vscode_plugin_design.md) | VSCode 插件设计 |
| [06_workflow_engine_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/06_workflow_engine_design.md) | 自然语言工作流引擎详细设计 |
| [07_module_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/07_module_design.md) | 模块化开发规范 |

---

## 9. 模块化开发

### 9.1 模块分配

| 模块 | Agent | 文件路径 |
|------|-------|----------|
| **CLI** | Agent A | `src/cli.ts` |
| **NL Parser** | Agent B | `src/nl/parser.ts`, `src/nl/intent-matcher.ts`, `src/nl/templates/` |
| **Workflow Engine** | Agent C | `src/workflow/engine.ts` |
| **Executor** | Agent D | `src/workflow/executor.ts` |
| **Sandbox** | Agent E | `src/sandbox/detector.ts`, `src/sandbox/sandbox.ts` |
| **Storage** | Agent F | `src/workflow/storage.ts` |
| **Utils** | Agent G | `src/utils/` |

### 9.2 模块接口契约

所有模块必须遵循 [07_module_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/07_module_design.md) 中定义的接口规范。

---

## 10. 实现优先级

### Phase 1: MVP

- [ ] NL Parser (规则匹配)
- [ ] Workflow Engine (顺序执行)
- [ ] Basic Executor
- [ ] CLI: `vectahub run <intent>`

### Phase 2: 核心功能

- [ ] for_each / if 步骤
- [ ] macOS Sandbox
- [ ] 危险命令检测
- [ ] 执行记录

### Phase 3: 完善

- [ ] 意图模板市场
- [ ] Workflow 保存/加载
- [ ] 定时任务
- [ ] Linux/Windows 支持

---

```yaml
version: 2.1.0
lastUpdated: 2026-05-01
project: VectaHub
framework: NL Workflow Engine + Modular Architecture
reference: OpenCLI (互补)
status: modular_design_complete_ready_for_development
```
