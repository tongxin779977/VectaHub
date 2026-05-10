# 可行性分析报告：LLM + Rule + Skill 自举方案

```yaml
document: feasibility-report
version: 5.1.0
date: 2026-05-10
status: fully-implemented
scope: 逐文件、逐函数、逐代码块审计，精确判定哪些代码可删除/替代/必须保留
implementation:
  completed: [Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, 13.4 P0/P1 fixes]
  pending: []
  verification:
    typecheck: "npx tsc --noEmit → 0 errors"
    tests: "npx vitest run → 119 files passed, 1549 tests passed, 12 skipped, 0 failed"
    performance: "NL core 28 tests → 14ms, full suite 1549 tests → 27s"
related_docs:
  - llm-self-bootstrap-design.md        # 架构设计：LLMOrchestrator、Observability、DynamicToolRegistry、Semantic Guardrails
  - llm-self-bootstrap-roadmap.md       # 路线图：Phase 4-6 详细规划、里程碑、时间线
  - llm-self-bootstrap-implementation.md  # 实施指南：逐文件逐任务实施细节
  - llm-self-bootstrap-issues.md        # 问题与风险：技术债务、运行时风险、安全风险、监控指标
question: VectaHub 能否依托大模型能力 + rule + skill + 自定义命令，让项目自己健壮起来，拥有 90% 功能可用性，同时保持轻巧？
participants:
  - role: backend-architect
    focus: CLI 工具系统、命令系统、安全系统逐函数审计
    stance: 保守 — 执行基础设施必须可靠，不能依赖 LLM 推测
  - role: frontend-architect
    focus: VS Code 插件架构、工作流引擎、Skill 系统审计
    stance: 中立 — 插件已是薄壳，重点在 CLI 后端增强
  - role: ai-integration-engineer
    focus: NL 意图系统逐代码块审计
    stance: 激进 — LLM 原生理解语言，所有模拟代码都应删除
```

---

## 0. V3 修正说明

V2 报告中 `known-tools.ts` 行数标注为 1135 行（实际为 **134 行**，10 个工具），导致总账被高估。V3 基于三个 agent 的逐行审计，提供精确数据。

| 维度 | V2 估算 | V3 实测 | 差异原因 |
|------|---------|---------|----------|
| known-tools.ts | 1135 行 | 134 行 | V2 误标行数 |
| NL 系统可删除 | ~2,540 行 | ~2,070 行 | V3 更精确的逐函数判定 |
| CLI+命令可删除 | ~1,940 行 | ~91 行 | V2 高估了 doctor/self-healing 的可替代性 |
| 扩展层可删除 | ~1,111 行 | ~0 行 | V3 确认扩展已是薄壳架构 |

---

## 1. 核心发现（不变）

### 1.1 LLM 基础设施已就绪但从未启用

`src/nl/core/pipeline-use-llm.test.ts` 显示：`useLLM` 被硬编码为 `false`。LLM 适配器（`src/nl/llm.ts`）支持 OpenAI/Anthropic/Ollama/Groq 四个 provider，Agent Loop（`src/skills/ai-modules/agent-delegate/agent-loop.ts`）支持多轮工具调用，但这些能力**从未在生产中真正运行**。

### 1.2 三方审计新发现

| 发现 | 来源 | 影响 |
|------|------|------|
| NL 系统 73% 代码可删除 | AI Engineer | 最大收益区，语言理解模拟代码集中 |
| CLI 执行层几乎不可动 | Backend Architect | 安全+执行基础设施是硬约束 |
| 扩展已是薄壳架构 | Frontend Architect | 无需在扩展侧做减法 |
| `generate.ts` 和 `self-healing.ts` 已是 LLM-native | Backend Architect | 已经在用 LLM，不需要改 |
| `doctor.ts` 的检查必须精确执行 | Backend Architect | 不能用 LLM 推测替代实际执行 |
| `known-tools.ts` 只有 134 行（非 1135） | Backend Architect | 收益比 V2 估算小得多 |

---

## 2. 逐文件逐代码块审计结果

### 2.1 NL 意图系统（12 文件，2836 行 → ~468 行，**-83%**）

> **V3.1 更新**：用户决定不考虑 LLM 不可用的情况，keyword-fallback 和降级路径全部删除。✅ Phase 1-3 已实施完成（V4）。

**这是 LLM 替代的最大收益区。** NL 系统的核心问题是：用代码穷举语言变体来模拟 LLM 的语言理解能力。

