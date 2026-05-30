# VectaHub NL 引擎与质量优化路线图

**文档版本**: 3.2
**日期**: 2026-05-30
**最近核验**: 2026-05-30
**依据**: 标准体系、当前源码、当前本地验证命令输出
**相关文档**:
- docs/standards/quality-scoring.md
- docs/standards/intelligent-systems.md
- docs/standards/verification-gates.md
- docs/design/nl-engine-enhancements.md
- docs/design/safety-trace-recovery-architecture.md

---

## 核验结论

这份路线图的方向基本符合当前项目问题面，但原文把部分待办项写成了已完成状态，也包含若干过期数字和示例路径。以下结论已经按 2026-05-30 的本地源码与验证输出核对：

- **P0 全部清零**：`npm run typecheck`、`npm run lint`、`npm run test:run`（2878 passed / 0 failures）、`npm run check:default-context-usage`、`scripts/test-semantic-output.sh`（35/35）、`scripts/collect_quality_signals.sh` 均已通过。P0-NL1、P0-CODE1、P0-CODE2、P0-TEST1、P0-ARCH1 已修复。
- **P1 部分修复**：P1-NL2（`buildAllTools` 空工具）、P1-VERIFY1（semantic E2E 验证 stale dist）、P1-WF1（delegate handler）、P1-ERR1（关键路径 bare catch）已修复。P1-SKILL1（skill discovery 占位）已添加 warn 日志和 JSDoc 标注，完整文件扫描待实现。
- 当前仓库没有 `src/nl/intent-classifier.ts` / `src/types/intent.ts`，相关修复示例应理解为伪代码，实际修复点在 `src/nl/core/pipeline.ts`、`src/nl/core/goal-parser.ts`、`src/nl/tool-calling.ts`、`src/nl/prompt-manager.ts` 和共享类型定义。
- Shell 语义端到端：35 项全部通过（0 expected fail）。
- 剩余 open 项：P1-SKILL1（warn 已添加，完整文件扫描待实现）、P2-NL4（prompt registry 双轨）、P1-ERR1 剩余非关键路径 bare catch（~17 处）。
- `SecurityRuleStore` 与 `security` CLI 已支持安全规则 CRUD、导入、导出、启用、禁用和测试；不能再写成“有 API 但无 CLI 入口”。
- MCP 支持、工作流 `skill` / `mcp` / `rule` / `llm` 步骤、统一 `CapabilityRegistry` 仍未在当前源码中实现，适合作为后续路线图，不应描述为当前能力。
- 额外质量检查发现：默认 context 边界、静默失败、Skill discovery 占位、语义端到端脚本使用 `dist`、`delegate` step 类型与默认 handler 不一致、prompt registry 双轨等问题也需要纳入路线图。
- 本文后续评分必须使用统一、可复用、可复现的评分体系；不得用纯人工印象给出 60/100、65/100 等结论。
- “智能化”不是 NL 模块的局部优化。NL、workflow、security、recovery、tooling、skill、audit 等模块都应逐步减少硬编码，改为规则快路径 + LLM 推理 + 反馈学习 + 可审计验证的混合架构。

## 评分与标准引用

本路线图不再承载可复用评分体系全文。正式评分必须使用 [Quality Scoring Standard](./standards/quality-scoring.md)，其中包含统一维度、权重、证据包、严重程度和智能化评分子项。

本文现有 `NL 引擎 60/100`、`代码质量 65/100` 等分数只作为历史估计，不作为正式基线。下一次评审必须按标准体系重新计算。

## 一、执行摘要

### 1.1 当前状态

| 类别 | 评分 | 状态 |
|------|------|------|
| NL 引擎 | 60/100 (C) | 需改进 |
| 测试质量 | 65/100 (C) | 需改进 |
| 代码质量 | 65/100 (C) | 需改进 |
| 安全可靠性 | 70/100 (C) | 需改进 |

### 1.2 测试结果概览

| 测试类型 | 结果 | 说明 |
|----------|------|------|
| Vitest 单元测试 | 2878 通过，11 跳过，0 失败 ✅ | `npm run test:run` 213 files |
| TypeScript 类型检查 | 通过 ✅ | `npm run typecheck` exit 0 |
| ESLint | 0 errors / 0 warnings ✅ | `npm run lint` exit 0 |
| 默认 context 检查 | 通过 ✅ | `npm run check:default-context-usage` exit 0 |
| Shell 端到端 | 35 通过，0 expected fail ✅ | `scripts/test-semantic-output.sh` |
| 质量信号采集 | 通过 ✅ | `scripts/collect_quality_signals.sh` Production Any: 0 |

### 1.3 已知缺陷追踪

| ID | 级别 | 描述 | 当前状态 |
|----|------|------|----------|
| P0-NL1 | 🔴 阻断 | `nl-processor-tool-calling` prompt 不在 `BUILTIN_PROMPTS` | ✅ 已修复 |
| P1-NL2 | 🟠 严重 | `pwd` / `ls` / `echo` 等输入可能走到 `domains=[]`，导致空工具列表 | ✅ 已修复 |
| P2-NL3 | 🟡 一般 | 无通用 shell 命令工具 / intent fallback | 已确认 |
| P0-CODE1 | 🔴 阻断 | `src/infrastructure/data/cleanup.ts` pino logger 调用类型不匹配 | ✅ 已修复 |
| P0-CODE2 | 🔴 阻断 | `src/skills/executor.ts:220` 表达式不可调用 | ✅ 已修复 |
| P0-TEST1 | 🔴 阻断 | `npm run test:run` 当前有 5 个失败测试 | ✅ 已修复 |
| P0-ARCH1 | 🔴 阻断 | `src/utils/version.ts` 直接调用 `getDefaultContext()`，违反默认 context 边界 | ✅ 已修复 |

### 1.4 补充发现追踪

| ID | 级别 | 问题 | 证据 | 建议 |
|----|------|------|------|------|
| P0-ARCH1 | 🔴 阻断 | 默认 context 边界违规 | `npm run check:default-context-usage` 失败；`src/utils/version.ts:18` | ✅ 已修复 |
| P1-ERR1 | 🟠 严重 | 静默失败隐藏真实问题 | `src/skills/registry.ts:243`、`src/skills/registry.ts:316`、`src/nl/tool-calling.ts:283` | ✅ 关键路径已修复；剩余 ~17 处非关键路径 bare catch 待后续批次 |
| P1-SKILL1 | 🟠 严重 | Skill discovery 是占位实现 | `src/skills/registry.ts:416` 固定返回空数组 | ⚠️ 已添加 warn 日志和 JSDoc 标注；完整文件扫描待实现 |
| P1-VERIFY1 | 🟠 严重 | 语义端到端脚本可能验证过期构建产物 | `scripts/test-semantic-output.sh:8` 使用 `node dist/cli.js` | ✅ 已修复（默认 source mode） |
| P1-WF1 | 🟠 严重 | `delegate` StepType 与默认执行器 handler 不一致 | `src/types/workflow.ts:1` 声明 `delegate`；默认 handler 不包含 `delegate` | ✅ 已修复（添加默认 delegate handler） |
| P2-NL4 | 🟡 一般 | Prompt registry 双轨 | `src/nl/prompt-manager.ts:7` 与 `src/nl/prompt/v3.ts:14` 都定义 `BUILTIN_PROMPTS` | 收敛到单一 registry，或明确 v3 边界与同步规则 |
| P2-QUALITY1 | 🟡 一般 | 生产代码仍有显式 `any` 和阻断级 `console.*` | 质量脚本：14 个 production `any`，3 个 blocking console | ✅ 已修复（Production Any: 0, Blocking Console: 0） |

### 1.5 优化优先级矩阵

```
┌─────────────────────────────────────────────────────────────┐
│                      优化优先级矩阵                           │
├─────────────────┬─────────────────┬─────────────────────────┤
│     紧急程度     │     影响范围      │       行动项            │
├─────────────────┼─────────────────┼─────────────────────────┤
│ ✅ P0           │ 高              │ 全部清零（已修复）        │
│ 🟠 P1           │ 高              │ P1-SKILL1 skill discovery（warn 已添加，扫描待实现） │
│ 🟠 P1           │ 中              │ P1-ERR1 剩余 bare catch   │
│ 🟡 P2           │ 中              │ P2-NL4 prompt 双轨        │
└─────────────────┴─────────────────┴─────────────────────────┘
```

---

## 二、NL 引擎优化

### 2.0 智能化架构原则

智能化不是 NL 模块的局部优化。NL、workflow、security、recovery、tooling、skill、audit 和 extension-facing 自动化都必须遵循 [Intelligent Systems Standard](./standards/intelligent-systems.md)。

本路线图只记录当前 NL 相关缺陷和阶段性改造任务；跨模块的“规则快路径 + LLM 推理 + 反馈学习 + 可审计验证”模型以标准文档为准。

### 2.1 缺陷分析

