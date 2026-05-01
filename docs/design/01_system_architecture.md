# VectaHub 系统架构设计

> 本文档定义 VectaHub 的核心架构，定位为**本地自然语言工作流引擎**

---

## 0. 实现状态

| 模块 | 状态 | 说明 |
|------|------|------|
| **CLI 框架** | ✅ 已实现 | Commander.js + 审计日志 |
| **NL Parser** | ✅ 已实现 | 规则匹配，LLM 待集成 |
| **Workflow Engine** | ✅ 已实现 | 顺序执行，暂停/恢复待完善 |
| **Executor** | ✅ 已实现 | 基础执行，Sandbox 隔离待实现 |
| **Sandbox** | ✅ 部分实现 | 黑名单/白名单，进程隔离待实现 |
| **CLI Tools Registry** | ✅ 已实现 | Git/NPM 工具注册 |
| **意图模板** | ⚠️ 8/30 | 需要扩展到 30+ |

---

## 1. 项目定位

### 1.1 与 OpenCLI 的关系

| 维度 | OpenCLI | VectaHub |
|------|---------|----------|
| **核心能力** | 浏览器自动化 | 本地工作流自动化 |
| **交互方式** | CLI + Chrome 扩展 | 自然语言 |
| **执行环境** | 你的 Chrome (已登录) | 本地沙盒 |
| **AI Agent 集成** | `npx skills add` | Skill 驱动 |
| **适用场景** | 刷网站、爬数据、自动化网页操作 | 文件处理、脚本编排、持续集成 |

**互补关系**：
```
┌─────────────────────────────────────────────────────────┐
│                    用户需求                               │
└─────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
    ┌──────────────────┐      ┌──────────────────┐
    │     OpenCLI      │      │    VectaHub      │
    │   浏览器自动化    │  +   │   本地工作流     │
    └──────────────────┘      └──────────────────┘
```

### 1.2 核心价值主张

**一句话**：用自然语言描述你要做的事，VectaHub 自动生成、执行、并记录。

### 1.3 跨平台安全策略

| 平台 | 沙盒方案 | 是否需要 sudo | 说明 |
|------|----------|--------------|------|
| **macOS** | `sandbox-exec` | ❌ 不需要 | 苹果原生沙盒，开箱即用 |
| **Linux** | `bubblewrap` | ✅ 需要 | 强大的用户态隔离，首次配置需 sudo |
| **Windows** | WSL2 + bwrap | ✅ 需要 | 通过 WSL 实现跨平台兼容 |

**设计原则**：
- **macOS 优先**：利用系统原生能力，零配置启动
- **Linux 务实**：接受 sudo 需求，提供降级方案
- **用户友好**：首次运行自动检测并提示配置

**对比现有工具**：

| 工具 | 你要做什么 | VectaHub 做什么 |
|------|-----------|----------------|
| Taskfile | 写 YAML: `tasks: { compress: ... }` | 说"压缩图片" |
| Shell Script | 写 bash: `for f in *.jpg; do...` | 说"压缩图片" |
| Claude Code | 手动指导 AI 每一步 | 说"压缩图片" |
| OpenCLI | N/A | 说"压缩图片" |

---

## 2. 核心使用场景

### 2.1 场景 1：日常文件处理

```bash
$ vectahub "压缩 current directory 里的所有图片"

🤖 解析意图: IMAGE_COMPRESS
📋 生成工作流:
  Step 1: find . -type f \( -name "*.jpg" -o -name "*.png" \)
  Step 2: for each: convert ${item} -resize 50% ${item}
⏳ 模式: CONSENSUS

确认执行? [Y/n] y
▶️ 执行中...
✅ 完成: 12 个文件已压缩
💾 已保存到: ~/.vectahub/workflows/image-compress.yaml
```

### 2.2 场景 2：开发者工作流

