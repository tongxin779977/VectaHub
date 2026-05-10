# 实施指南：LLM 自举系统

```yaml
document: implementation-guide
version: 1.0.0
date: 2026-05-10
status: draft
scope: Phase 4-6 的逐文件实施细节
related:
  - llm-self-bootstrap-feasibility.md
  - llm-self-bootstrap-design.md
  - llm-self-bootstrap-roadmap.md
  - llm-self-bootstrap-issues.md
```

---

## 1. 实施原则

1. **每次改动后必须验证**：`npx tsc --noEmit` + `npx vitest run`
2. **小步提交**：每个任务完成后独立可验证
3. **不修改安全层和执行层**：参见设计文档第 7.2 节不变模块清单
4. **遵循现有代码风格**：TypeScript ES2022、NodeNext、工厂函数模式
5. **不添加注释**：除非被明确要求

---

## 2. Phase 4 实施细节

### 2.1 任务 4.1：删除 SYNONYM_MAP

**文件**：`src/nl/core/input-normalizer.ts`

**当前代码**（第 3-19 行）：
```typescript
const SYNONYM_MAP: Record<string, string> = {
  '修': 'repair', '修复': 'repair', '修好': 'repair', '修绿': 'repair', '修理': 'repair',
  '处理': 'repair', '解决': 'repair', '搞定': 'repair',
  '提交': 'git', '推送': 'push', '拉取': 'pull',
  // ... 省略
};
```

**删除内容**：
1. 删除 `SYNONYM_MAP` 常量定义（第 3-19 行）
2. 删除 `normalizeInput()` 中使用 SYNONYM_MAP 的逻辑（第 46-63 行）
3. `normalizeInput()` 简化为：清理文本 + regex 实体提取

**新 `normalizeInput()` 实现**：
```typescript
export function normalizeInput(rawInput: string): NormalizedInput {
  const cleanText = rawInput.toLowerCase().trim().replace(/\s+/g, ' ');
  const entities: NormalizedInput['entities'] = {};

  const runIds = extractRunIds(cleanText);
  if (runIds.length > 0) entities.githubActionRunIds = runIds;

  const urls = extractUrls(cleanText);
  if (urls.length > 0) entities.githubActionUrls = urls;

  const commitShas = extractCommitShas(cleanText);
  if (commitShas.length > 0) entities.commitShas = commitShas;

  const filePaths = extractFilePaths(cleanText);
  if (filePaths.length > 0) entities.filePaths = filePaths;

  const tokens = cleanText.split(/[\s,，.。!！?？、]+/).filter(Boolean);

  return {
    rawText: rawInput,
    cleanText,
    tokens,
    normalizedTerms: tokens,
    entities,
  };
}
```

**测试修改**：
- 更新 `input-normalizer.test.ts` 中依赖 SYNONYM_MAP 的期望值
- 确保 regex 提取测试不受影响

**验证**：
```bash
npx tsc --noEmit && npx vitest run src/nl/core/input-normalizer.test.ts
```

---

### 2.2 任务 4.2：PromptManager 动态选择

**文件**：`src/nl/prompt-manager.ts`

**新增方法**：
```typescript
selectBest(input: string, category?: Prompt['category']): string {
  const candidates = this.list(category);
  if (candidates.length === 0) {
    return 'intent-parser-v1';
  }

  const maxUses = Math.max(...candidates.map(p => p.metadata.uses), 1);

  const scored = candidates.map(prompt => {
    const effectivenessScore = prompt.metadata.effectiveness;
    const usageScore = prompt.metadata.uses / maxUses;
    return {
      id: prompt.id,
      score: effectivenessScore * 0.7 + usageScore * 0.3,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}
```

**集成点**：
- `buildSystemPrompt()` 中当 `promptId` 为空时调用 `selectBest()`

---

### 2.3 任务 4.3：PromptManager effectiveness 追踪

**文件**：`src/nl/prompt-manager.ts`

**新增属性和方法**：
```typescript
class PromptManager {
  private outcomes: Map<string, boolean[]> = new Map();

  recordOutcome(promptId: string, success: boolean): void {
    const history = this.outcomes.get(promptId) ?? [];
    history.push(success);
    if (history.length > 100) {
      history.shift();
    }
    this.outcomes.set(promptId, history);

    const recent = history.slice(-20);
    const recentRate = recent.filter(Boolean).length / recent.length;
    const overallRate = history.filter(Boolean).length / history.length;
    const newEffectiveness = recentRate * 0.8 + overallRate * 0.2;

    const prompt = this.get(promptId);
    if (prompt) {
      prompt.metadata.effectiveness = newEffectiveness;
      this.update(prompt);
    }
  }
}
```