#### 🔴 P0：nl-processor-tool-calling prompt 缺失

**根本原因**:
```typescript
// 当前：src/nl/prompt-manager.ts 的 BUILTIN_PROMPTS 缺少 nl-processor-tool-calling 条目
const BUILTIN_PROMPTS: Prompt[] = [
  { id: 'intent-parser-v1', /* ... */ },
  { id: 'workflow-yaml-v1', /* ... */ },
  // 缺失：{ id: 'nl-processor-tool-calling', ... }
];
```

**影响**:
- 工具调用管道静默失败
- 工具选择缺少 fallback 策略

**修复方案**:
```typescript
// src/nl/prompt-manager.ts
const BUILTIN_PROMPTS: Prompt[] = [
  // ... 现有 prompts
  {
    id: 'nl-processor-tool-calling',
    name: 'NL Processor Tool Calling',
    version: '1.0.0',
    description: 'Select tools and extract arguments for NL processing',
    category: 'tool',
    tags: ['nl', 'tool-calling'],
    systemTemplate: `
    你是一个 shell 命令的工具选择器。

    可用命令：
    - pwd：打印当前目录
    - ls [路径]：列出目录内容
    - echo [文本]：打印文本

    任务：根据用户意图选择合适的命令。
    输出格式：JSON { "tools": ["tool1", "tool2"] }
  `,
  },
];
```

#### 🟠 P1：domains=[] 导致空工具列表

**根本原因**:
```typescript
// src/nl/tool-calling.ts
export function buildAllTools(domains?: string[]): LLMTool[] {
  if (domains !== undefined && domains.length === 0) {
    return [];
  }
  // ...
}
```

**影响**:
- pwd/ls/echo 被错误识别为 UNKNOWN
- 6 个端到端测试失败

**修复方案**:
```typescript
// src/nl/tool-calling.ts
export function buildAllTools(domains?: string[]): LLMTool[] {
  const allTools = [
    ...buildToolsFromTemplates(),
    ...getDiscoveredCLITools(),
    ...buildAgentToolsFromRegistry(),
    ...buildProviderManagementTools(),
    ...buildShellTools(),
  ];

  if (domains && domains.length > 0) {
    return allTools.filter(tool => matchesDomain(tool, domains));
  }

  return allTools;
}
```

#### 🟡 P2：缺少通用 shell intent 类型

**根本原因**:
- Intent 类型硬编码
- 无法识别未知的 shell 命令

**修复方案**:
```typescript
// src/nl/tool-calling.ts
const shellTool: LLMTool = {
  type: 'function',
  function: {
    name: 'shell_execute',
    description: 'Execute a shell command after normal security checks.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  },
};
```

### 2.2 NL 引擎优化路线图

| 阶段 | 时间 | 目标 | 里程碑 |
|------|------|------|----------|
| **阶段一** | 1 周 | 修复 P0/P1/P2 缺陷 | `BUILTIN_PROMPTS` 添加 tool-calling prompt；`domains=[]` 不再产生空工具；Shell fallback 有测试 |
| **阶段二** | 2 周 | 提升准确率 | 领域提取率 > 90%；Shell 命令覆盖率 > 95% |
| **阶段三** | 1 月 | 高级特性 | 多轮对话支持；上下文感知建议 |

---

## 三、测试质量优化

### 3.1 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| D13: 测试覆盖率 | 3/5 | 当前 `npm run test:run` 发现 213 个测试文件，2841 个测试；5 个失败 |
| D14: 测试设计 | 3/5 | 大量断言清晰，但 NL pipeline 存在 5s 超时失败，部分测试依赖真实异步路径不稳定 |
| D15: 测试可维护性 | 4/5 | 按功能分组，命名较清晰 |

**优势**:
- A-E Shell 语义测试分组清晰。
- Expected Failure 机制能记录当前已知缺陷。
- 已添加幻觉检测相关测试。

**当前阻断**:
- `src/cli-main.error-handling.test.ts` 有 1 个 fail-fast 断言失败。
- `src/nl/core/pipeline.test.ts` 有 4 个 5s 超时失败。
- `src/nl/semantic-correctness.test.ts` 当前触发一个 `prefer-const` lint error。

### 3.2 测试覆盖率缺口

| 模块 | 当前覆盖率 | 目标覆盖率 | 差距 |
|------|------------|------------|------|
| nl/core + tool-calling | 待生成覆盖率报告 | 85% | 待量化 |
| workflow/engine | 75% | 85% | +10% |
| sandbox/config | 50% | 80% | +30% |

### 3.3 测试优化计划

#### 3.3.1 扩大覆盖率

```typescript
// src/nl/core/pipeline.test.ts / src/nl/tool-calling.test.ts - 新增测试用例
describe('意图分类', () => {
  // 现有：10 个测试用例

  // 新增：Shell 命令边界情况
  describe('Shell 命令 Fallback', () => {
    it('应识别 pwd', () => { /* ... */ });
    it('应识别 ls', () => { /* ... */ });
    it('应识别 echo', () => { /* ... */ });
    it('应处理空输入', () => { /* ... */ });
    it('应处理中文输入', () => { /* ... */ });
  });
});
```

#### 3.3.2 改进 Expected Failure 机制

```bash
# 缺陷修复后的测试结果变化
修复前：⚠️ D: git status - UNKNOWN intent (EXPECTED_FAIL)
修复后：✅ D: git status - SHELL_COMMAND intent (PASS)
```

### 3.4 测试质量路线图

| 阶段 | 时间 | 目标 | 里程碑 |
|------|------|------|----------|
| **阶段一** | 1 周 | 修复当前失败测试 | `npm run test:run` 全部通过；Shell expected fail 随缺陷修复转为 pass |
| **阶段二** | 2 周 | 扩大覆盖率 | Sandbox 覆盖率 > 80%；Workflow 覆盖率 > 85% |
| **阶段三** | 1 月 | 高级测试 | 属性测试；NL 模糊测试 |

---

## 四、代码质量优化

### 4.1 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| D04: 类型安全 | 3/5 | 存在 P0 类型错误 |
| D07: 命名规范 | 4/5 | 总体良好 |
| D18: 文档质量 | 3/5 | 核心导出缺少 JSDoc |
| D19: 代码重复 | 3/5 | 存在一些重复 |
| D20: 技术债务 | 3/5 | 4 个 P0 问题待处理 |

### 4.2 🔴 P0 问题（必须立即修复）

| 问题 | 位置 | 影响 | 修复方案 |
|------|------|------|----------|
| pino logger 类型不匹配 | `src/infrastructure/data/cleanup.ts:131-327` | 类型检查失败 | 将 `error` 转换为 string，或按 pino 对象参数格式记录 |
| 表达式不可调用 | `src/skills/executor.ts:220` | 类型检查失败 | 收窄 `originalRequire` 为可调用函数后再调用 |
| reply 清洗不足 | `src/nl/core/pipeline.ts` / `src/chat/nl-handler.ts` / `src/nl/semantic-correctness.test.ts` | 可能泄露思考文本或幻觉样式回复 | 添加 `<think>` 块剥离和幻觉模式过滤策略 |
| CLI 审计 fail-fast 回归 | `src/cli-main.error-handling.test.ts` | 测试失败，审计合同不一致 | 对齐 CLI 主入口审计失败时的退出语义 |

#### 修复 1：pino logger 类型

```typescript
// src/infrastructure/data/cleanup.ts
// ❌ 修复前（崩溃）
logger.warn('清理失败', error);

// ✅ 修复后（安全）
logger.warn('清理失败', String(error));
// 或
logger.warn('清理失败', error instanceof Error ? error.message : String(error));
```

#### 修复 2：Skill executor require 收窄

```typescript
// src/skills/executor.ts
// ❌ 修复前（类型检查失败）
const originalRequire = (globalThis as Record<string, unknown>).require;
return originalRequire(module);

// ✅ 修复后（先收窄函数类型）
if (typeof originalRequire === 'function') {
  return originalRequire(module);
}
throw new Error(`Cannot require module '${module}': require is not available`);
```

### 4.3 🟠 P1 问题（应尽快修复）

| 问题 | 数量 | 修复方案 |
|------|------|----------|
| ESLint error | 5 处 | 手动修复；不要只依赖 `--fix` |
| ESLint warning | 59 处 | 分批处理未使用变量、`any`、`console.*` 等 |
| `any` 类型 | 生产代码 14 处 | 替换为 `unknown` 或具体类型 |
| `console.*` 混用 | 阻断级 3 处 | 替换为 pino logger 或明确 CLI 输出边界 |
| 默认 context 越界 | 1 处 | 修复 `src/utils/version.ts` 直接调用 `getDefaultContext()` |
| run-task.ts 过长 | 3573 行 | 按职责拆分 |

### 4.4 技术债务清理