```bash
$ vectahub "帮我跑 test 然后 if 通过就 deploy"

🤖 解析意图: CI_PIPELINE
📋 生成工作流:
  Step 1: npm test
  Step 2: if (exit_code == 0) then npm run deploy
⏳ 模式: STRICT (CI 场景自动严格)

▶️ 执行中...
  ▶ npm test ... ✅
  ▶ npm run deploy ... ✅
✅ 完成
```

### 2.3 场景 3：定时任务

```bash
$ vectahub "每天早上 9 点自动备份 ~/Documents 到外接硬盘"

🤖 解析意图: SCHEDULED_BACKUP
📋 生成 cron:
  0 9 * * * rsync -av ~/Documents /Volumes/Backup/
💾 已保存为定时任务: daily-doc-backup
```

---

## 3. 系统架构

### 3.1 组件图

```
┌─────────────────────────────────────────────────────────────┐
│                        VectaHub                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  NL Parser  │───▶│   Workflow  │───▶│  Executor   │   │
│  │   (意图解析) │    │   Engine    │    │   (执行器)   │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│         │                  │                  │           │
│         ▼                  ▼                  ▼           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │ Intent       │    │ Workflow    │    │ Sandbox     │   │
│  │ Templates    │    │ Storage     │    │ (macOS)     │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│                              │                              │
│                              ▼                              │
│                      ┌─────────────┐                       │
│                      │  Execution  │                       │
│                      │    Log      │                       │
│                      └─────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **NL Parser** | 将自然语言转为 Workflow | `"压缩图片"` | `Workflow` |
| **Workflow Engine** | 管理工作流生命周期 | `Workflow` | `ExecutionRecord` |
| **Executor** | 在沙盒中执行 CLI 命令 | `Step` | `StepResult` |
| **Sandbox** | 隔离执行环境 (macOS) | `CLI command` | `result + logs` |
| **Storage** | 存储工作流和执行记录 | - | - |

### 3.3 数据流

```
用户输入: "压缩图片"
    │
    ▼
┌─────────────────────────────────────────┐
│            NL Parser                     │
│  1. 匹配 Intent: IMAGE_COMPRESS         │
│  2. 提取参数: { pattern: "*.jpg" }      │
│  3. 生成 Steps: [find, convert]         │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│          Workflow Engine                 │
│  1. 构建 Workflow 对象                   │
│  2. 持久化到 ~/.vectahub/workflows/     │
│  3. 发送到 Executor                     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│            Executor                      │
│  1. 检查沙盒模式                         │
│  2. 危险命令检测                         │
│  3. 执行 CLI                            │
│  4. 记录日志                            │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│          Execution Log                   │
│  状态: COMPLETED                        │
│  输出: ["a.jpg", "b.png"]               │
│  耗时: 3.2s                             │
└─────────────────────────────────────────┘
```

---

## 4. 意图模板系统

### 4.1 内置意图

| Intent | 模式 | 描述 | 示例 |
|--------|------|------|------|
| `IMAGE_COMPRESS` | 批量 | 压缩图片 | "压缩当前目录图片" |
| `FILE_FIND` | 查询 | 查找文件 | "找出所有大于 100M 的文件" |
| `BACKUP` | 同步 | 备份文件/目录 | "备份 Documents 到外接硬盘" |
| `CI_PIPELINE` | 条件 | CI 流程 | "跑测试，通过就部署" |
| `BATCH_RENAME` | 批量 | 批量重命名 | "把所有 .jpeg 改成 .jpg" |
| `GIT_WORKFLOW` | 流程 | Git 操作 | "提交并推送" |
| `DOCKER_MANAGE` | 管理 | Docker 操作 | "停止所有容器" |
| `SHELL_EXEC` | 通用 | 执行 Shell | "运行这个命令" |

### 4.2 意图匹配规则

```javascript
const INTENT_PATTERNS = {
  IMAGE_COMPRESS: {
    keywords: ['压缩', '缩小', 'resize', 'compress'],
    weight: 0.9,
    cli: ['convert', 'sharp', 'cwebp']
  },

  FILE_FIND: {
    keywords: ['找出', '查找', 'find', 'search'],
    weight: 0.85,
    cli: ['find', 'fd', 'locate']
  },

  BACKUP: {
    keywords: ['备份', 'backup', '同步', 'sync'],
    weight: 0.9,
    cli: ['rsync', 'cp', 'tar']
  },

  CI_PIPELINE: {
    keywords: ['测试', 'test', '部署', 'deploy', '构建', 'build'],
    weight: 0.8,
    cli: ['npm', 'yarn', 'make', 'CI']
  },

  BATCH_RENAME: {
    keywords: ['重命名', 'rename', '批量改名'],
    weight: 0.9,
    cli: ['rename', 'mmv', 'git mv']
  },

  GIT_WORKFLOW: {
    keywords: ['提交', 'commit', '推送', 'push', '拉取', 'pull'],
    weight: 0.95,
    cli: ['git']
  }
};
```

### 4.3 自定义意图

用户可以添加自己的意图模板：

```yaml
# ~/.vectahub/intents/my-workflow.yaml
name: "我的备份"
pattern: "备份.*到.*"
steps:
  - type: exec
    cli: rsync
    args: ["-av", "${source}", "${target}"]