| 文件 | 原始行数 | 实际行数 | 判定 | 状态 |
|------|---------|---------|------|------|
| [templates/index.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/templates/index.ts) | 772 | 168 | **DELETE 主体**。18 个模板的 keywords/weightedKeywords/phrases/negativeKeywords 全删。仅保留 intent/category/patterns/examples/priority | ✅ 已完成 |
| [core/matching-pipeline.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/matching-pipeline.ts) | 319 | 43 | **DELETE 主体**。keyword*0.55+phrase*0.35+boost*0.10 评分管线全删。仅保留 `classifyConfidence()` 阈值分级函数 | ✅ 已完成 |
| [knowledge/goal-vocabulary.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/knowledge/goal-vocabulary.ts) | 221 | 85 | **PARTIAL DELETE**。删除 PHRASE_MAP/SYNONYM_MAP。**保留** ACTION_MAP/SCOPE_MAP/FAILURE_TERMS/DOMAIN_KEYWORDS（goal-parser 需要） | ✅ 已完成 |
| [core/pipeline.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/pipeline.ts) | 420 | 226 | **SIMPLIFY**。删除 keyword fallback 路径 + skill 路径，只保留 LLM 主路径。无 LLM 直接抛错 | ✅ 已完成 |
| [command-synthesizer.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/command-synthesizer.ts) | 349 | 342 | **PARTIAL DELETE**。简化 `resolveGitWorkflow()` 和 `extractGitCommitMessage()`。保留模板引擎和 Task 构造 | ✅ 已完成 |
| [core/intent-splitter.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/intent-splitter.ts) | 248 | 124 | **SIMPLIFY**。保留 connector splitting + `validateInput()` 安全防护。删除 verb-list 依赖 | ✅ 已完成 |
| [core/input-normalizer.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/input-normalizer.ts) | 123 | 115 | **PARTIAL DELETE**。删除 `tokenize()`（CJK 分词）、`hasCiContext()`。**保留** extractRunIds/extractUrls/extractCommitShas/extractFilePaths + 最小化同义词映射 | ✅ 已完成 |
| [core/verb-list.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/verb-list.ts) | 61 | 0 | **DELETE ALL**。源文件已删除，引用已清理 | ✅ 已删除 |
| [core/coordinator.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/coordinator.ts) | 93 | 0 | **DELETE ALL**。源文件已删除，orchestrator/chat/api/daemon 引用已清理 | ✅ 已删除 |
| [core/precedence-rules.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/precedence-rules.ts) | 71 | 0 | **DELETE ALL**。源文件已删除，引用已清理 | ✅ 已删除 |
| [orchestrator.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/orchestrator.ts) | 92 | 104 | **REWRITE**。使用 createNLProcessor + IntentSplitter，无 coordinator 依赖 | ✅ 已完成 |
| [core/keyword-fallback.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/keyword-fallback.ts) | 67 | 0 | **DELETE ALL**。源文件已删除，测试已删除 | ✅ 已删除 |

**新增文件**（V4 实施期间创建）：

| 文件 | 行数 | 用途 |
|------|------|------|
| [tool-calling.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/tool-calling.ts) | 72 | LLM tool-calling 集成，buildToolsFromTemplates + convertToolCallToSteps |
| [llm-adapter.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/llm-adapter.ts) | 7 | LLMAdapterConfig 类型定义 |

**AI Engineer 关键论点**：

> "templates/index.ts 的 FILE_FIND 模板有 15 个 keywords（'找出'/'find'/'search'/'搜索最近'...）和 12 个 phrases（正则模式如 '查找.*文件'）。这是在用穷举法模拟语言理解。LLM 看到 '帮我找一下配置文件' 不需要查表就知道这是文件搜索。"

> "matching-pipeline.ts 的评分公式 keyword*0.55 + phrase*0.35 + boost*0.10 本质上是一个简化版 NLU 模型。LLM 的置信度更准确。"

> "但 extractRunIds()、extractCommitShas() 这些 regex 提取必须保留 — LLM 可能截断 40 位 SHA 或混淆数字 ID。确定性提取不能交给概率模型。"

### 2.2 CLI 工具系统 + 命令系统（10 文件，1244 行 → ~1153 行，**-7%**）

**CLI 执行层几乎不可动。** Backend Architect 的保守立场是正确的。