| 债务项 | 优先级 | 工作量 | 计划 |
|--------|--------|--------|------|
| P0 类型错误 | 🔴 P0 | 2 小时 | 立即修复签名 |
| 未使用导入 | 🟠 P1 | 0.5 小时 | ESLint 自动修复 |
| `any` 类型 | 🟠 P1 | 8 小时 | 手动替换 |
| run-task.ts 重构 | 🟠 P1 | 16 小时 | 提取子模块 |
| 缺少 JSDoc | 🟡 P2 | 6 小时 | 为顶层导出添加文档 |

### 4.5 代码质量路线图

| 周 | 重点 | 里程碑 |
|------|------|----------|
| **第 1 周** | P0 修复 | 4 个 P0 崩溃问题解决；`npm run test:run` 通过 |
| **第 2 周** | 类型安全 | `any` 减少 80%；`npm run typecheck` 通过 |
| **第 3 周** | 重构 | `run-task.ts` < 500 行；函数 < 100 行 |
| **第 4 周** | 文档 | 顶层导出有 JSDoc；注释解释"为什么" |

---

## 五、安全与可靠性优化

### 5.1 当前评估

| 维度 | 评分 | 问题 |
|------|------|------|
| 安全架构 | 4/5 | 配置不匹配 |
| 审计系统 | 3/5 | 默认 fail-open；CLI 审计 fail-fast 测试当前失败 |
| 沙箱 | 4/5 | 缺少参数白名单 |
| 可靠性 | 3/5 | 有 API `/health` 与 `HealthChecker`，但 workflow checkpoint / LRU 等可靠性能力仍需补齐 |

### 5.2 🔴 P0 安全修复

#### 5.2.1 默认配置与规格不一致

**问题**: 规格要求 `strict` 模式，代码默认为 `passthrough`

```typescript
// src/sandbox/sandbox.ts - ❌ 当前（错误）
const DEFAULT_CONFIG = {
  mode: 'RELAXED',              // ← 应为 STRICT
  defaultPolicy: 'passthrough', // ← 应为 block
};

// ✅ 修复后
const DEFAULT_CONFIG = {
  mode: 'STRICT',
  defaultPolicy: 'block',
};
```

#### 5.2.2 sudoers 参数白名单缺失

**问题**: sudoers 权限过宽

```bash
# ❌ 当前（权限过宽）
username ALL=(ALL) NOPASSWD: /usr/bin/bwrap
username ALL=(ALL) NOPASSWD: /usr/bin/unshare

# ✅ 修复后（参数受限）
username ALL=(ALL) NOPASSWD: /usr/bin/bwrap --bind /tmp /tmp --ro-bind /etc/hosts /etc/hosts
username ALL=(ALL) NOPASSWD: /usr/bin/unshare --pid --mount-proc --user
```

#### 5.2.3 审计安全事件保护

**问题**: fail-open 模式下安全事件丢失

```typescript
// src/infrastructure/audit/service.ts
private handleAuditFailure(error: Error): void {
  // 安全事件必须不能丢失
  if (this.isSecurityEvent()) {
    throw error; // 安全事件采用 fail-closed
  }

  if (this.failureMode === 'fail-closed') {
    throw error;
  }

  this.onError(error); // 非安全事件可以 fail-open
}
```

### 5.3 可靠性改进

| 问题 | 解决方案 | 优先级 | 工作量 |
|------|----------|--------|--------|
| 状态未持久化 | 添加 checkpoint 到存储 | 🟠 P1 | 2 天 |
| 缺少 LRU 缓存 | 使用 lru-cache 库 | 🟠 P1 | 0.5 天 |
| 健康检查需统一 | 对齐 API `/health`、monitoring `HealthChecker` 与 CLI 诊断输出 | 🟠 P1 | 0.5 天 |
| 内存阈值偏高 | 降低到 60% | 🟡 P2 | 0.25 天 |

### 5.4 Breaking Change 与迁移策略

将 sandbox 默认策略从 `RELAXED` / `passthrough` 改为 `STRICT` / `block` 是潜在 breaking change，不能只改默认值。

必须先定义：

- 兼容窗口：旧默认值保留多久，哪个版本切换默认值。
- 配置迁移：已有配置缺省时如何解释，是否写入显式迁移记录。
- Feature flag：是否支持 `VECTAHUB_SANDBOX_DEFAULT=strict|relaxed` 或等价配置。
- 用户提示：首次检测到旧默认值时输出可操作迁移说明。
- 测试矩阵：旧配置、新配置、无配置、显式 relaxed、显式 strict 都要覆盖。

### 5.5 Trace / Recovery / Checkpoint 合同

Checkpoint、审计和恢复不能只作为实现任务描述，必须先定义合同。

最小合同：

| 合同 | 必须定义 |
|------|----------|
| Checkpoint record | `executionId`、`workflowId`、`stepId`、输入快照、输出摘要、状态、时间、版本 |
| Recovery record | 失败类型、失败命令、失败输出摘要、可恢复性、建议动作、是否需要确认 |
| Trace link | CLI command、workflow execution、step result、audit event、recovery decision 的关联 ID |
| Compatibility | 老记录缺字段时如何读取；新字段是否可选；迁移脚本是否需要 |
| Verification | 恢复测试、重放测试、trace 查询测试、敏感信息脱敏测试 |

智能化扩展：

- LLM 可以基于失败输出生成恢复建议，但建议必须落入固定 `RecoveryDecision` schema。
- 用户接受/拒绝恢复建议应写入 feedback record，用于后续 prompt/eval 改进。
- 自动恢复不得绕过安全检查、权限确认和审计记录。

### 5.6 安全与可靠性路线图

| 阶段 | 时间 | 目标 | 里程碑 |
|------|------|------|----------|
| **P0** | 2.5 天 | 安全基线对齐 | STRICT 默认；sudoers 白名单；审计保护 |
| **P1** | 3 天 | 可靠性 | 状态 checkpoint；LRU 缓存；健康检查语义统一 |
| **P2** | 1 天 | 可观测性 | 执行记录完整；敏感环境告警 |

---

## 六、综合路线图

### 6.0 范围声明

本路线图的主范围是 CLI、NL engine、workflow engine、security、trace/recovery、skill/tooling 基础能力。

VSCode extension 处理规则：

- 如果改动影响 CLI JSON contract、trace/recovery 数据结构、任务运行记录、security prompt 或扩展读取的文件格式，必须把 `packages/vectahub-vscode-extension` 纳入验证范围。
- 如果改动只在内部实现层且不影响 extension contract，可以标注 extension out of scope。
- 每个阶段结束时必须明确 extension 状态：`in scope / out of scope / not verified`。

### 6.1 时间线视图

```
第 1 周                    第 2 周                    第 3 周                    第 4 周
─────────────────────────────────────────────────────────────────────────────────
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  NL 引擎        │   │  NL 引擎        │   │  NL 引擎        │   │  NL 引擎        │
│  • 修复 P0 缺陷 │   │  • 覆盖率 85%   │   │  • 多轮支持     │   │  • 高级特性     │
│                │   │  • 准确率 90%   │   │                │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  代码质量        │   │  代码质量        │   │  代码质量        │   │  代码质量        │
│  • 修复 P0      │   │  • 类型安全 80% │   │  • 重构        │   │  • JSDoc 完善   │
│    崩溃         │   │                │   │    run-task.ts │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  安全           │   │  可靠性         │   │  测试质量       │   │  持续改进       │
│  • STRICT 默认 │   │  • Checkpoint   │   │  • Sandbox 80% │   │  • 监控迭代     │
│  • sudoers     │   │  • LRU 缓存     │   │  • Workflow 85%│   │                 │
│    白名单       │   │  • 健康检查     │   │                │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
```

### 6.2 里程碑检查清单

#### 里程碑一：第 1 周 - 基础（🔴 关键）
- [ ] 修复 pino logger 类型错误 (cleanup.ts)
- [ ] 修复表达式不可调用 (executor.ts)
- [ ] 修复 reply 清洗不足（JSON / `<think>` / 幻觉样式文本）
- [ ] 修复 CLI 审计 fail-fast 测试失败
- [ ] 修复 NL P0：BUILTIN_PROMPTS 添加 tool-calling
- [ ] 修复默认 context 边界违规 (`src/utils/version.ts`)
- [ ] 修复安全配置：STRICT 默认
- [ ] 修复 sudoers 参数白名单
- [ ] 修复审计安全事件保护
- [ ] 所有 P0 测试通过
- [ ] `npm run test:run` 通过

#### 里程碑二：第 2 周 - 稳定性（🟠 重要）
- [ ] NL pipeline / tool-calling shell 命令 fallback
- [ ] 添加通用 shell intent 类型
- [ ] `any` 类型减少 80%
- [ ] ESLint 自动修复未使用导入
- [ ] 添加状态 checkpoint 机制
- [ ] 添加 LRU 缓存
- [ ] 统一 API `/health`、monitoring `HealthChecker` 与 CLI 诊断语义
- [ ] Shell 语义测试全部通过，0 expected fail
- [ ] 修复语义端到端脚本使用过期 `dist` 的验证风险
- [ ] 明确 `delegate` step 是 extension-only 或提供默认 handler