params:
  source:
    type: string
    required: true
  target:
    type: string
    required: true
```

---

## 5. 工作流引擎

### 5.1 Workflow 结构

```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  mode: 'strict' | 'relaxed' | 'consensus';
  steps: Step[];
  createdAt: Date;
  updatedAt: Date;
}

interface Step {
  id: string;
  type: 'exec' | 'for_each' | 'if' | 'parallel';
  cli?: string;
  args?: string[];
  body?: Step[];
  condition?: string;
  dependsOn?: string[];
  items?: string;      // for_each
  outputVar?: string; // 存储输出
}
```

### 5.2 执行状态机

```
PENDING ──▶ RUNNING ──▶ COMPLETED
              │   │
              │   ├──▶ PAUSED ──▶ RESUMED
              │   │
              │   └──▶ FAILED ──▶ (retry) ──▶ RUNNING
              │
              └──▶ ABORTED
```

### 5.3 执行记录

```json
{
  "executionId": "exec_001",
  "workflowId": "wf_001",
  "workflowName": "压缩图片",
  "status": "COMPLETED",
  "mode": "consensus",
  "startedAt": "2026-05-01T10:00:00Z",
  "endedAt": "2026-05-01T10:00:03Z",
  "duration": 3241,
  "steps": [
    {
      "stepId": "step_001",
      "type": "exec",
      "cli": "find",
      "args": [".", "-type", "f", "-name", "*.jpg"],
      "status": "COMPLETED",
      "startAt": "10:00:00",
      "endAt": "10:00:00",
      "output": ["a.jpg", "b.jpg", "c.jpg"]
    },
    {
      "stepId": "step_002",
      "type": "for_each",
      "items": "step_001.output",
      "body": [
        {
          "type": "exec",
          "cli": "convert",
          "args": ["${item}", "-resize", "50%", "${item}"],
          "status": "COMPLETED"
        }
      ],
      "iterations": 3,
      "status": "COMPLETED"
    }
  ],
  "warnings": [],
  "logs": []
}
```

---

## 6. 沙盒执行 (macOS)

### 6.1 macOS 沙盒方案

| 方案 | 技术 | 优点 | 缺点 |
|------|------|------|------|
| **应用沙盒** | `sandbox-exec` | 系统级隔离 | 需要签名 |
| **Seatbelt** | Apple Sandbox | 原生支持 | 仅 macOS |
| **Namespace** | `chroot` + `unshare` | Linux 兼容 | macOS 不完全支持 |

### 6.2 危险命令检测

```javascript
const DANGEROUS_PATTERNS = {
  system: [
    /^sudo\s+/,
    /^chmod\s+777/,
    /^rm\s+-rf\s+\/(?!sandbox)/,
    /^dd\s+.*of=\/dev/,
    /^mkfs/,
    /^shutdown|reboot/
  ],
  file: [
    />\s*\/etc\//,
    /^mv\s+\/\s+/,
    /^mount\s+--bind/
  ],
  network: [
    /^curl.*--data.*password/,
    /^wget.*--password/
  ]
};
```

### 6.3 三种执行模式

| 模式 | STRICT | RELAXED | CONSENSUS |
|------|--------|---------|-----------|
| **非危险命令** | 自动执行 | 自动执行 | 确认后执行 |
| **危险命令** | 报错 | 报错 | 确认后执行 |
| **超时** | 30s | 60s | 60s |
| **适用场景** | CI/CD | 开发调试 | 交互执行 |

---

## 7. 目录结构

```
vectahub/
├── src/
│   ├── index.ts              # 入口
│   ├── cli.ts                # CLI 命令行
│   ├── nl/
│   │   ├── parser.ts          # NL 解析器
│   │   ├── intent-matcher.ts # 意图匹配
│   │   └── templates/         # 意图模板
│   ├── workflow/
│   │   ├── engine.ts          # 工作流引擎
│   │   ├── executor.ts       # 执行器
│   │   ├── storage.ts        # 存储
│   │   └── types.ts          # 类型定义
│   ├── sandbox/
│   │   ├── macos.ts          # macOS 沙盒
│   │   ├── linux.ts          # Linux 沙盒
│   │   └── detector.ts       # 危险命令检测
│   └── utils/
│       ├── logger.ts
│       └── config.ts
├── workflows/                 # 用户工作流
├── intents/                   # 自定义意图
├── tests/
├── package.json
└── README.md
```

---

## 8. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| **语言** | TypeScript | 类型安全、AI Agent 友好 |
| **运行时** | Node.js 21+ | 跨平台 |
| **构建** | Vite / tsup | 快速打包 |
| **CLI** | Commander.js | 简单够用 |
| **配置** | YAML | 用户友好 |
| **存储** | 本地文件系统 | 无依赖 |

---

## 9. 与 OpenCLI 的集成点

### 9.1 互补场景

```bash
# 场景 1：先用 VectaHub 处理本地文件，再让 OpenCLI 上传
vectahub "压缩 current directory 里的图片"
opencli upload --site twitter --files ./*.jpg

# 场景 2：OpenCLI 爬数据，VectaHub 处理
opencli hackernews top --limit 10 > news.txt
vectahub "把 news.txt 里的链接提取出来"
```

### 9.2 架构互补

```
┌─────────────┐     ┌─────────────┐
│   OpenCLI   │     │  VectaHub   │
│  浏览器自动化 │ +   │  本地自动化  │
└─────────────┘     └─────────────┘
         │                 │
         └────────┬────────┘
                  ▼
         ┌─────────────┐
         │  AI Agent   │
         │ (统一调度)   │
         └─────────────┘
```

---

## 10. 实现优先级（已更新）

### Phase 1: MVP ✅ 已完成

- [x] NL Parser (规则匹配)
- [x] Workflow Engine (顺序执行)
- [x] Basic Executor (无沙盒)
- [x] CLI: `vectahub run <intent>`

### Phase 2: 核心功能 🔄 进行中

- [ ] LLM 集成 (OpenAI/Anthropic/Ollama)
- [x] For_each / If 步骤类型
- [x] 危险命令检测 (黑名单/白名单)
- [x] 执行记录 (审计日志)
- [ ] 进程隔离 (macOS sandbox-exec)
- [ ] 工作流暂停/恢复/终止

### Phase 3: 完善生态 📋 计划中

- [ ] 意图模板扩展 (30+)
- [ ] 意图模板市场
- [ ] Workflow 保存/加载
- [ ] 定时任务 (cron)
- [ ] Linux/Windows 支持
- [ ] VSCode 插件

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
status: ready_for_implementation
relatedTo:
  - docs/design/02_sandbox_design.md
  - docs/design/06_workflow_engine_design.md
```