| 文件 | 当前行数 | 删除 | 保留 | 判定 | 状态 |
|------|---------|------|------|------|------|
| [discovery/known-tools.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-tools/discovery/known-tools.ts) | 134 | ~68 | ~66 | **PARTIAL DELETE**。删除 description/packageManager/categories/confidence 字段。使用 KnownTool 类型 + string regex | ✅ 已完成 |
| [commands/check.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/check.ts) | 11 | 11 | 0 | **DELETE ALL**。死代码，源文件已删除，cli.ts/index.ts 引用已清理 | ✅ 已删除 |
| [commands/doctor.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/doctor.ts) | 220 | ~20 | ~200 | **KEEP 主体**。Node.js >=21 检查、TypeScript/tsx/Vitest 检测、目录结构检查都必须精确执行。仅删除 verbose 模式的附加统计信息 |
| [commands/generate.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/generate.ts) | 160 | 0 | 160 | **ALREADY LLM-NATIVE**。已在使用 LLMDialogControlSkill 生成 YAML 工作流。YAML_WORKFLOW_SYSTEM_PROMPT 可迁移到 Skill 配置，但当前实现已工作 |
| [commands/self-healing.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/self-healing.ts) | 116 | 0 | 116 | **ALREADY LLM-NATIVE**。已在使用 intelligent-diagnosis 模块做 LLM 诊断。无需修改 |
| [workflow/system-workflows.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/system-workflows.ts) | 57 | 0 | 57 | **KEEP**。2 个系统工作流是"已知良好"的，必须可测试、可预测。不应由 LLM 动态生成 |
| [command-rules/engine.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-tools/command-rules/engine.ts) | 112 | 0 | 112 | **NEVER TOUCH**。安全规则引擎 |
| [command-rules/templates.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-tools/command-rules/templates.ts) | 38 | 0 | 38 | **NEVER TOUCH**。安全规则定义 |
| [tool-service.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-tools/tool-service.ts) | 126 | 0 | 126 | **KEEP**。进程管理基础设施 |
| [registry.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-tools/registry.ts) | 106 | 0 | 106 | **KEEP**。工具注册核心 |
| [tool-chain.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/cli-tools/tool-chain.ts) | 168 | 0 | 168 | **KEEP**。工具链执行核心 |

**Backend Architect 关键论点**：

> "doctor.ts 的每个检查都需要实际执行命令（`npx tsc --version`）或检查文件系统（`existsSync`）。LLM 不能替代这些确定性操作 — 你不能让 LLM '推测' TypeScript 是否安装了。"

> "generate.ts 和 self-healing.ts 已经在用 LLM 了！它们不需要被'替代'，因为它们已经是 LLM-native 的。"

> "system-workflows.ts 的 2 个工作流是经过测试的系统工作流。LLM 生成的工作流可能有幻觉风险，对 CI/CD 故障处理这种场景不可接受。"

### 2.3 VS Code 扩展层（已是薄壳，**-0%**）

**Frontend Architect 的核心发现：扩展已经是薄壳架构，不需要做减法。**

| 文件 | 当前行数 | 判定 | 理由 |
|------|---------|------|------|
| [planRunner.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/src/execution/planRunner.ts) | ~72 | KEEP | 所有执行都是 `runCli()` 调用，零业务逻辑 |
| [adapter.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/src/cli/adapter.ts) | ~139 | KEEP | 纯进程管理，只做 spawn + JSON 解析 |
| [extension.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/src/extension.ts) | 111 | KEEP | 命令注册骨架 |
| [taskDetector.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/src/project/taskDetector.ts) | 280 | KEEP | TreeView 即时刷新需要本地解析（LLM 太慢） |
| [tasksView.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/src/views/tasksView.ts) | ~324 | KEEP | 纯 UI 渲染 |

**Frontend Architect 关键论点**：

> "扩展中的每个文件都是 UI 壳。planRunner.ts 的每一步执行都是 `runCli()` 调用到 CLI 后端。扩展本身不包含任何业务逻辑。"

> "taskDetector.ts 虽然用了 regex 解析 README/package.json，但 TreeView 需要即时刷新。如果改成调 CLI 后端 + LLM，用户每次打开面板都要等 500ms+，体验太差。"

> "真正需要增强的是 CLI 后端的 prompt-manager.ts 和 session-manager.ts — 它们是 LLM 的基础设施。"

---

## 3. 总账（V3 修正版）

### 3.1 按区域汇总

| 区域 | 当前行数 | 删除行数 | 保留行数 | 删除率 | 核心动作 |
|------|---------|---------|---------|--------|----------|
| NL 意图系统 | 2,836 | ~2,368 | ~468 | **83%** | 删除语言理解模拟代码+全部降级路径 |
| CLI 工具+命令 | 1,244 | ~91 | ~1,153 | **7%** | 删除死代码(check.ts)和冗余元数据 |
| VS Code 扩展 | ~926 | 0 | ~926 | **0%** | 已是薄壳，无需改动 |
| 需增强的基础设施 | ~730 | 0 | ~730 | **0%** | prompt-manager + session-manager 需增强 |
| **总计** | **~5,736** | **~2,459** | **~3,277** | **~43%** | — |

### 3.2 按操作分类

| 操作 | 行数 | 涉及文件 |
|------|------|----------|
| 直接删除（死代码+冗余+降级路径） | ~2,459 | NL 模拟代码 + keyword-fallback + check.ts + 元数据字段 |
| 需增强（不是删除） | ~100 | prompt-manager.ts, session-manager.ts, skills/registry.ts |
| 绝对不动 | ~3,574 | 安全层 + 执行层 + 扩展 UI + LLM-native 命令 |