#### 里程碑三：第 3 周 - 质量（🟠 重要）
- [ ] 重构 run-task.ts < 500 行
- [ ] 所有函数 < 100 行
- [ ] Sandbox 覆盖率 > 80%
- [ ] Workflow 覆盖率 > 85%
- [ ] npm run typecheck 通过
- [ ] Prompt registry 单一来源或同步合同明确

#### 里程碑四：第 4 周 - 完善（🟢 可选）
- [ ] 顶层导出有 JSDoc
- [ ] 注释解释"为什么"
- [ ] 代码重复 < 3%
- [ ] 文档已更新

---

## 七、验证计划

### 7.1 验证门禁

| 门禁 | 标准 | 工具 |
|------|------|------|
| 构建 | `npm run build` 通过，且 `dist` 与源码变更同步 | tsup |
| 类型检查 | `npm run typecheck` 通过 | tsc |
| 代码规范 | `npm run lint` 通过 | ESLint |
| 依赖边界 | `npm run check:default-context-usage` 通过 | repository script |
| 单元测试 | `npm run test:run` 通过 | Vitest |
| 端到端 | `scripts/test-semantic-output.sh` 通过，且 0 expected fail | Shell |
| VSCode extension | 若本阶段影响 extension，则 `npm run compile:extension` 通过；否则明确标注 out of scope | TypeScript |
| 覆盖率 | 核心模块 > 80% | Vitest coverage（需先添加 coverage 脚本或显式命令） |

### 7.2 回归测试

```bash
# 完整验证脚本
#!/bin/bash
set -e

echo "运行验证门禁..."

npm run build
echo "✅ 构建通过"

npm run typecheck
echo "✅ 类型检查通过"

npm run lint
echo "✅ 代码规范通过"

npm run check:default-context-usage
echo "✅ 默认 context 边界检查通过"

npm run test:run
echo "✅ 单元测试通过"

./scripts/test-semantic-output.sh
echo "✅ 端到端测试通过"

echo "🎉 所有验证门禁通过！"
```

---

## 八、附录

### 8.1 相关文档

| 文档 | 路径 | 用途 |
|------|------|------|
| 评分框架 | docs/standards/quality-scoring.md | 评估标准 |
| 谷歌规范 | docs/standards/quality-scoring.md | 工程规范 |
| 评分维度 | docs/standards/quality-scoring.md | 详细评分 |
| NL 增强设计 | docs/design/nl-engine-enhancements.md | NL 设计 |
| 安全架构 | docs/design/safety-trace-recovery-architecture.md | 安全设计 |

### 8.2 测试报告

完整测试报告：`.test-reports/semantic-test-report.md`

### 8.3 问题追踪

| 问题 ID | 类型 | 状态 | 负责人 |
|----------|------|------|--------|
| P0-NL1 | NL | 待处理 | - |
| P0-CODE1 | 代码 | 待处理 | - |
| P0-CODE2 | 代码 | 待处理 | - |
| P0-SEC1 | 安全 | 待处理 | - |
| P1-NL1 | NL | 待处理 | - |
| P1-CODE1 | 代码 | 待处理 | - |
| P1-RELI1 | 可靠性 | 待处理 | - |

---

## 九、多架构师视角：LLM-first 架构升级分析

> **核心问题**：当前优化方案大量依赖硬编码（ACTION_MAP、DOMAIN_KEYWORDS、INTENT_TEMPLATES 等），能否用 LLM 原生能力替代，实现更智能、更通用的架构？

### 9.1 硬编码热点全景图

通过源码审计，识别出以下 **6 大硬编码热点**：

| # | 文件 | 硬编码内容 | 行数 | 维护痛点 |
|---|------|-----------|------|---------|
| 1 | `src/nl/knowledge/goal-vocabulary.ts` | ACTION_MAP (50+ 关键词→动作映射)、SCOPE_MAP (30+ 范围映射)、DOMAIN_KEYWORDS (11 领域×10 关键词) | ~86 | 每新增一个命令/语言需手动添加 |
| 2 | `src/nl/templates/index.ts` | INTENT_TEMPLATES (20 个意图模板 + 正则表达式) | ~240 | 每新增意图需写正则+示例+参数 |
| 3 | `src/nl/prompt-manager.ts` | BUILTIN_PROMPTS (8 个静态 prompt 模板) | ~490 | P0 缺陷根因：新增 prompt 需改代码 |
| 4 | `src/nl/tool-calling.ts` | LLM_SAFE_TOOLS (7 个白名单)、EXTRA_INTENT_MAPPINGS (15+ 意图→步骤映射) | ~155 | 每新增工具需改两处代码 |
| 5 | `src/nl/core/category-router.ts` | CATEGORY_MAP (6 个类别映射)、CATEGORY_METADATA | ~60 | 新增类别需改映射+元数据 |
| 6 | `src/nl/core/llm-fallback.ts` | NEGATION_PATTERNS (16 个否定模式) | ~30 | 多语言否定词需手动维护 |

**总计：约 1061 行硬编码逻辑**

### 9.2 NL/AI 架构师视角

#### 9.2.1 意图分类：从关键词匹配到 LLM Tool-Calling

**当前方案的问题**：

```typescript
// goal-vocabulary.ts - 硬编码关键词匹配
export const ACTION_MAP: Record<string, GoalAction> = {
  'run': 'run', '执行': 'run', '运行': 'run',
  'create': 'create', 'generate': 'create',
  // ... 50+ 条目，每新增一个词需手动添加
};

// 问题1: "帮我看看当前目录" → unknown（"看看"不在 ACTION_MAP 中）
// 问题2: "pwd" → unknown（"pwd"不是动作关键词）
// 问题3: "把代码推上去" → 可能匹配不到（"推上去"不在 MAP 中）
```

**LLM-first 替代方案**：

```typescript
// 方案：直接使用 LLM Tool-Calling，无需 ACTION_MAP
// LLM 天然理解 "帮我看看当前目录" = file_find 或 QUERY_INFO
// LLM 天然理解 "pwd" = 执行 shell 命令
// LLM 天然理解 "把代码推上去" = git_push

async function classifyIntentLLM(input: string, tools: LLMTool[]): Promise<LLMToolCall> {
  const systemPrompt = `你是 VectaHub 意图分类器。
根据用户输入，选择最合适的工具并提取参数。
如果输入是 shell 命令（如 pwd, ls, echo），使用 shell_execute 工具。`;

  const response = await llmClient.complete('intent-classifier', input, {}, { tools });
  return response.toolCalls[0];
}
```

**评估**：
- **优势**：零维护成本，支持任意语言，理解上下文语义
- **风险**：LLM 调用延迟（~500ms-2s），离线不可用
- **复杂度**：中（需要新增 shell_execute 工具定义）

#### 9.2.2 工具选择：从 Domain Filtering 到全量 Tool-Calling

**当前方案的问题（P1 缺陷根因）**：

```typescript
// tool-calling.ts - Domain 过滤导致空工具列表
export function buildAllTools(domains?: string[]): LLMTool[] {
  if (domains !== undefined && domains.length === 0) {
    return [];  // ← P1 缺陷：domains=[] 时返回空，LLM 无法选择任何工具
  }
  // ... 过滤逻辑
  if (domains && domains.length > 0) {
    return allTools.filter(tool => {
      return domains.some(domain => name.includes(domain));
    });  // ← 硬编码过滤：工具名必须包含领域关键词
  }
}
```

**LLM-first 替代方案**：

```typescript
// 方案：始终传递全量工具，让 LLM 自己选择
export function buildAllTools(): LLMTool[] {
  const intentTools = buildToolsFromTemplates();
  const cliTools = getDiscoveredCLITools();
  const agentTools = buildAgentToolsFromRegistry();
  const shellTools = buildShellTools();  // ← 新增：通用 shell 工具
  return [...intentTools, ...cliTools, ...agentTools, ...shellTools];
  // 不再按 domain 过滤，LLM 自己判断
}
```

**评估**：
- **优势**：彻底解决 P1 缺陷，LLM 可选择任意工具
- **风险**：工具过多时 LLM 选择准确率下降（>50 个工具时需注意）
- **复杂度**：低（删除过滤逻辑即可）

#### 9.2.3 Shell 命令识别：从"不认识"到"天然理解"

**当前方案的问题（P2 缺陷根因）**：

```typescript
// goal-parser.ts - pwd/ls/echo 全部返回 unknown
function detectAction(cleanText: string, terms: string[]): GoalAction {
  for (const key of cjkActionKeys) {
    if (cleanText.includes(key)) return ACTION_MAP[key];
  }
  for (const key of nonCjkActionKeys) {
    if (terms.includes(key)) return ACTION_MAP[key];
  }
  return 'unknown';  // ← pwd, ls, echo, cat, mkdir 全部走到这里
}
```

**LLM-first 替代方案**：