**集成点**：
- LLM 调用成功/失败后调用 `recordOutcome()`
- 任务执行结果回调中调用 `recordOutcome()`

---

### 2.4 任务 4.4：ContextManager 摘要生成

**文件**：`src/nl/session-manager.ts`

**新增方法**：
```typescript
interface ContextManager {
  summarizeIfNeeded(sessionId: string, llmAdapter: LLMAdapter): Promise<void>;
  getCompactContext(sessionId: string): string;
  estimateTokens(text: string): number;
}
```

**摘要生成流程**：
```
1. 检查 session.history.length > 10 或 estimateTokens(history) > 3000
2. 取出需要摘要的消息（排除最近 5 轮）
3. 调用 LLM 生成摘要（使用 summary prompt）
4. 用摘要替换原始消息
5. 保留最近 5 轮原始对话
```

**摘要 Prompt**：
```
你是一个对话摘要专家。请将以下对话压缩为简洁的摘要，保留：
1. 用户的主要目标
2. 已经完成的操作
3. 当前的状态和待办事项

请用中文输出，不超过 200 字。
```

---

### 2.5 任务 4.5：Token 估算

**文件**：`src/nl/session-manager.ts`

**实现**：
```typescript
estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const codeBlocks = (text.match(/```[\s\S]*?```/g) ?? []).join('').length;
  const remainingLength = text.length - chineseChars - codeBlocks;

  const chineseTokens = Math.ceil(chineseChars * 0.67);
  const codeTokens = Math.ceil(codeBlocks / 3);
  const englishTokens = Math.ceil(remainingLength / 4);

  return chineseTokens + codeTokens + englishTokens;
}
```

---

### 2.6 任务 4.6：DynamicToolRegistry

**新建文件**：`src/nl/dynamic-tool-registry.ts`

**核心接口**：
```typescript
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface DynamicToolRegistry {
  discover(): Promise<ToolDefinition[]>;
  findRelevant(query: string, limit?: number): Promise<ToolDefinition[]>;
  registerUserTool(tool: UserToolDefinition): void;
  getToolSchema(): ToolDefinition[];
}
```

**从 known-tools 自动映射**：
```typescript
function knownToolToFunctionTool(tool: KnownTool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: `run_${tool.name.replace(/[^a-z0-9]/g, '_')}`,
      description: `Execute ${tool.name} command`,
      parameters: {
        type: 'object',
        properties: {
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments',
          },
        },
        required: ['args'],
      },
    },
  };
}
```

**工厂函数**：
```typescript
function createDynamicToolRegistry(): DynamicToolRegistry;
```

**边界**：DynamicToolRegistry 只暴露结构化 tool schema 给 LLM。LLM 调用 tool 后，
不能直接把 tool name 当成 CLI 命令执行，必须进入 Phase 6 的 Intent-to-Workflow Mapping。

---

### 2.7 任务 4.7：SkillRegistry LLM 语义匹配

**文件**：`src/skills/registry.ts`

**增强 `findApplicableSkills()`**：
```typescript
async findApplicableSkills(
  context: SkillContext,
  llmAdapter?: LLMAdapter,
): Promise<Skill[]> {
  const candidates: Skill[] = [];
  for (const skill of this.skills.values()) {
    const meta = this.metadata.get(skill.id);
    if (meta?.enabled === false) continue;
    if (await skill.canHandle(context)) {
      candidates.push(skill);
    }
  }

  if (llmAdapter && candidates.length > 1) {
    return this.rankByLLM(candidates, context, llmAdapter);
  }

  return candidates.sort((a, b) => b.tags.length - a.tags.length);
}

private async rankByLLM(
  candidates: Skill[],
  context: SkillContext,
  llmAdapter: LLMAdapter,
): Promise<Skill[]> {
  const skillDescriptions = candidates
    .map((s, i) => `[${i}] ${s.id}: ${s.tags.join(', ')}`)
    .join('\n');

  const prompt = `根据用户输入，从以下技能中选择最相关的 3 个，返回 JSON 数组 [索引]：
${skillDescriptions}

用户输入: ${context.userInput}`;

  const response = await llmAdapter.complete(prompt);
  const indices: number[] = JSON.parse(response);
  return indices
    .filter(i => i >= 0 && i < candidates.length)
    .map(i => candidates[i]);
}
```

---

## 3. Phase 5 实施细节

### 3.1 任务 5.1：Confidence 校准

**新建文件**：`tests/calibration/confidence-calibration.test.ts`

