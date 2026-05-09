# 可行性分析报告：文档驱动自动开发任务执行

```yaml
document: feasibility-report
version: 1.0.0
date: 2026-05-10
status: draft
participants:
  - role: backend-architect
    focus: CLI工具注册、工作流引擎、缓存机制、安全规则
  - role: frontend-architect
    focus: VS Code插件UI、TreeView设计、交互模式、命令注册
  - role: ai-integration-engineer
    focus: LLM调用策略、Prompt设计、缓存处理、降级机制
```

## 1. 概述

### 1.1 目标

用户指定任意开发文档 → LLM 解析出结构化任务列表 → 选择 agent CLI（如 Aider、Claude Code）→ 逐条自动执行开发任务。

VectaHub 定位为**编排层**，不实际写代码，只负责"读文档 → 拆任务 → 调度执行"。

### 1.2 核心流程

```
用户选择文档文件
    ↓
CLI 后端调 LLM 解析 → 返回任务列表 [{id, label}]
    ↓
插件面板展示任务列表
    ↓
用户选择 agent CLI 执行器
    ↓
逐条执行：拼命令（文档路径+任务编号+默认提示词）→ 调 agent CLI
```

---

## 2. 三方讨论结论

### 2.1 后端架构师视角

**核心观点**：现有架构完全支撑，改动集中在 4 个新模块。

| 维度 | 结论 |
|------|------|
| CLI Tool Registry | 扩展 `CliTool` 接口，新增 `capabilities` 和 `isAgentCLI` 字段，改动 `types.ts` 一个文件 |
| 工作流引擎 | **无需改动核心引擎**，现有 `for_each` + `exec` 已能满足逐条执行场景 |
| 缓存机制 | 新建 `ToolCacheManager`，路径 `.vectahub/cache/{tool}@{version}.help`，复用 `getVectaHubPath()` |
| 安全规则 | 复用现有 `CommandRuleEngine`，新增 agent CLI 的 prompt 注入防护规则 |

**需新建模块**：
1. `ToolCacheManager` — 工具缓存管理器（懒发现 + help 输出缓存）
2. `AgentCLIAdapter` — agent CLI 统一调用适配器
3. `TaskParser` — 文档任务解析器（LLM 解析）
4. `AgentCLIHandler` — 工作流步骤处理器（可选，直接用 exec 也行）

**可复用组件**：
- `ToolService` / `ToolChain` — 工具执行
- `WorkflowEngine` / `Executor` — 工作流编排
- `CommandRuleEngine` / `Detector` — 安全检查
- `LLMClient` — LLM 调用

### 2.2 前端架构师视角

**核心观点**：在现有 TasksView 中新增一个分区，改动量极小。

| 维度 | 结论 |
|------|------|
| 面板位置 | 在现有 `tasksView.ts` 的 `getChildren` 中新增 `addDocTaskSection`，不新建面板 |
| 节点设计 | 复用 `CategoryTreeItem` + `TaskTreeItem`，树结构：选择文档 → 解析 → 任务列表 |
| 执行器选择 | `QuickPick` 对话框，展示已缓存的 agent CLI 列表 |
| 进度展示 | 复用现有 `OutputChannel` + `vscode.window.withProgress` 模式 |
| 命令注册 | 新增 4 个命令（selectDocFile、parseDocTasks、runDocTask、selectAgentCli） |

**改动量评估**：
- 修改文件：3-4 个（tasksView.ts、extension.ts、package.json + 1 个新命令文件）
- 新增代码：约 150-200 行

### 2.3 AI 集成工程师视角

**核心观点**：LLM 调用次数可以压到最少，复用现有适配器即可。

| 维度 | 结论 |
|------|------|
| 文档解析 | 1 次 LLM 调用，大文档分段处理 |
| CLI 发现 | 0 次 LLM 调用，只缓存原始 help 输出 |
| 任务调度 | 1 次 LLM 调用（生成执行命令），可批量处理 |
| 总 LLM 调用 | 最小 1 次，最多 2 次 |
| 降级策略 | LLM 调用失败 → 正则 fallback 解析（参考 keyword-fallback 模式） |
| Prompt 管理 | 在 `PromptManager` 中新增 2 个 prompt 模板（文档解析 + 命令生成） |

---

## 3. 技术方案

### 3.1 CLI 工具自动发现（方案 C）

**机制**：懒发现 + 缓存原始输出，不做版本比对。

```
用户选择某个 CLI 工具
    ↓
检查 .vectahub/cache/{tool}.help 是否存在
    ↓ 存在 → 直接读缓存
    ↓ 不存在 → 执行 xxx --help → 存缓存
LLM 读缓存理解工具用法 + 识别 capabilities
```

**缓存文件结构**：
```json
{
  "toolName": "aider",
  "version": "0.80.0",
  "helpOutput": "原始 --help 输出...",
  "capabilities": ["codegen", "refactor"],
  "discoveredAt": "2026-05-10T00:00:00Z"
}
```

**capabilities 推断**：由 LLM 读 help 输出时一并识别，不人工维护。

### 3.2 文档任务解析

**CLI 命令**：`vectahub parse-doc <path>`