```typescript
// 方案：新增通用 shell_execute 工具，LLM 自然映射
const shellTool: LLMTool = {
  type: 'function',
  function: {
    name: 'shell_execute',
    description: '执行任意 shell 命令。当用户输入是 shell 命令（如 pwd, ls, echo, cat, mkdir 等）时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的 shell 命令',
        },
      },
      required: ['command'],
    },
  },
};

// LLM 会自动：
// "pwd" → shell_execute({ command: 'pwd' })
// "ls -la" → shell_execute({ command: 'ls -la' })
// "echo hello" → shell_execute({ command: 'echo hello' })
// "看看当前目录有啥" → shell_execute({ command: 'ls' })
```

**评估**：
- **优势**：彻底解决 P2 缺陷，支持任意 shell 命令，包括中文描述
- **风险**：需要严格的安全校验（由 sandbox 层处理）
- **复杂度**：低（新增一个工具定义 + convertToolCallToSteps 分支）

#### 9.2.4 Prompt 管理：从静态 BUILTIN_PROMPTS 到动态生成

**当前方案的问题（P0 缺陷根因）**：

```typescript
// prompt-manager.ts - 静态 prompt 列表
const BUILTIN_PROMPTS: Prompt[] = [
  { id: 'intent-parser-v1', ... },
  { id: 'workflow-yaml-v1', ... },
  // ❌ 缺失：'nl-processor-tool-calling'
  // 每新增一个 prompt 需要改代码、发版
];
```

**LLM-first 替代方案**：

```typescript
// 方案：动态 prompt 生成 + 元提示词
function buildDynamicSystemPrompt(context: {
  availableTools: LLMTool[];
  userLanguage: string;
  projectContext?: ProjectContext;
}): string {
  const toolDescriptions = context.availableTools
    .map(t => `- ${t.function.name}: ${t.function.description}`)
    .join('\n');

  return `你是 VectaHub 智能助手。

可用工具：
${toolDescriptions}

用户语言：${context.userLanguage}
项目上下文：${context.projectContext?.cwd ?? '未知'}

根据用户输入，选择最合适的工具并提取参数。
如果是 shell 命令，使用 shell_execute 工具。
如果是对话/查询，直接回复。`;
}
```

**评估**：
- **优势**：无需维护 BUILTIN_PROMPTS，prompt 随工具自动更新
- **风险**：动态 prompt 的质量不如精心调优的静态 prompt
- **复杂度**：中（需要重构 PromptManager）

### 9.3 系统架构师视角

#### 9.3.1 架构分层评估

当前架构的分层设计是合理的：

```
用户输入
  ↓
意图拆分 (IntentSplitter) ← 不需要改
  ↓
Capability 路由 (CapabilityRouter) ← 不需要改，已有 LLM 能力
  ↓ (未匹配时)
LLM 降级 (NLProcessor) ← 需要改造的核心
  ↓
工具选择 (buildAllTools) ← 硬编码热点
  ↓
步骤转换 (convertToolCallToSteps) ← 硬编码热点
  ↓
沙箱执行 (SandboxManager) ← 不需要改，安全层独立
```

**关键发现**：沙箱层（`SandboxManager`、`Detector`、`CommandRuleEngine`）与 NL 引擎完全解耦。这意味着：

- ✅ 可以安全地将 NL 引擎从"规则驱动"升级为"LLM 驱动"
- ✅ 安全边界不受影响（所有命令执行前都经过 sandbox 检测）
- ✅ `LLM_SAFE_TOOLS` / `LLM_RESTRICTED_TOOLS` 可以删除，由 sandbox 层统一管理

#### 9.3.2 接口抽象改造方案

```typescript
// 当前：硬编码的工具构建
export function buildAllTools(domains?: string[]): LLMTool[] { ... }

// 改造后：策略模式的工具构建
export interface ToolBuilderStrategy {
  build(context: ToolBuildContext): LLMTool[];
}

export class FullToolStrategy implements ToolBuilderStrategy {
  // LLM-first：传递全量工具
  build(context: ToolBuildContext): LLMTool[] {
    return [
      ...buildIntentTools(),
      ...buildCLITools(),
      ...buildAgentTools(),
      ...buildShellTools(),  // 新增
      ...buildProviderTools(),
    ];
  }
}

export class DomainFilterStrategy implements ToolBuilderStrategy {
  // 兼容模式：按 domain 过滤（仅用于离线场景）
  build(context: ToolBuildContext): LLMTool[] {
    const all = new FullToolStrategy().build(context);
    if (!context.domains?.length) return all;
    return all.filter(tool =>
      context.domains!.some(d => tool.function.name.includes(d))
    );
  }
}
```

#### 9.3.3 缓存策略升级

```typescript
// 当前：缓存硬编码的翻译结果
const memory = new TranslationMemory({ maxSize: 256, ttlMs: 300_000 });

// 升级：缓存 LLM 响应（语义相似的输入复用结果）
const llmCache = new LLMResponseCache({
  maxSize: 512,
  ttlMs: 600_000,
  similarityThreshold: 0.85,  // 语义相似度阈值
  // 使用 embedding 计算相似度，而非字符串精确匹配
});
```

#### 9.3.4 改造成本评估

| 改造项 | 工作量 | 风险 | 收益 |
|--------|--------|------|------|
| 删除 buildAllTools domain 过滤 | 0.5 天 | 低 | 彻底解决 P1 |
| 新增 shell_execute 工具 | 1 天 | 低 | 彻底解决 P2 |
| 动态 prompt 生成 | 2 天 | 中 | 解决 P0，减少维护 |
| 删除 ACTION_MAP，改用 LLM | 3 天 | 中 | 消除 86 行硬编码 |
| 删除 INTENT_TEMPLATES 正则 | 5 天 | 高 | 消除 240 行硬编码 |
| LLM 响应缓存 | 2 天 | 低 | 降低 API 成本 |
| **总计** | **~13.5 天** | | **消除 ~1061 行硬编码** |

### 9.4 产品架构师视角

#### 9.4.1 用户体验对比：硬编码 vs LLM-first

| 用户输入 | 硬编码方案 | LLM-first 方案 |
|---------|-----------|---------------|
| `pwd` | ❌ UNKNOWN（不在 ACTION_MAP） | ✅ shell_execute('pwd') |
| `帮我看看当前目录` | ❌ UNKNOWN（"看看"不是动作词） | ✅ shell_execute('ls') 或 file_find |
| `把代码推上去` | ⚠️ 可能匹配 git_push（如果"推"在 MAP 中） | ✅ git_push（理解"推上去"= push） |
| `check if tests pass` | ⚠️ 匹配 test（依赖关键词） | ✅ 理解为运行测试并检查结果 |
| `看看有没有安全漏洞` | ❌ UNKNOWN（"看看"不是动作词） | ✅ 理解为安全审计，选择合适工具 |
| `帮我写个 README` | ⚠️ 可能匹配 document | ✅ 理解为生成文档，选择 workflow_generate |
| `npm run build && npm test` | ❌ UNKNOWN（复合命令） | ✅ 理解为两个顺序执行的命令 |

#### 9.4.2 竞品对比

| 能力 | VectaHub (当前) | Aider | Claude Code | Goose |
|------|----------------|-------|-------------|-------|
| 意图理解 | 关键词匹配 | LLM 原生 | LLM 原生 | LLM 原生 |
| Shell 命令 | 不支持 | 原生支持 | 原生支持 | 原生支持 |
| 多语言 | 中英硬编码 | 任意语言 | 任意语言 | 任意语言 |
| 工具选择 | Domain 过滤 | LLM 选择 | LLM 选择 | LLM 选择 |
| 维护成本 | 高（每新增功能改代码） | 低（改 prompt） | 低（改 prompt） | 低（改 prompt） |

**结论**：VectaHub 的 NL 引擎是竞品中唯一使用硬编码方案的，这是**竞争力短板**。

#### 9.4.3 成本效益分析

| 指标 | 硬编码方案 | LLM-first 方案 |
|------|-----------|---------------|
| 每次意图分类延迟 | <1ms | 500ms-2s |
| API 调用成本 | 0 | ~$0.001/次 |
| 新增意图成本 | 改代码+发版（~2小时） | 改 prompt（~10分钟） |
| 支持新语言成本 | 添加关键词映射（~1小时） | 0（LLM 天然支持） |
| 准确率（常见输入） | ~70% | ~95% |
| 准确率（边缘输入） | ~30% | ~85% |

**建议**：采用**混合架构**——高频简单操作用缓存+规则快速响应，复杂/未知输入走 LLM。

### 9.5 安全架构师视角

#### 9.5.1 LLM-first 引入的新安全风险