**测试数据结构**：
```typescript
interface CalibrationCase {
  input: string;
  expectedIntent: string;
  expectedConfidenceLevel: 'exact' | 'high' | 'medium' | 'low';
}
```

**校准流程**：
1. 准备 50+ 校准用例
2. 运行 pipeline，记录 LLM 输出的 confidence
3. 对比 `classifyConfidence()` 的分级结果
4. 如果偏差 > 10%，调整 prompt 中的置信度引导或阈值

### 3.2 任务 5.2：等价性测试

**新建文件**：`tests/equivalence/domain-conflict-equivalence.test.ts`

**关键测试场景**：
```typescript
const conflictCases = [
  {
    input: 'git commit 并运行测试',
    expectedIntents: ['GIT_WORKFLOW', 'RUN_TESTS'],
    expectedOrder: 'parallel',
  },
  {
    input: '修复 CI 失败后提交',
    expectedIntents: ['CI_CD_WORKFLOW', 'GIT_WORKFLOW'],
    expectedOrder: 'sequential',
  },
];
```

### 3.3 任务 5.3：性能基准

**新建目录**：`benchmarks/`

**新建文件**：`benchmarks/llm-pipeline.bench.ts`

**基准场景**：
| 场景 | 输入 | 目标 p95 |
|------|------|---------|
| 简单意图 | "git commit" | < 1s |
| 中等意图 | "修复最近一次 CI 失败" | < 2s |
| 复杂意图 | "分析代码质量并生成报告" | < 3s |

---

## 4. Phase 6 实施细节

### 4.0 Phase 6 多 Agent 并行执行计划

Phase 6 可以拆给多个 agent 并行执行，但每个 agent 必须有明确产出、完成信号和下游依赖。
不要让多个 agent 同时修改 `src/nl/core/pipeline.ts` 和 `src/nl/tool-calling.ts`；
这两个主链路文件由 Agent B 统一收口。

| Agent | 负责范围 | 产出文件 | 完成信号 | 下游依赖 |
|------|----------|----------|----------|----------|
| A | Intent-to-Workflow Mapping | `src/nl/intent-step-mapping.ts`、测试、映射配置 | `createIntentStepMapper()` 可用；mapper 单测通过 | B、D |
| B | Tool Calling + Pipeline 接入 | `src/nl/tool-calling.ts`、`src/nl/core/pipeline.ts`、相关测试 | `git_commit` tool call 可生成 workflow YAML；未知 intent 抛错 | D、C |
| C | LLMOrchestrator 薄编排层 | `src/nl/llm-orchestrator.ts`、测试 | `ask()` 可调用 prompt/context/tools/LLM 并返回 `traceId` | B 或后续集成 |
| D | 测试、回归与验收 | 回归测试、验收清单 | 主链路回归通过；失败项能归属到 A/B/C | 所有人 |

依赖图：

```
A: mapper 接口稳定
  ↓
B: 接入 tool-calling / pipeline
  ↓
D: 主链路验收
  ↑
C: Orchestrator 可并行开发，最后由 B 或后续集成
```

#### Agent A 完成信号

- 导出 `createIntentStepMapper()`。
- 支持 `git_commit`、`git_push`、`git_pull`、`git_branch`、`git_merge`、`tool_run`。
- `git_commit` 能生成 `cli: git` 和 `args: ['commit', '-m', message]`。
- 未知 intent、缺少 required 参数、未授权 CLI 都会失败。
- 带空格参数保持为单个 `args` 元素。
- 通过 `src/nl/intent-step-mapping.test.ts` 和 `npm run typecheck`。

#### Agent B 完成信号

- `buildToolsFromTemplates()` 返回非空工具列表，并包含 `git_commit` 等模板 tool。
- `convertToolCallToSteps()` 不再把 intent 名称直接当 CLI 命令。
- 普通 intent tool call 通过 Agent A 的 mapper 生成 workflow step。
- `cli_*` tool call 仍经过允许列表和安全边界。
- LLM 无结果、未知 intent、非法 JSON arguments、空输入都会抛错。
- 通过 tool-calling / pipeline targeted tests 和 `npm run typecheck`。

#### Agent C 完成信号

- 导出 `createLLMOrchestrator()` 或等价工厂函数。
- `ask()` 负责 prompt、context、tools、LLM 调用和最小 trace。
- 返回结果包含 `traceId`、`latencyMs`，token usage 可选。
- LLM 报错时向上抛错，不吞错。
- 不实现长期 RAG、复杂 A/B 测试或语义安全层。

#### Agent D 完成信号