### 3.3 与 V2 对比

| 维度 | V2 | V3 | V3.1（无降级） | 修正 |
|------|----|----|---------------|------|
| 总可删除 | ~5,591 行 (50%) | ~2,161 行 (38%) | ~2,459 行 (43%) | V2 高估，V3.1 因移除降级路径略增 |
| NL 系统 | ~2,540 行 | ~2,070 行 | ~2,368 行 (83%) | keyword-fallback 全删 |
| CLI+命令 | ~1,940 行 | ~91 行 | ~91 行 | 不变 |
| 扩展层 | ~1,111 行 | 0 行 | 0 行 | 不变 |
| 安全层 | 1,339 行不动 | 1,339 行不动 | 1,339 行不动 | 不变 |

---

## 4. 三方辩论焦点

### 焦点 1：NL 系统删多少？

| 角色 | 立场 | 理由 |
|------|------|------|
| AI Engineer | **删 73%** | "LLM 原生理解语言，关键词/同义词/评分全是冗余" |
| Backend Architect | **删 50%** | "保留 intent-splitter 的连接词拆分作为 LLM 预处理，降低 token 消耗" |
| Frontend Architect | **同意 AI Engineer** | "扩展侧不做改动，NL 系统的简化对扩展透明" |

**结论**：**采纳 AI Engineer 方案，删 73%**。但保留 `validateInput()` 安全防护和 regex 实体提取。

### 焦点 2：doctor.ts 能否 LLM 化？

| 角色 | 立场 | 理由 |
|------|------|------|
| AI Engineer | **可以** | "LLM 读 package.json 就能判断项目健康" |
| Backend Architect | **不可以** | "Node.js >=21 是硬性要求，不能让 LLM '推测'" |
| Frontend Architect | **同意 Backend** | "doctor 是诊断工具，必须精确" |

**结论**：**采纳 Backend Architect 方案，保留 doctor.ts 全部检查**。doctor 的价值在于确定性诊断，不是智能推理。

### 焦点 3：扩展层是否需要改动？

| 角色 | 立场 |
|------|------|
| AI Engineer | "taskDetector.ts 应该移交给 CLI 后端 LLM" |
| Backend Architect | "不关心扩展侧" |
| Frontend Architect | "**不需要**。扩展已是薄壳，taskDetector 的本地解析是 UX 需要" |

**结论**：**采纳 Frontend Architect 方案，扩展不动**。扩展已经是薄壳，所有执行通过 `runCli()` 委托给 CLI 后端。

### 焦点 4：known-tools.ts 删多少？

| 角色 | 立场 | 理由 |
|------|------|------|
| AI Engineer | **全删** | "LLM 训练知识已覆盖" |
| Backend Architect | **只删元数据字段** | "checkCommand + checkOutputRegex 是执行逻辑，必须保留" |
| Frontend Architect | **同意 Backend** | "工具检测需要确定性" |

**结论**：**采纳 Backend Architect 方案**。保留 checkCommand + checkOutputRegex，删除 description/categories/confidence/packageManager。

---

## 5. 最终架构

```
┌─────────────────────────────────────────────────┐
│ 用户输入                                          │
│   ↓                                              │
│ ┌───────────────────────────────────────────┐    │
│ │ Context Builder（增强）                     │    │
│ │  L1: System Rules（.trae/rules/ 安全约束）  │    │
│ │  L2: Skill Knowledge（.skills/ 领域知识）   │    │
│ │  L3: Project Context（结构 + TTL 缓存）     │    │
│ │  L4: Session History（滑窗 + 摘要）         │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ LLM Core（大脑）                            │    │
│ │  - 意图理解（替代 772 行关键词模板）          │    │
│ │  - 命令生成（替代 180 行硬编码路由）          │    │
│ │  - 多意图拆分（替代 248 行连接词规则）        │    │
│ │  - 同义词理解（替代 221 行映射表）            │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ Pre-Processing（确定性提取，LLM 不碰）       │    │
│ │  - extractRunIds() / extractUrls()          │    │
│ │  - extractCommitShas() / extractFilePaths() │    │
│ │  - classifyConfidence() 阈值分级             │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ Safety Layer（脊髓，永不降级）               │    │
│ │  - sandbox/detector.ts（500 行）            │    │
│ │  - command-rules（150 行）                  │    │
│ │  - security-protocol（416 行）              │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ Execution Layer（骨骼，确定性执行）          │    │
│ │  - workflow engine + executor（580 行）      │    │
│ │  - tool-service/chain/registry（400 行）    │    │
│ │  - system-workflows（57 行，已知良好）       │    │
│ │  - doctor.ts（220 行，精确诊断）             │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│ ┌───────────────────────────────────────────┐    │
│ │ VS Code Extension（薄壳，不改动）            │    │
│ │  - planRunner → runCli() 委托               │    │
│ │  - adapter → spawn + JSON 解析              │    │
│ │  - tasksView → 纯 UI 渲染                   │    │
│ └───────────────┬───────────────────────────┘    │
│                 ↓                                 │
│              执行/阻断                             │
└─────────────────────────────────────────────────┘
```