| 风险类型 | 描述 | 严重程度 | 当前防护 |
|---------|------|---------|---------|
| Prompt Injection | 恶意输入操纵 LLM 选择危险工具 | 🔴 高 | ❌ 无 |
| 工具选择操纵 | LLM 被诱导调用 rm/sudo 等 | 🔴 高 | ⚠️ 部分（LLM_RESTRICTED_TOOLS） |
| 参数注入 | LLM 生成的参数包含恶意内容 | 🟠 中 | ⚠️ 部分（sandbox 检测） |
| 信息泄露 | LLM 在 reply 中泄露系统信息 | 🟡 低 | ⚠️ 部分（sanitizeReply） |

#### 9.5.2 安全加固方案

```typescript
// 方案：三层安全防护
// 第一层：LLM 输出验证（新增）
function validateLLMToolCall(toolCall: LLMToolCall): ValidationResult {
  const { name, arguments: args } = toolCall.function;

  // 1. 工具白名单检查
  const ALLOWED_TOOLS = new Set([...getAllIntentNames(), ...SHELL_TOOLS, ...AGENT_TOOLS]);
  if (!ALLOWED_TOOLS.has(name)) {
    return { valid: false, reason: `Unknown tool: ${name}` };
  }

  // 2. 参数安全检查
  const parsed = JSON.parse(args);
  if (typeof parsed.command === 'string') {
    const detection = detector.detect(parsed.command);
    if (detection.isDangerous && detection.level === 'critical') {
      return { valid: false, reason: `Dangerous command: ${detection.reason}` };
    }
  }

  return { valid: true };
}

// 第二层：Sandbox 执行（已有，不需要改）
// SandboxManager.exec() 会在执行前再次检测命令安全性

// 第三层：审计日志（已有，不需要改）
// AuditHelper 会记录所有 LLM 调用和命令执行
```

#### 9.5.3 安全 Trade-off 分析

| 维度 | 硬编码方案 | LLM-first 方案 |
|------|-----------|---------------|
| 工具选择安全性 | ✅ 白名单严格控制 | ⚠️ LLM 可能选择危险工具（需加固） |
| 参数安全性 | ⚠️ 无参数验证 | ⚠️ LLM 生成的参数需验证（需加固） |
| Prompt Injection | ✅ 不存在（无 LLM 调用） | 🔴 新增风险（需防护） |
| 审计完整性 | ✅ 完整 | ✅ 完整（审计层不变） |
| 安全边界清晰度 | ✅ 工具列表即边界 | ⚠️ 需要额外的验证层 |

**结论**：LLM-first 方案需要新增 **LLM 输出验证层**，但现有的 sandbox 层已经提供了强大的第二道防线。总体安全水平可以通过加固达到与硬编码方案相当的水平。

### 9.6 综合建议：LLM-first 架构演进路线图

#### 阶段零：立即修复（1 天）— 不改变架构

保持现有硬编码架构，仅修复阻断性缺陷：

- [ ] P0：BUILTIN_PROMPTS 添加 `nl-processor-tool-calling`
- [ ] P1：`buildAllTools` 在 `domains=[]` 时返回全量工具（而非空数组）
- [ ] P2：ACTION_MAP 添加 `pwd`, `ls`, `echo`, `cat`, `mkdir` 等基础 shell 命令

#### 阶段一：LLM 工具层（3 天）— 最小化改造

引入 LLM-first 的核心能力，不删除现有硬编码：

- [ ] 新增 `shell_execute` 通用工具定义
- [ ] `buildAllTools` 默认不按 domain 过离（改为可选参数）
- [ ] 新增 `LLMOutputValidator` 验证 LLM 工具调用的安全性
- [ ] `convertToolCallToSteps` 支持 `shell_execute` 类型

#### 阶段二：混合架构（5 天）— 渐进式替换

引入"规则优先 + LLM 降级"的混合策略：

```typescript
async function processInputHybrid(input: string): Promise<NLResult> {
  // 1. 快速路径：规则匹配（<1ms）
  const ruleResult = tryRuleMatch(input);
  if (ruleResult.confidence > 0.9) {
    return ruleResult;  // 高置信度直接返回
  }

  // 2. 缓存路径：语义缓存（<10ms）
  const cached = await llmCache.get(input);
  if (cached) {
    return cached;
  }

  // 3. LLM 路径：完整 LLM 调用（500ms-2s）
  const llmResult = await processInputLLM(input);
  await llmCache.set(input, llmResult);
  return llmResult;
}
```

- [ ] 实现 `processInputHybrid` 混合处理器
- [ ] 引入 LLM 响应缓存（embedding 相似度匹配）
- [ ] 将 ACTION_MAP 降级为"快速路径"，LLM 作为"降级路径"
- [ ] 动态 prompt 生成替代静态 BUILTIN_PROMPTS

#### 阶段三：全面 LLM-first（5 天）— 架构升级

删除大部分硬编码，全面转向 LLM-first：

- [ ] 删除 ACTION_MAP、SCOPE_MAP、DOMAIN_KEYWORDS
- [ ] 删除 INTENT_TEMPLATES 中的正则表达式（保留结构化元数据）
- [ ] 删除 LLM_SAFE_TOOLS / LLM_RESTRICTED_TOOLS（由 sandbox 统一管理）
- [ ] 删除 NEGATION_PATTERNS（LLM 天然理解否定）
- [ ] 保留 CATEGORY_MAP 和 CATEGORY_METADATA（轻量级，维护成本低）
- [ ] LLM 响应缓存达到 80%+ 命中率

#### 阶段四：自进化（持续）— 智能优化

引入 prompt 自优化和能力自发现：

- [ ] Prompt 效果追踪：自动记录每个 prompt 的成功率，淘汰低效 prompt
- [ ] 能力自发现：通过 `CapabilityDiscovery` 动态注册新工具
- [ ] 用户反馈循环：用户纠正 → 自动更新 prompt 示例
- [ ] A/B 测试框架：对比不同 prompt 版本的效果

### 9.7 架构对比总结

```
┌─────────────────────────────────────────────────────────────────┐
│                    架构演进对比                                    │
├──────────────┬─────────────────┬─────────────────────────────────┤
│     维度      │   当前硬编码方案   │       LLM-first 方案            │
├──────────────┼─────────────────┼─────────────────────────────────┤
│ 意图理解      │ 关键词匹配 ~70%  │ LLM 理解 ~95%                   │
│ Shell 支持    │ ❌ 不支持        │ ✅ 原生支持                      │
│ 多语言        │ 中英硬编码       │ 任意语言                         │
│ 新增意图成本   │ 改代码+发版      │ 改 prompt                        │
│ 维护代码量    │ ~1061 行硬编码   │ ~100 行工具定义                   │
│ 延迟          │ <1ms            │ 500ms-2s（缓存后 <10ms）         │
│ API 成本      │ 0               │ ~$0.001/次（缓存后趋近 0）        │
│ 安全性        │ 白名单严格       │ sandbox 验证（需新增输出验证）      │
│ 离线可用      │ ✅ 完全可用      │ ⚠️ 规则路径可用，LLM 路径不可用   │
│ 竞争力        │ ❌ 落后          │ ✅ 对齐竞品                       │
└──────────────┴─────────────────┴─────────────────────────────────┘
```

### 9.8 关键决策点

| 决策 | 选项 A（保守） | 选项 B（推荐） | 选项 C（激进） |
|------|--------------|--------------|--------------|
| 架构策略 | 仅修复缺陷 | 混合架构 | 全面 LLM-first |
| 改造工作量 | 1 天 | 9 天 | 14 天 |
| 风险等级 | 低 | 中 | 高 |
| 竞争力提升 | 无 | 显著 | 最大 |
| 推荐场景 | 短期修复 | 中期演进 | 长期目标 |

**推荐路径**：阶段零（立即）→ 阶段一（第 1-2 周）→ 阶段二（第 3-4 周）→ 阶段三（第 5-6 周）→ 阶段四（持续）

---

## 十、Skill / MCP / Rule 自定义支持 + 工作流集成

> **核心问题**：当前 Skill、Rule、MCP 都是内置的，不支持用户自定义；工作流引擎也无法调用这些能力。

### 10.1 现状分析

#### 10.1.1 Skill 系统现状

当前 `SkillRegistry` 已有基础框架，但存在以下限制：

| 能力 | 当前状态 | 问题 |
|------|---------|------|
| 内置 Skill | ✅ 有（command-skill, intent-skill, pipeline-skill, workflow-skill） | 只有 4 个内置 skill |
| 自定义 Skill | ❌ 不支持 | 用户无法添加自己的 skill |
| Skill 发现 | ⚠️ 框架存在但未实现 | `scanForSkills()` 返回空数组 |
| Skill 市场 | ❌ 不存在 | 无法共享/安装社区 skill |
| 工作流调用 Skill | ❌ 不支持 | 工作流步骤只能执行 shell 命令 |

#### 10.1.2 Rule 系统现状

`SecurityRuleStore` 已支持自定义规则的 CRUD，但：

