# VectaHub 产品功能规划

> 版本: 6.0.0 | 最后更新: 2026-05-02

---

## 功能全景

### 第一层：智能交互层

| 功能 | 说明 | 状态 | 优先级 |
|------|------|------|--------|
| **LLM 意图解析** | 自然语言 → 结构化工作流 | 🔄 客户端已完成，待接入核心路径 | P0 |
| **关键词匹配降级** | 无 LLM 时的兜底方案 | ✅ 已实现 | - |
| **多 LLM 提供商** | OpenAI / Anthropic / Ollama | ✅ 已实现 | - |
| **意图模板** | 预定义的意图模式 | ⚠️ 8/30 | P1 |
| **命令编辑器** | 执行前审查和编辑生成的命令 | ✅ 已实现 | - |

### 第二层：工作流引擎层

| 功能 | 说明 | 状态 | 优先级 |
|------|------|------|--------|
| **步骤类型: exec** | 执行本地 CLI 命令 | ✅ 已实现 | - |
| **步骤类型: if** | 条件分支（有限制） | ⚠️ 条件表达式有限 | P1 |
| **步骤类型: for_each** | 循环执行 | ✅ 已实现 | - |
| **步骤类型: parallel** | 并行执行 | ✅ 已实现 | - |
| **步骤类型: opencli** | 调用 OpenCLI 适配器 | ✅ 基础实现 | P1 |
| **拓扑排序** | 自动处理步骤依赖 | ✅ 已实现 | - |
| **暂停/恢复** | 中断后从断点继续 | ✅ 已实现 | - |
| **DryRun 模式** | 预览不执行 | ✅ 已实现 | - |
| **上下文传递** | 步骤间输出传递 | ✅ 已实现 | - |
| **YAML 持久化** | 保存/加载工作流 | ✅ 已实现 | - |
| **工作流生成** | LLM 生成 YAML | ✅ generate 命令已实现 | - |

### 第三层：安全执行层

| 功能 | 说明 | 状态 | 优先级 |
|------|------|------|--------|
| **安全协议引擎** | 17 条内置规则，支持增删改查 | ✅ 已实现 | - |
| **命令黑白名单** | 通配符模式匹配 | ✅ 已实现 | - |
| **危险命令检测** | 正则模式匹配（rm -rf, sudo 等） | ✅ 已实现 | - |
| **macOS 沙箱** | sandbox-exec 系统级隔离 | ✅ 已实现 | - |
| **Linux 沙箱** | bubblewrap / unshare | ✅ 已实现 | - |
| **降级模式** | 目录隔离（非真正沙箱） | ⚠️ 功能受限 | P2 |
| **执行模式** | strict / relaxed / consensus | ✅ 已实现 | - |
| **审计日志** | 记录安全事件 | ✅ 已实现 | - |

### 工具集成

| 工具 | 子命令数 | 状态 |
|------|----------|------|
| git | 17+ | ✅ 已实现 |
| npm | 10+ | ✅ 已实现 |
| docker | 12 | ✅ 已实现 |
| curl | 6 | ✅ 已实现 |
| opencli | 90+ 适配器 | ✅ 基础集成 |

### CLI 命令

| 命令 | 说明 | 状态 |
|------|------|------|
| `vectahub run <intent>` | 自然语言执行工作流 | ✅ 已实现 |
| `vectahub run -f <file>` | 从 YAML 文件执行 | ✅ 已实现 |
| `vectahub generate <desc>` | LLM 生成 YAML 工作流 | ✅ 已实现 |
| `vectahub list` | 列出保存的工作流 | ✅ 已实现 |
| `vectahub history` | 查看执行历史 | ✅ 已实现 |
| `vectahub mode` | 查看/切换执行模式 | ✅ 已实现 |
| `vectahub tools list` | 列出所有工具 | ✅ 已实现 |
| `vectahub tools search <kw>` | 搜索工具 | ✅ 已实现 |
| `vectahub tools categories` | 查看工具分类 | ✅ 已实现 |
| `vectahub tools info <name>` | 查看工具详情 | ✅ 已实现 |
| `vectahub doctor` | 系统诊断 | ✅ 已实现 |
| `vectahub setup` | 首次配置向导 | ✅ 已实现 |
| `vectahub security` | 安全管理 | ✅ 已实现 |
| `vectahub audit` | 查看审计日志 | ✅ 已实现 |
| `vectahub serve` | 启动 Socket 服务 | ✅ 已实现 |
| `vectahub client` | Socket 客户端 | ✅ 已实现 |

---

## 三步实施路径详细规划

### 第一步：LLM 接入核心路径

**目标**：让 `vectahub run` 命令真正理解自然语言

**需要改动的文件**：
- `src/utils/run.ts` —— 核心改动，接入 LLM 解析器
- `src/nl/parser.ts` —— 可能需要调整接口
- 测试文件 —— 需要 mock LLM 响应

**实现逻辑**：
```
用户输入
  ↓
LLM 可用？
  ├─ 是 → LLM 解析（真正的意图理解）
  │        ↓
  │      返回结构化任务列表（tasks[]）
  │        ↓
  │      命令编辑器审查
  │        ↓
  │      生成工作流 → 执行
  │
  └─ 否 → 关键词匹配降级
           ↓
         返回匹配结果
```

**预期效果**：
- 用户说 "查找昨天修改的所有 .ts 文件并压缩" → LLM 理解并生成 find + zip 命令
- 用户说 "跑测试，通过了就部署" → LLM 理解并生成 test + if + deploy 工作流

### 第二步：OpenCLI 编排层

**目标**：工作流可以灵活调用 OpenCLI 的 90+ 适配器

**需要做的**：
1. 扩展 executor.ts 中 opencli 步骤的实现
2. 增加 opencli 工具发现（自动检测安装的 opencli）
3. 扩展意图模板，覆盖常见 opencli 场景
4. 优化 opencli 输出的解析和传递

**典型场景**：
```yaml
name: 每日热榜汇总
steps:
  - id: step1
    type: opencli
    site: hackernews
    command: top
    args: ["--limit", "5"]

  - id: step2
    type: opencli
    site: bilibili
    command: hot
    args: ["--limit", "5"]

  - id: step3
    type: exec
    cli: node
    args: ["combine step1 and step2 outputs..."]
```

### 第三步：企业安全场景

**目标**：让 VectaHub 成为 AI Agent 的安全执行引擎

**需要做的**：
1. 定时任务（cron）支持
2. 增强审计日志（谁、什么时候、执行了什么、结果如何）
3. 权限管理（RBAC）
4. Web UI 管理面板
5. API 接口（供其他系统调用）

---

## 已删除的"杜撰"功能

以下功能在代码中有实现，但实际不可用或从未被调用：

| 功能 | 问题 | 处理方式 |
|------|------|----------|
| IMAGE_COMPRESS | 生成 `echo "Image compression task"` | 标记为占位，等待 LLM 动态生成 |
| BATCH_RENAME | 生成 `echo "Batch rename task"` | 标记为占位 |
| DELETE_FILE | 生成 `echo "Delete file task"` | 标记为占位 |
| ContextManager | 280 行代码但引擎从不使用 | 后续集成到引擎 |
| 命令签名验证 | 实现了但从未调用 | 标记为实验性 |
| Gemini 提供商 | first-run-wizard 支持配置但 llm.ts 不处理 | 待实现 |