**四层分工**：
- **大脑（LLM）**：理解、推理、生成 — 替代 ~2,370 行模拟代码+降级路径
- **提取器（Regex）**：URL/SHA/RunID/文件路径 — 保留 ~73 行确定性提取
- **脊髓（安全）**：反射、保护、拦截 — 保留 1,066 行，永不触碰
- **骨骼（执行）**：进程管理、诊断、工作流 — 保留 1,153 行基础设施

---

## 6. 哪些代码绝对不能删（V3 新增）

V2 报告过于激进地建议删除。V3 明确列出"碰都不能碰"的代码：

| 文件 | 行数 | 理由 | 违反后果 |
|------|------|------|----------|
| sandbox/detector.ts | 500 | 危险命令检测，零延迟、确定性 | 安全漏洞 |
| security-protocol/manager.ts | 416 | 安全协议管理 | 安全漏洞 |
| command-rules/engine.ts | 112 | 命令安全规则引擎 | 安全漏洞 |
| command-rules/templates.ts | 38 | 安全规则定义 | 安全漏洞 |
| workflow/engine.ts + executor.ts | 580 | 工作流执行引擎 | 执行失败 |
| tool-service.ts + chain.ts + registry.ts | 400 | CLI 执行基础设施 | 执行失败 |
| doctor.ts | 220 | 精确健康检查 | 误报/漏报 |
| system-workflows.ts | 57 | 已知良好的系统工作流 | CI/CD 故障 |
| generate.ts | 160 | 已是 LLM-native | 无需改动 |
| self-healing.ts | 116 | 已是 LLM-native | 无需改动 |
| VS Code 扩展全部文件 | 926 | 已是薄壳架构 | 无收益 |
| prompt-manager.ts | 349 | LLM Prompt 基础设施 | LLM 能力退化 |
| session-manager.ts | 271 | LLM 会话管理 | 上下文丢失 |
| **小计** | **~4,145** | — | — |

---

## 7. 降级策略

**不需要。** LLM 不可用时直接报错，不做 keyword fallback。这让代码更简单、行为更可预测。✅ 已实现。

> 已删除的代码：keyword-fallback.ts（67 行）、pipeline.ts 中的 fallback 路径（~30 行）、coordinator.ts（93 行）、precedence-rules.ts（71 行）

---

## 8. 实现路径（V4 更新）

### Phase 1：打开 LLM 通路 ✅ 已完成

1. ✅ pipeline.ts 改为 LLM-only（删除 `useLLM` 条件分支）
2. ✅ LLM 不可用时直接抛错，不做降级
3. ✅ 创建 `llm-adapter.ts` 类型定义

### Phase 2：简化 NL Pipeline ✅ 已完成

1. ✅ pipeline.ts：删除 keyword fallback 路径 + skill 路径，只保留 LLM 主路径
2. ✅ 删除 `keyword-fallback.ts`（源文件 + 测试文件）
3. ✅ 删除 `coordinator.ts`（源文件已不存在，清理 orchestrator/chat/api/daemon 引用）
4. ✅ 删除 `precedence-rules.ts`（源文件已不存在，清理引用）
5. ✅ LLM 不可用时直接抛错，不做降级

### Phase 3：删除语言模拟代码 ✅ 已完成

1. ✅ `templates/index.ts`：删除 keywords/weightedKeywords/phrases/negativeKeywords（772→168 行）
2. ✅ `goal-vocabulary.ts`：删除 PHRASE_MAP/SYNONYM_MAP，保留 ACTION_MAP/SCOPE_MAP/FAILURE_TERMS/DOMAIN_KEYWORDS（221→85 行）
3. ✅ `matching-pipeline.ts`：删除评分管线，仅保留 classifyConfidence（319→43 行）
4. ✅ 删除 `verb-list.ts`、`coordinator.ts`、`precedence-rules.ts`（源文件已删除）
5. ✅ `intent-splitter.ts`：保留 connector splitting + validateInput（248→124 行）
6. ✅ `command-synthesizer.ts`：简化 resolveGitWorkflow 和 extractGitCommitMessage（349→342 行）
7. ✅ 删除 `check.ts`（11 行死代码）
8. ✅ `known-tools.ts`：使用 KnownTool 类型 + string regex（134→66 行）
9. ✅ `input-normalizer.ts`：保留 regex 提取 + 最小化同义词映射（123→115 行）
10. ✅ `orchestrator.ts`：重写为 LLM-only（92→104 行）
11. ✅ 创建 `tool-calling.ts`（LLM tool-calling 集成）