| 能力 | 当前状态 | 问题 |
|------|---------|------|
| 内置规则 | ✅ 有（20+ 条安全规则） | 覆盖面广 |
| 自定义安全规则 | ✅ 有 API 和 CLI 入口 | 当前仅覆盖安全规则体系 |
| 规则导入/导出 | ✅ 支持 JSON 文件 | 但无在线规则市场 |
| 规则类型 | ⚠️ 只有安全规则 | 缺少：业务规则、工作流规则、NL 规则 |
| 工作流使用规则 | ❌ 不支持 | 工作流无法引用规则做条件判断 |

#### 10.1.3 MCP 现状

| 能力 | 当前状态 | 问题 |
|------|---------|------|
| MCP 支持 | ❌ 完全不存在 | 无法连接外部 MCP 服务器 |
| MCP 工具发现 | ❌ 不存在 | 无法自动发现 MCP 提供的工具 |
| NL 引擎集成 | ❌ 不支持 | NL 引擎无法调用 MCP 工具 |
| 工作流集成 | ❌ 不支持 | 工作流步骤无法调用 MCP 工具 |

### 10.2 架构设计：统一能力注册表

**核心思路**：将 Skill、MCP、Rule 统一抽象为"能力（Capability）"，通过统一的注册表管理。

```
┌─────────────────────────────────────────────────────────────────┐
│                    统一能力注册表 (CapabilityRegistry)              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Skill   │  │   MCP    │  │   Rule   │  │  Agent   │        │
│  │ Adapter  │  │  Adapter │  │  Adapter │  │  Adapter │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │              │              │              │              │
│  ┌────┴──────────────┴──────────────┴──────────────┴─────┐      │
│  │              Capability Interface                      │      │
│  │  - id, name, type, description                        │      │
│  │  - canHandle(context): boolean                        │      │
│  │  - execute(input, context): Result                    │      │
│  │  - toLLMTool(): LLMTool                              │      │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   NL Engine            Workflow Engine      CLI Commands
   (工具选择)           (步骤执行)           (用户管理)
```

### 10.3 自定义 Skill 支持

#### 10.3.1 Skill 定义格式

```yaml
# .vectahub/skills/my-custom-skill.yaml
id: my-custom-skill
name: "代码审查助手"
version: "1.0.0"
description: "自动审查代码质量和安全问题"
category: "code-quality"
tags: ["review", "security", "quality"]

# 触发条件
triggers:
  - intent: "review_code"
  - keywords: ["审查", "review", "检查代码"]
  - patterns: ["review\\s+(this|my|the)\\s+code"]

# 执行方式（三选一）
execution:
  # 方式1: Shell 命令
  type: shell
  command: "eslint --ext .ts,.js {{file}}"
  
  # 方式2: LLM 调用
  # type: llm
  # prompt: "请审查以下代码的质量和安全性：\n{{code}}"
  # model: "gpt-4"
  
  # 方式3: 工作流
  # type: workflow
  # workflow_id: "code-review-workflow"

# 输出格式
output:
  format: "text"  # text | json | markdown
  parse: true     # 是否解析为结构化数据

# 安全配置
security:
  sandbox: true
  timeout: 30000
  allowed_commands: ["eslint", "prettier"]
```

#### 10.3.2 Skill CLI 命令

```bash
# 创建 skill
vectahub skill create my-skill --template code-review

# 列出已安装的 skill
vectahub skill list

# 安装社区 skill
vectahub skill install @vectahub/code-review

# 启用/禁用 skill
vectahub skill enable my-skill
vectahub skill disable my-skill

# 测试 skill
vectahub skill test my-skill --input "review this code"

# 删除 skill
vectahub skill remove my-skill
```

#### 10.3.3 Skill 注册到 NL 引擎

```typescript
// 自动将 Skill 转换为 LLM Tool
function skillToLLMTool(skill: Skill): LLMTool {
  return {
    type: 'function',
    function: {
      name: skill.id,
      description: skill.description,
      parameters: skill.parameters || {
        type: 'object',
        properties: {
          input: { type: 'string', description: '用户输入' }
        }
      }
    }
  };
}

// NL 引擎自动发现所有已注册的 Skill
const tools = [
  ...buildIntentTools(),
  ...buildShellTools(),
  ...skillRegistry.list().map(skillToLLMTool),  // ← 自动包含自定义 Skill
];
```

### 10.4 自定义 Rule 支持

#### 10.4.1 Rule 类型扩展

```typescript
// 当前只有 SecurityRule，需要扩展为通用 Rule 体系
interface Rule {
  id: string;
  name: string;
  description: string;
  type: 'security' | 'workflow' | 'nl' | 'business';
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  enabled: boolean;
  source: 'builtin' | 'custom' | 'community';
  
  // 触发条件
  conditions: RuleCondition[];
  
  // 执行动作
  actions: RuleAction[];
}

interface RuleCondition {
  type: 'pattern' | 'expression' | 'llm' | 'time' | 'context';
  value: string;
  operator?: 'match' | 'contains' | 'equals' | 'gt' | 'lt';
}

interface RuleAction {
  type: 'block' | 'allow' | 'transform' | 'notify' | 'log' | 'execute';
  value: string;
}
```

#### 10.4.2 Rule 类型示例

```yaml
# 安全规则（已有）
- id: rule-rm-root
  type: security
  conditions:
    - type: pattern
      value: "^rm\\s+.*-rf.*\\s+/"
  actions:
    - type: block

# 工作流规则（新增）
- id: rule-deploy-approval
  type: workflow
  conditions:
    - type: context
      value: "step.name == 'deploy' && env.ENV == 'production'"
  actions:
    - type: notify
      value: "生产环境部署需要审批"
    - type: block

# NL 规则（新增）
- id: rule-nl-chinese-preference
  type: nl
  conditions:
    - type: context
      value: "user.language == 'zh-CN'"
  actions:
    - type: transform
      value: "response.language = 'zh-CN'"

# 业务规则（新增）
- id: rule-cost-limit
  type: business
  conditions:
    - type: expression
      value: "llm.cost > 10"  # 单次调用超过 $10
  actions:
    - type: block
    - type: notify
      value: "LLM 调用成本超限"
```

#### 10.4.3 Rule CLI 命令

```bash
# 当前已有安全规则 CLI
vectahub security add --name "Block rm -rf /" --pattern "^rm\\s+-rf\\s+/"
vectahub security list
vectahub security import ./my-rules.json
vectahub security export ./backup-rules.json
vectahub security test "rm -rf /"
vectahub security enable rule-rm-root
vectahub security disable rule-rm-root

# 后续如引入通用 Rule 体系，可再评估是否新增 rule 命令命名空间。
```

### 10.5 MCP 支持

#### 10.5.1 MCP 配置格式

```json
// .vectahub/mcp.json
{
  "servers": [
    {
      "id": "github-mcp",
      "name": "GitHub MCP Server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "capabilities": ["tools", "resources"]
    },
    {
      "id": "filesystem-mcp",
      "name": "Filesystem MCP Server",
      "transport": "stdio", 
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "capabilities": ["tools"]
    },
    {
      "id": "custom-mcp",
      "name": "Custom MCP Server",
      "transport": "sse",
      "url": "http://localhost:3000/mcp",
      "capabilities": ["tools", "prompts"]
    }
  ]
}
```

#### 10.5.2 MCP CLI 命令

```bash
# 添加 MCP 服务器
vectahub mcp add github --transport stdio --command "npx -y @modelcontextprotocol/server-github"

# 列出 MCP 服务器
vectahub mcp list

# 列出 MCP 提供的工具
vectahub mcp tools github

# 测试 MCP 工具
vectahub mcp call github search_repos --args '{"query": "typescript"}'

# 启用/禁用 MCP 服务器
vectahub mcp enable github
vectahub mcp disable github

# 移除 MCP 服务器
vectahub mcp remove github
```

#### 10.5.3 MCP 集成到 NL 引擎

```typescript
// MCP 工具自动注册到 NL 引擎
async function buildMCPTools(): Promise<LLMTool[]> {
  const servers = await mcpManager.getEnabledServers();
  const tools: LLMTool[] = [];
  
  for (const server of servers) {
    const serverTools = await server.listTools();
    for (const tool of serverTools) {
      tools.push({
        type: 'function',
        function: {
          name: `mcp_${server.id}_${tool.name}`,
          description: `[MCP:${server.name}] ${tool.description}`,
          parameters: tool.inputSchema
        }
      });
    }
  }
  
  return tools;
}

// NL 引擎工具列表
const tools = [
  ...buildIntentTools(),
  ...buildShellTools(),
  ...skillRegistry.list().map(skillToLLMTool),
  ...await buildMCPTools(),  // ← 自动包含 MCP 工具
];
```

### 10.6 工作流引擎集成

#### 10.6.1 新增步骤类型