- 覆盖 `LLM tool call → mapper → workflow step` 主链路。
- 覆盖 `git_commit`、`git_push`、未知 intent、缺少 required 参数、非法 JSON、危险 CLI。
- 验证 pipeline 不再通过 `UNKNOWN` 表示降级。
- 测试失败时标注 owner：A（mapper）、B（接入）、C（orchestrator）。
- 最终给出是否满足“可执行闭环”的结论。

#### 当前验收结果

- ✅ ABCD 主链路集成验收已完成。
- ✅ 代码审查已完成。
- ✅ 6.3 轻量 Semantic Guardrails 已完成。
- ✅ Mapping 漂移测试已补充并测试通过。

#### 下一步 1：6.3 轻量 Semantic Guardrails

**目标**：先实现输入侧 prompt injection 规则检测，不引入 LLM/embedding 语义扫描。

**建议文件**：
- `src/sandbox/semantic-detector.ts`
- `src/sandbox/semantic-detector.test.ts`
- 接入点根据现有 pipeline/safety 调用链选择，保持最小改动

**检测场景**：
- `ignore previous instructions`
- `忽略之前规则`
- `忽略上面的所有约束`
- `system prompt`
- `pretend you are root`
- `假装你是 root`
- 要求绕过安全规则、关闭 sandbox、跳过 command rules 的输入

**验收标准**：
- 明确 prompt injection 输入被拒绝或标记为 high risk。
- 正常开发请求不被误拦截，例如“修复 CI 并提交”“运行测试”。
- 不替换 `sandbox/detector.ts`，只增加输入侧补充防线。
- targeted tests 和 `npm run typecheck` 通过。

#### 下一步 2：Mapping 漂移测试

**目标**：防止 tool schema、intent-step mapping、executor step 格式不同步。

**建议文件**：
- `src/nl/intent-step-mapping.test.ts`
- 或新增 `src/nl/intent-step-mapping.integration.test.ts`

**测试要求**：
- `buildToolsFromTemplates()` 暴露的可执行 intent，在 mapper 中必须存在映射，除非明确标记为非执行型 intent。
- mapper 中存在的 intent，必须能被 tool schema 或显式 registry 暴露。
- 每个 mapping 生成的 step 必须符合 executor 支持的 step 结构。
- 未知 intent 必须失败，不允许回退到任意 CLI。
- 缺少 required 参数必须失败。

**验收标准**：
- 新增测试能在 CI 中阻止 schema/mapping 漂移。
- 失败信息能指出缺失的 intent 或不匹配的 mapping key。

### 4.1 任务 6.0：Intent-to-Workflow Mapping

**目标**：建立确定性的 `intent + arguments → workflow step` 转换层。LLM 只负责输出
tool call，不直接拼最终 shell 命令或 workflow step。

**新建文件**：
- `src/nl/intent-step-mapping.ts` - 映射加载、参数渲染、schema 校验
- `src/nl/intent-step-mapping.test.ts` - 映射单元测试
- `src/nl/intent-step-mapping.yaml` 或等价内置配置 - intent 到 workflow step 的配置

**示例配置**：
```yaml
git_commit:
  type: exec
  cli: git
  args:
    - commit
    - -m
    - "{{message}}"
  required:
    - message

git_push:
  type: exec
  cli: git
  args:
    - push
    - "{{remote}}"
    - "{{branch}}"
  required:
    - remote
    - branch
```

**核心接口**：
```typescript
interface IntentStepMapping {
  type: 'exec';
  cli: string;
  args: string[];
  required?: string[];
}

interface IntentStepMapper {
  toStep(intent: string, params: Record<string, unknown>): Step;
}

function createIntentStepMapper(
  mappings: Record<string, IntentStepMapping>,
): IntentStepMapper;
```

**实现要求**：
1. intent 不存在映射时抛错，不回退到任意 CLI。
2. required 参数缺失时抛错，不让 LLM 猜默认值。
3. `{{param}}` 渲染后仍保持为单个 `args` 元素，避免带空格参数被拆散。
4. `cli` 必须经过允许列表或已注册 tool 校验。
5. 生成 step 后仍必须经过 `sandbox/detector`、`command-rules`、`security-protocol`。
6. 用户自定义映射必须显式注册 schema 和权限边界。

**测试用例**：
- `git_commit + message` 生成 `cli: git`, `args: ['commit', '-m', message]`
- `git_push + remote + branch` 生成 `cli: git`, `args: ['push', remote, branch]`
- 缺少 required 参数时失败
- 未知 intent 时失败
- 带空格参数不被拆分
- 未授权 CLI 被拒绝