**Prompt 策略**：
```
你是任务提取器。从以下开发文档中提取所有开发任务。

要求：
- 每个任务输出编号和名称
- 如果任务没有名称，根据内容浓缩一句话
- 输出 JSON 数组格式：[{"id": "1.1", "label": "任务描述"}]
- 不要遗漏任何任务

文档内容：
{文档内容}
```

**大文档处理**：超过 token 限制时分段解析，结果合并去重。

### 3.3 任务执行

**CLI 命令**：`vectahub run-task --tool <tool> --doc <path> --task-id <id>`

**默认提示词模板**：
```
按照项目要求进行开发。
任务编号：{task_id}
任务描述：{task_label}
参考文档：{doc_path}
请严格按文档要求实现，完成后运行项目测试验证。
```

**执行流程**：
1. 读取工具的 help 缓存 → LLM 生成具体命令
2. 拼装完整命令（如 `aider --message "..."`）
3. 执行并记录输出
4. 成功 → 继续下一条；失败 → 停住，展示错误

### 3.4 插件侧 UI

**面板结构**：
```
文档任务 (CategoryTreeItem)
├── 选择文档文件... (TaskTreeItem) → 触发文件选择器
├── 解析文档任务... (TaskTreeItem) → 调 CLI 解析
├── ▶ 任务1: 实现用户认证 (TaskTreeItem) → QuickPick 选执行器 → 执行
├── ▶ 任务2: 创建数据库模型 (TaskTreeItem)
└── ▶ 任务3: 编写API接口 (TaskTreeItem)
```

---

## 4. 实现计划

### 4.1 阶段划分

| 阶段 | 内容 | 改动范围 |
|------|------|----------|
| P1 | CLI: parse-doc 命令 + PromptManager 新增模板 | `src/nl/prompt-manager.ts` + `src/commands/parse-doc.ts` |
| P1 | CLI: ToolCacheManager（懒发现 + 缓存） | 新建 `src/cli-tools/discovery/cache-manager.ts` |
| P1 | CLI: run-task 命令 | 新建 `src/commands/run-task.ts` |
| P2 | 插件: tasksView 新增文档任务分区 | `packages/.../views/tasksView.ts` |
| P2 | 插件: 命令注册 + package.json | `extension.ts` + `package.json` |
| P2 | 插件: runDocTasks 命令文件 | 新建 `packages/.../commands/runDocTasks.ts` |
| P3 | CLI: types.ts 扩展 capabilities 字段 | `src/cli-tools/types.ts` |
| P3 | 安全: agent CLI prompt 注入防护 | `src/security-protocol/default-rules.ts` |

### 4.2 改动文件清单

**新建文件（4 个）**：
- `src/cli-tools/discovery/cache-manager.ts` — 工具缓存管理
- `src/commands/parse-doc.ts` — 文档解析命令
- `src/commands/run-task.ts` — 任务执行命令
- `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts` — 插件端文档任务命令

**修改文件（5 个）**：
- `src/nl/prompt-manager.ts` — 新增 2 个 prompt 模板
- `src/cli-tools/types.ts` — 扩展 capabilities 字段
- `packages/vectahub-vscode-extension/src/views/tasksView.ts` — 新增文档任务分区
- `packages/vectahub-vscode-extension/src/extension.ts` — 注册新命令
- `packages/vectahub-vscode-extension/package.json` — 命令贡献声明

### 4.3 复用清单

| 现有组件 | 复用方式 |
|----------|----------|
| `LLMClient` (src/nl/llm.ts) | 直接调用 `complete()` 做文档解析和命令生成 |
| `PromptManager` (src/nl/prompt-manager.ts) | 新增 prompt 模板，复用模板管理机制 |
| `runCli` (adapter.ts) | 插件端调 CLI 后端的统一入口 |
| `CategoryTreeItem` / `TaskTreeItem` | 面板节点复用 |
| `vscode.window.withProgress` | 执行进度展示 |
| `CommandRuleEngine` | 命令安全检查 |
| `getVectaHubPath()` | 缓存路径管理 |

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 解析任务不准确 | 遗漏或误拆任务 | 用户可在面板中手动编辑任务列表 |
| agent CLI 调用超时/失败 | 任务执行中断 | 失败即停，展示错误，支持单条重试 |
| 大文档超出 token 限制 | 解析不完整 | 分段解析 + 结果合并 |
| help 输出过长 | 缓存文件过大 | 截断到合理长度（如 8000 字符） |
| Prompt 注入风险 | agent CLI 被恶意指令操控 | 安全规则过滤 + 提示词模板固定化 |

---

## 6. 结论

**可行性：通过。**

三个角色视角一致认为：
- 现有架构完全支撑，不需要推翻任何核心模块
- LLM 调用次数可控（最少 1 次，最多 2 次）
- 改动量小（4 个新文件 + 5 个修改文件）
- 复用率高（LLMClient、PromptManager、runCli、TreeView 组件全部复用）
- 核心定位清晰：VectaHub 做编排，agent CLI 做执行

**建议执行顺序**：先做 CLI 侧（P1），验证 parse-doc 和 run-task 命令可用后，再做插件侧 UI（P2）。安全增强（P3）可并行。