**验证结果**：
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 115 files passed, 1397 tests passed, 12 skipped, 0 failed

### Phase 4：增强 LLM 基础设施 ✅ 已完成

1. prompt-manager.ts：`selectPrompt(context)` 动态 Prompt 选择 + `recordOutcome()` EMA effectiveness 追踪
2. session-manager.ts：`estimateTokens()` + `getSessionTokenCount()` + `summarizeHistory()` + `compactHistory()` 智能滑窗
3. skills/registry.ts：`findSkillsBySemantic()` + `stem()` 词干匹配 + `SkillMatchResult`
4. input-normalizer.ts：删除 SYNONYM_MAP，实现 CJK/非CJK 混合匹配策略

### Phase 5：验证与校准 ✅ 已完成

1. LLM confidence 值域校准：新增 scope(+0.1) 贡献 + needsClarification 惩罚(×0.5)
2. 领域冲突规则迁移测试：10/10 tests passed（含 4 个新增 CJK 边界用例）
3. 性能基准：NL 核心 28 tests → 14ms，全量 1415 tests → 27s
4. 全量验证：tsc 0 errors, vitest 1415 passed, 0 failed

---

## 9. 成本与延迟

| 操作 | 调用次数 | Input Tokens | Output Tokens | 延迟 |
|------|---------|-------------|--------------|------|
| 简单意图（"git commit"） | 1 次 | 800-1200 | 100-200 | 500-1000ms |
| 复杂意图（"分析日志并修复"） | 2-3 次 | 1500-2500 | 300-500 | 1500-3000ms |
| Agent 委托（多轮） | 3-5 次 | 3000-5000 | 500-1000 | 3000-8000ms |
| 项目健康检查 | 1 次 | 1000-1500 | 300-500 | 1000-2000ms |

以 GPT-4o-mini 为例，混合日常使用月成本约 **$1.5**。

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 幻觉生成危险命令 | 安全事故 | 1,066 行安全层拦截，永不降级 |
| LLM 输出不稳定 | 相同输入不同输出 | JSON Schema 约束 + 重试 |
| 延迟增加 | 用户体验下降 | 意图缓存 + 并行调用 + 流式输出 |
| 实体提取精度下降 | 误操作 | regex 提取不交给 LLM，确定性兜底 |
| 领域冲突规则丢失 | 路由错误 | 规则迁移到 prompt + 等价性测试 |

---

## 11. 结论

**可行性：通过。不考虑降级，架构更简洁。**

### 三方一致结论

1. ✅ **LLM 基础设施已就绪**，已启用（pipeline.ts LLM-only，无 fallback）
2. ✅ **NL 系统是唯一的大规模删除目标**（Phase 1-3 已完成，净减少 ~1,629 行）
3. ✅ **CLI 执行层几乎不可动**（仅删除 check.ts + 精简 known-tools.ts）
4. ✅ **VS Code 扩展已是薄壳**（未改动）
5. ✅ **generate.ts 和 self-healing.ts 已是 LLM-native**，未改动
6. ✅ **doctor.ts 必须保留**，未改动
7. ✅ **不考虑降级**，keyword-fallback 全删，LLM 不可用直接报错
8. ✅ 安全层 + 执行层合计 ~2,220 行未触碰
9. ✅ **Phase 4-5 已完成**（prompt-manager/session-manager/skills 增强 + 校准测试）

### 修正后的总账

| 维度 | 预估 | 实际 |
|------|------|------|
| 审计总行数 | ~5,736 行 | ~5,736 行 |
| 可删除 | ~2,459 行（43%） | ~1,629 行（净减少） |
| 需增强 | ~100 行 | ✅ Phase 4 完成（+4 新方法/新功能） |
| 绝对不动 | ~3,277 行（57%） | ✅ 未触碰 |
| 删除集中在 | NL 意图系统 | ✅ NL 意图系统（占删除量 97%） |

### 一句话总结

VectaHub 的 NL 意图系统有 ~2,800 行用代码模拟语言理解的代码，其中 ~1,629 行已删除，用 LLM 原生能力替代。其余代码（CLI 执行层、安全层、扩展 UI）**未触碰**。不考虑降级，keyword-fallback 全删，架构更简洁。Phase 1-5 全部完成，LLM 基础设施已增强（prompt-manager/session-manager/skills），confidence 已校准，性能基准已建立。