### 4.2 任务 6.1：LLMOrchestrator

**新建文件**：`src/nl/llm-orchestrator.ts`

**核心实现**：
```typescript
class LLMOrchestrator {
  constructor(
    private promptManager: PromptManager,
    private sessionManager: SessionManager,
    private llmAdapter: LLMAdapter,
    private toolRegistry: DynamicToolRegistry,
    private observability: LLMObservability,
  ) {}

  async ask(request: LLMRequest): Promise<LLMResponse> {
    const traceId = generateTraceId();
    const startTime = Date.now();

    try {
      this.observability.startTrace(traceId, request);

      const context = this.sessionManager.buildContextAwarePrompt(
        '', request.sessionId ?? 'default',
      );

      const promptId = request.promptId
        ?? this.promptManager.selectBest(request.input);
      const systemPrompt = this.promptManager.buildSystemPrompt(
        promptId,
        { userInput: request.input, projectContext: context },
        request.sessionId,
      );

      const tools = request.tools ?? this.toolRegistry.getToolSchema();

      const rawResponse = await this.llmAdapter.complete(
        systemPrompt,
        request.input,
        { tools, maxTokens: request.maxTokens, temperature: request.temperature },
      );

      const response: LLMResponse = {
        ...this.parseResponse(rawResponse),
        traceId,
        tokenUsage: rawResponse.usage,
        latencyMs: Date.now() - startTime,
      };

      this.observability.endTrace(traceId, response);
      return response;
    } catch (error) {
      this.observability.recordError(traceId, error);
      throw error;
    }
  }
}
```

### 4.3 任务 6.2：LLMObservability

**新建目录**：`src/nl/observability/`

**新建文件**：
- `trace.ts` - LLMTrace 类型定义
- `collector.ts` - Trace 收集器
- `storage.ts` - 持久化存储
- `index.ts` - 统一导出

**Trace 收集器核心**：
```typescript
class TraceCollector {
  private traces: LLMTrace[] = [];
  private maxSize = 100;

  startTrace(traceId: string, request: LLMRequest): void {
    const trace: LLMTrace = {
      traceId,
      sessionId: request.sessionId,
      timestamp: new Date(),
      userInput: request.input,
      systemPrompt: '',
      status: 'success',
    };
    this.traces.push(trace);
    if (this.traces.length > this.maxSize) {
      this.traces.shift();
    }
  }

  endTrace(traceId: string, response: LLMResponse): void {
    const trace = this.traces.find(t => t.traceId === traceId);
    if (trace) {
      trace.rawResponse = response.content;
      trace.tokenUsage = response.tokenUsage;
      trace.latencyMs = response.latencyMs;
    }
  }
}
```

### 4.4 任务 6.3：Semantic Guardrails

**新建文件**：`src/sandbox/semantic-detector.ts`

**输入侧检查**：
```typescript
const INJECTION_PATTERNS = [
  /忽略.*(?:之前|上面|所有).*(?:规则|指令|约束)/i,
  /ignore.*(?:previous|above|all).*(?:rules|instructions)/i,
  /pretend.*you.*are/i,
  /假装.*(?:你是|你扮演)/i,
  /system\s*prompt/i,
];

function detectPromptInjection(input: string): boolean {
  return INJECTION_PATTERNS.some(pattern => pattern.test(input));
}
```

**输出侧检查**：在 `detector.ts` 硬规则之前增加语义层，检查 LLM 输出的命令是否有潜在危险。

### 4.5 任务 6.4：分层记忆

**重构文件**：`src/nl/session-manager.ts`

**新增接口**：
```typescript
interface MemoryLayer {
  getContent(): string;
  getTokenEstimate(): number;
  refresh(): Promise<void>;
}

class WorkingMemory implements MemoryLayer { /* L1: 最近 5 轮 */ }
class SessionSummary implements MemoryLayer { /* L2: LLM 摘要 */ }
class ProjectContextMemory implements MemoryLayer { /* L3: 项目信息 */ }
```

### 4.6 任务 6.5：Pipeline 重构

**重构文件**：`src/nl/core/pipeline.ts`

**核心变化**：
```typescript
// Before: 直接调用 llm-adapter
const response = await llmAdapter.complete(systemPrompt, userInput);

// After: 通过 LLMOrchestrator
const orchestrator = createLLMOrchestrator(options);
const response = await orchestrator.ask({
  input: userInput,
  sessionId,
});
```

---

## 5. 验证命令

每次修改后必须运行：

```bash
npx tsc --noEmit && npx vitest run
```

Phase 5 性能基准：

```bash
npx vitest run benchmarks/
```