```yaml
# 工作流 YAML 支持新的步骤类型
name: "代码审查工作流"
steps:
  # 已有：shell 命令
  - id: lint
    type: exec
    cli: eslint
    args: ["--ext", ".ts", "src/"]

  # 新增：调用 Skill
  - id: review
    type: skill
    skill_id: "code-review-skill"
    input:
      file: "{{lint.output.file}}"
      rules: ["security", "performance"]

  # 新增：调用 MCP 工具
  - id: create-issue
    type: mcp
    server: "github-mcp"
    tool: "create_issue"
    args:
      title: "Code Review Issues"
      body: "{{review.output.markdown}}"
      repo: "{{repo.name}}"

  # 新增：应用规则
  - id: check-security
    type: rule
    rule_id: "security-check"
    input: "{{review.output}}"
    on_fail: "block"

  # 新增：LLM 调用
  - id: summarize
    type: llm
    prompt: "总结以下审查结果：\n{{review.output}}"
    model: "gpt-4"
    output_var: "summary"

  # 已有：条件判断
  - id: deploy-decision
    type: if
    condition: "{{review.output.critical_count}} == 0"
    then:
      - id: deploy
        type: exec
        cli: npm
        args: ["run", "deploy"]
    else:
      - id: notify
        type: mcp
        server: "slack-mcp"
        tool: "send_message"
        args:
          channel: "#dev"
          text: "代码审查发现关键问题，部署已取消"
```

#### 10.6.2 工作流 Handler 扩展

```typescript
// 新增 Skill Handler
export const createSkillHandler = (deps: HandlerDependencies): StepHandler => {
  return async (step, options, context, executeStep, startTime) => {
    const skill = skillRegistry.get(step.skill_id!);
    if (!skill) {
      return { stepId: step.id, status: 'FAILED', error: `Skill not found: ${step.skill_id}` };
    }

    const input = interpolateObject(step.input || {}, context);
    const skillContext: SkillContext = {
      userInput: JSON.stringify(input),
      projectContext: { cwd: options.cwd },
    };

    const result = await skill.execute(input, skillContext);
    
    return {
      stepId: step.id,
      status: result.success ? 'COMPLETED' : 'FAILED',
      output: result.data ? [JSON.stringify(result.data)] : [],
      error: result.error,
      duration: Date.now() - startTime,
    };
  };
};

// 新增 MCP Handler
export const createMCPHandler = (deps: HandlerDependencies): StepHandler => {
  return async (step, options, context, executeStep, startTime) => {
    const server = mcpManager.getServer(step.server!);
    if (!server) {
      return { stepId: step.id, status: 'FAILED', error: `MCP server not found: ${step.server}` };
    }

    const args = interpolateObject(step.args || {}, context);
    const result = await server.callTool(step.tool!, args);

    return {
      stepId: step.id,
      status: result.isError ? 'FAILED' : 'COMPLETED',
      output: result.content.map(c => c.text || JSON.stringify(c)),
      error: result.isError ? 'MCP tool returned error' : undefined,
      duration: Date.now() - startTime,
    };
  };
};

// 新增 Rule Handler
export const createRuleHandler = (deps: HandlerDependencies): StepHandler => {
  return async (step, options, context, executeStep, startTime) => {
    const rule = ruleStore.getRuleById(step.rule_id!);
    if (!rule) {
      return { stepId: step.id, status: 'FAILED', error: `Rule not found: ${step.rule_id}` };
    }

    const input = interpolateObject(step.input || {}, context);
    const evaluator = ruleEvaluatorFactory.create(rule.type);
    const result = await evaluator.evaluate(rule, input, context);

    return {
      stepId: step.id,
      status: result.passed ? 'COMPLETED' : 'FAILED',
      output: [JSON.stringify(result)],
      error: result.passed ? undefined : `Rule check failed: ${result.reason}`,
      duration: Date.now() - startTime,
    };
  };
};

// 新增 LLM Handler
export const createLLMHandler = (deps: HandlerDependencies): StepHandler => {
  return async (step, options, context, executeStep, startTime) => {
    const prompt = interpolateString(step.prompt!, context);
    const model = step.model || 'gpt-4';

    const response = await llmClient.complete(model, prompt, context.variables);

    return {
      stepId: step.id,
      status: 'COMPLETED',
      output: [response.content],
      duration: Date.now() - startTime,
    };
  };
};
```

### 10.7 实现路线图

#### 阶段一：Rule 自定义支持（1 周）

- [ ] 扩展 Rule 类型（security → security/workflow/nl/business）
- [ ] 扩展现有 `security` CLI 或新增通用 Rule CLI（create/list/enable/disable/import/export）
- [ ] 工作流引擎添加 `rule` 步骤类型
- [ ] NL 引擎集成 NL 类型规则

#### 阶段二：Skill 自定义支持（2 周）

- [ ] 定义 Skill YAML 格式规范
- [ ] 实现 `scanForSkills()` 真正的文件系统扫描
- [ ] 添加 Skill CLI 命令（create/list/install/enable/disable/remove）
- [ ] Skill 自动转换为 LLM Tool
- [ ] 工作流引擎添加 `skill` 步骤类型
- [ ] NL 引擎自动发现并使用自定义 Skill

#### 阶段三：MCP 支持（2 周）

- [ ] 实现 MCP 客户端（stdio 和 SSE 传输）
- [ ] 添加 MCP 配置文件支持（.vectahub/mcp.json）
- [ ] 添加 MCP CLI 命令（add/list/tools/call/enable/disable/remove）
- [ ] MCP 工具自动注册到 NL 引擎
- [ ] 工作流引擎添加 `mcp` 步骤类型
- [ ] MCP 资源（resources）集成

#### 阶段四：LLM 步骤 + 统一能力注册表（1 周）

- [ ] 工作流引擎添加 `llm` 步骤类型
- [ ] 实现 `CapabilityRegistry` 统一管理 Skill/MCP/Rule/Agent
- [ ] NL 引擎使用 `CapabilityRegistry` 构建工具列表
- [ ] 能力发现和自动注册

#### 阶段五：生态建设（持续）

- [ ] Skill/Rule 市场（在线共享）
- [ ] 社区 MCP 服务器目录
- [ ] 能力组合模板
- [ ] 能力版本管理和更新

### 10.8 架构对比总结

```
┌─────────────────────────────────────────────────────────────────┐
│                    能力支持对比                                    │
├──────────────┬─────────────────┬─────────────────────────────────┤
│     能力      │     当前状态     │       目标状态                   │
├──────────────┼─────────────────┼─────────────────────────────────┤
│ 内置 Skill   │ 4 个            │ 4 个 + 无限自定义               │
│ 自定义 Skill │ ❌ 不支持       │ ✅ YAML 定义 + CLI 管理          │
│ Skill 市场   │ ❌ 不存在       │ ✅ 在线共享/安装                 │
│ 内置 Rule    │ 20+ 安全规则    │ 20+ + 无限自定义                │
│ 自定义 Rule  │ ✅ 安全规则有 CLI│ ✅ CLI + YAML 定义              │
│ Rule 类型    │ 只有 security   │ security/workflow/nl/business   │
│ MCP 支持     │ ❌ 不存在       │ ✅ stdio/sse 传输               │
│ MCP CLI      │ ❌ 不存在       │ ✅ 完整 CLI 管理                │
│ WF 调用 Skill│ ❌ 不支持       │ ✅ type: skill 步骤             │
│ WF 调用 MCP  │ ❌ 不支持       │ ✅ type: mcp 步骤               │
│ WF 调用 Rule │ ❌ 不支持       │ ✅ type: rule 步骤              │
│ WF 调用 LLM  │ ❌ 不支持       │ ✅ type: llm 步骤               │
│ NL 使用 Skill│ ❌ 不支持       │ ✅ 自动转换为 LLM Tool          │
│ NL 使用 MCP  │ ❌ 不支持       │ ✅ 自动注册 MCP 工具            │
└──────────────┴─────────────────┴─────────────────────────────────┘
```

### 10.9 竞品对比

| 能力 | VectaHub (目标) | Aider | Claude Code | Goose | Dify |
|------|----------------|-------|-------------|-------|------|
| 自定义 Skill | ✅ YAML + CLI | ❌ | ❌ | ❌ | ✅ 可视化 |
| 自定义 Rule | ✅ 多类型 | ❌ | ❌ | ❌ | ⚠️ 有限 |
| MCP 支持 | ✅ stdio/sse | ❌ | ✅ | ✅ | ⚠️ 有限 |
| 工作流引擎 | ✅ DAG + 多步骤类型 | ❌ | ❌ | ❌ | ✅ 可视化 |
| NL 集成 | ✅ LLM Tool Calling | ✅ | ✅ | ✅ | ✅ |
| CLI 优先 | ✅ | ✅ | ✅ | ✅ | ❌ Web |

**差异化优势**：VectaHub 将成为**唯一**同时支持 Skill/MCP/Rule 自定义 + 工作流引擎 + NL 集成的 CLI 工具。

---

**文档状态**: v3.1 - 已按当前源码和本地验证结果校正
**下次评审**: P0 缺陷修复后
**负责人**: VectaHub 团队