**最大的 ROI 动作**：修复 `useLLM: false`（1 行），然后删除 `templates/index.ts` + `goal-vocabulary.ts` + `matching-pipeline.ts` + `keyword-fallback.ts` 的语言模拟代码（~1,343 行），这两步做完项目就已经"活了"。

---

## 12. V4 实施结果（2026-05-10）

### 12.1 实际代码变化

| 文件 | 原始行数 | 当前行数 | 变化 |
|------|---------|---------|------|
| templates/index.ts | 772 | 168 | **-604** (-78%) |
| matching-pipeline.ts | 319 | 43 | **-276** (-87%) |
| goal-vocabulary.ts | 221 | 85 | **-136** (-62%) |
| pipeline.ts | 420 | 226 | **-194** (-46%) |
| command-synthesizer.ts | 349 | 342 | -7 (-2%) |
| intent-splitter.ts | 248 | 124 | **-124** (-50%) |
| input-normalizer.ts | 123 | 115 | -8 (-7%) |
| orchestrator.ts | 92 | 104 | +12 (重写) |
| known-tools.ts | 134 | 66 | **-68** (-51%) |
| tool-calling.ts (新建) | 0 | 72 | +72 |
| llm-adapter.ts (新建) | 0 | 7 | +7 |

**已删除文件**（5 个，共 303 行）：

| 文件 | 行数 |
|------|------|
| keyword-fallback.ts | 67 |
| coordinator.ts | 93 |
| precedence-rules.ts | 71 |
| verb-list.ts | 61 |
| check.ts | 11 |

**净减少**：~1,629 行（修改文件 -1,417 + 删除文件 -303 - 新增文件 79）

### 12.2 类型修改

| 文件 | 修改内容 |
|------|----------|
| types/nl.ts | IntentName 联合类型扩展 18 个新意图名 |
| core/goal-types.ts | GoalAction 扩展 `git`；GoalScope 扩展 `all`/`latest`；ProjectContext 添加 `rawInput` |
| core/types.ts | NLResult.metadata.path 联合类型更新 |
| templates/index.ts | IntentTemplate 接口添加 `weight`/`name`/`description`/`params` 可选字段 |

### 12.3 测试修改

| 文件 | 变化 |
|------|------|
| pipeline.test.ts | 重写为 LLM-only 测试 |
| matching-pipeline.test.ts | 仅测试 classifyConfidence |
| run.dry-run.test.ts | mock 改为 orchestrator |
| adapter.test.ts | 更新为新模板结构 |
| category-router.test.ts | 更新为新模板结构 |
| input-normalizer.test.ts | 更新同义词期望 |
| goal-parser.test.ts | 更新域名期望 |
| intent-skill.test.ts | 添加 QUERY_INFO 模板 |
| keyword-fallback.test.ts | 已删除 |
| coordinator.test.ts | 已删除 |
| precedence-rules.test.ts | 已删除 |
| pipeline-use-llm.test.ts | 已删除 |
| verification.test.ts | 已删除 |

### 12.4 下一步

- **Phase 4**：增强 LLM 基础设施（prompt-manager、session-manager、skills/registry）→ ✅ 已完成
- **Phase 5**：LLM confidence 校准、领域冲突等价性测试、性能基准 → ✅ 已完成
- **Phase 6**：架构升级（LLMOrchestrator、Observability、DynamicToolRegistry、Semantic Guardrails）→ ⏳ 待开始

详细规划参见：
- [架构设计文档](./llm-self-bootstrap-design.md) — Phase 6 的核心设计方案
- [路线图文档](./llm-self-bootstrap-roadmap.md) — Phase 4-6 详细规划、里程碑、时间线
- [实施指南文档](./llm-self-bootstrap-implementation.md) — 逐文件逐任务实施细节
- [问题与风险文档](./llm-self-bootstrap-issues.md) — 技术债务、运行时风险、安全风险、监控指标

---

## 13. Phase 1-3 代码审查结果（2026-05-10）

### 13.1 🔴 P0 必须修复

#### 1. buildToolsFromTemplates 返回空数组导致 Tool-Calling 完全失效

**位置**: [tool-calling.ts:8](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/tool-calling.ts#L8)

**问题**: 
```typescript
.filter((t): t is IntentTemplate & { name: string; description: string } => !!t.name && !!t.description)
```

templates/index.ts 中的 19 个模板**全部没有** `name` 和 `description` 字段。这个 filter 会过滤掉所有模板，导致 `buildToolsFromTemplates()` 返回空数组。

**影响**: LLM 无法通过 tool-calling 识别任何意图，整个 LLM-only 架构失效。

**修复方案**:
```typescript
// 方案1：使用 intent 作为 name，examples 拼接作为 description
export function buildToolsFromTemplates(): LLMTool[] {
  return INTENT_TEMPLATES.map(template => ({
    type: 'function' as const,
    function: {
      name: template.intent,
      description: template.examples.join('; '),
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          (template.requiredParams ?? []).map(p => [p, { type: 'string', description: `${p} parameter` }])
        ),
        required: template.requiredParams ?? [],
      },
    },
  }));
}
```

---

#### 2. convertToolCallToSteps 生成的 CLI 命令格式错误

**位置**: [tool-calling.ts:64-69](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/tool-calling.ts#L64-L69)

**问题**:
```typescript
cli: intentName,  // 例如 'git_commit'
args: [param.name, String(params[param.name] ?? '')],
```

生成 `cli: git_commit, args: [message, "fix bug"]`，但正确格式应该是 `cli: git, args: [commit, -m, "fix bug"]`。

**影响**: 生成的 workflow 无法执行，CLI 工具找不到 `git_commit` 命令。

**修复方案**: 需要为每个意图定义正确的 CLI 命令模板映射。

---

#### 3. pipeline.ts 违反"无降级"原则

**位置**: [pipeline.ts:44-54](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/pipeline.ts#L44-L54)

**问题**: 文档要求"LLM 不可用时直接抛错"，但代码在 LLM 返回 null 后返回 `success: false` 结果而非抛错。

**修复方案**:
```typescript
// LLM 返回 null 也应该抛错
throw new Error('LLM failed to recognize intent');
```

---

#### 4. createMatchingPipeline 是死代码

**位置**: [matching-pipeline.ts:34-42](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/matching-pipeline.ts#L34-L42)

**问题**: 函数返回空实现，无调用方，应删除 `MatchingPipeline` 接口和 `createMatchingPipeline` 函数，仅保留 `classifyConfidence`。

---

### 13.2 🟡 P1 建议优化

| 问题 | 位置 | 说明 |
|------|------|------|
| LLMAdapterConfig 和 LLMConfig 类型重复 | llm-adapter.ts / llm.ts | 应统一为一个类型，推荐保留 `LLMConfig` |
| requiredParams 未验证 | templates/index.ts | 模板定义了必需参数但 pipeline.ts 未验证 |
| QUERY_INFO pattern 过于宽泛 | templates/index.ts:152 | `/what\|how/` 会误匹配 "what time is it?" 等 |
| JSON.parse 失败静默忽略 | tool-calling.ts:54-58 | 应记录警告而非静默忽略 |
| 空输入处理不当 | pipeline.ts:34 | 非字符串输入设为空串会导致无意义 API 调用 |

---

### 13.3 ✅ P2 良好实践

| 项目 | 位置 | 评价 |
|------|------|------|
| goal-vocabulary.ts 保留必要映射 | L3-32 | ACTION_MAP/SCOPE_MAP 在 goal-parser.ts 中实际使用，删除了冗余的 PHRASE_MAP/SYNONYM_MAP |
| classifyConfidence 函数 | matching-pipeline.ts:23-32 | 简洁有用，可在 confidence 校准中使用 |
| templates/index.ts 删除冗余字段 | 全文 | 成功删除 keywords/weightedKeywords/phrases/negativeKeywords，从 772 行减少到 168 行 |

---

### 13.4 关键结论

~~**P0-1 和 P0-2 是阻塞性问题**~~：已全部修复。

**修复记录**:
1. ✅ P0-1：`buildToolsFromTemplates()` — 所有 INTENT_TEMPLATES 添加 `name` + `description` + `params` 字段
2. ✅ P0-2：`convertToolCallToSteps()` — 新增 `INTENT_CLI_MAP` 正确映射意图到 CLI 命令（`git_commit` → `git commit`）
3. ✅ P0-3：`pipeline.ts` — 空输入抛错 + LLM 返回 null 抛错，不再返回 `success: false`
4. ✅ P0-4：`matching-pipeline.ts` — 删除 `MatchingPipeline` 接口和 `createMatchingPipeline` 死代码，保留 `classifyConfidence`
5. ✅ P1-1：`LLMAdapterConfig` → 别名为 `LLMConfig`，消除类型重复
6. ✅ P1-2：`convertToolCallToSteps()` 增加 `requiredParams` 校验 + 缺失参数警告
7. ✅ P1-3：`QUERY_INFO` pattern 收窄为 `\bwhat\b.*\b(is|are|does|do)\b` 等
8. ✅ P1-4：`JSON.parse` 失败增加 `console.warn` 日志
9. ✅ P1-5：`pipeline.ts` 空输入检查，`trim()` 后为空则抛错
10. ✅ 附加修复：`convertToolCallToSteps()` 对 `LLM_RESTRICTED_TOOLS`（rm/sudo/curl/docker/wget）返回 null

**状态**: ✅ 全部 P0 + P1 问题已修复，1549 测试通过，0 类型错误
