# Document Processing Architecture

> Document Status: Target Architecture / Migration Contract
> Authority: 文档处理能力的架构设计入口。当前实现事实仍以 `parse-doc`、`run-task`、Agent Worker 合同和源码为准。
> Related: [Capability Reference](../capabilities-reference.md), [Agent 执行系统](../agent-execution.md), [Agent Worker 合同规格](../specs/agent-worker-contract.md)

## Problem

VectaHub 的文档处理不能停留在“把文档交给 LLM 总结”。它应该把自然语言文档编译成可审查、可确认、可执行、可验证、可恢复的任务合同。

当前已经存在的主链路是：

```text
parse-doc
-> run-task
-> AgentTaskContract
-> Agent CLI
-> verification
-> doc-task-runs
-> recover-task
```

当前主要缺口是前半段数据层较薄：

- `parse-doc` 主要输出 `id` 和 `label`。
- chunk 主要是字符串切分，没有稳定 source map。
- `run-task` 需要根据 `taskId` / `label` 再回扫文档片段并推导边界。
- 文档任务、AgentTaskContract、workflow、run record、recovery record 之间还缺少统一版本和 trace 关联。

## Goals

- 建立统一文档中间表示，所有格式先转成同一套 block / chunk / source map。
- 把文档任务从 `id + label` 升级为任务候选合同。
- 让用户能预览、确认、编辑、忽略、拆分和合并文档任务。
- 让 `run-task` 消费更可靠的任务候选，而不是完全重新猜边界。
- 支持从确认后的文档任务生成 workflow。
- 支持多 Agent CLI 文档任务链路，例如先收集资料、再整理文档、再落代码或验证。
- 从文档行号贯通 trace、执行记录、验证结果和恢复记录。

## Non-Goals

- 不把文档处理写成多用户 SaaS 文档平台。
- 不要求第一阶段支持所有文件格式。
- 不让 LLM 直接决定最终执行状态。
- 不把完整大文档、完整 stdout/stderr、完整 git diff 或 secrets 写入 task run record。
- 不在没有确认的情况下执行高风险文档任务。
- 不把 `parallel` 或多个 Agent CLI 调用宣传成完整 autonomous swarm。

## Proposal

文档处理应按编译管线设计：

```text
Document
-> DocumentReader
-> ParsedDocument / SourceMap
-> ParsedTaskCandidate
-> AgentTaskContract v1
-> ConfirmedTaskContract
-> Workflow / Agent Step Plan
-> Permission Gate
-> Execution Trace
-> Verification
-> Run Record
-> Recovery Decision
```

### 1. Document Reader

Reader 负责把不同来源统一成文档块，不直接生成任务。

第一阶段建议支持：

- Markdown
- Plain text

后续可扩展：

- HTML
- PDF
- DOCX
- CSV / spreadsheet
- URL 导入后的正文快照

所有 reader 都必须输出统一结构，不能让每种格式各自实现任务提取逻辑。

```ts
interface ParsedDocument {
  schemaVersion: '1.0';
  documentId: string;
  path: string;
  format: 'markdown' | 'text' | 'html' | 'pdf' | 'docx' | 'spreadsheet';
  contentHash: string;
  parserVersion: string;
  blocks: DocumentBlock[];
  chunks: DocumentChunk[];
  tasks: ParsedTaskCandidate[];
  warnings: ParseWarning[];
}
```

### 2. Source Map

每个 block、chunk、task、字段证据都必须能追溯到原文。

```ts
interface SourceRange {
  path: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  headingPath?: string[];
  page?: number;
}
```

没有 source map 的任务只能作为低可信任务候选，不能直接进入自动执行。

### 3. Document Blocks and Chunks

chunk 不应只是 `string[]`。它应保留来源、标题路径、hash 和覆盖信息。

```ts
interface DocumentChunk {
  chunkId: string;
  content: string;
  contentHash: string;
  sourceRange: SourceRange;
  headingPath: string[];
  overlapBefore?: number;
  overlapAfter?: number;
}
```

chunk 失败时要记录失败范围和覆盖率，避免“只成功解析一点点却看起来像成功”。

```ts
interface ParseCoverage {
  totalChunks: number;
  successfulChunks: number;
  failedChunks: number;
  coverageRatio: number;
}
```

### 4. Parsed Task Candidate

`parse-doc` 的目标输出应从任务列表升级成任务候选合同。

```ts
interface ParsedTaskCandidate {
  schemaVersion: '1.0';
  id: string;
  label: string;
  status?: 'pending' | 'partial' | 'existing' | 'paused' | 'unknown';
  goal?: string;
  problem?: string;
  acceptanceCriteria: string[];
  suggestedFiles: string[];
  forbiddenFiles: string[];
  validationHints: string[];
  dependencies: string[];
  riskHints: string[];
  extractionConfidence: 'low' | 'medium' | 'high';
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  executionConfidence: 'low' | 'medium' | 'high';
  confidenceReasons: string[];
  source: {
    parser: 'roadmap-table' | 'llm' | 'regex-fallback';
    ranges: SourceRange[];
    evidenceText: string;
  };
  warnings: ParseWarning[];
}
```

三类置信度必须分开：

- `extractionConfidence`：这个任务是否被正确从文档中识别。
- `boundaryConfidence`：文件范围、禁止范围、验证提示是否可靠。
- `executionConfidence`：是否适合交给 Agent CLI 或 workflow 执行。

### 5. AgentTaskContract v1

`AgentTaskContract` 是执行前的权威输入合同。它应继续承担边界、验证和 hash 语义，同时补齐版本和来源。

目标字段：

```ts
interface AgentTaskContractV1 {
  schemaVersion: '1.0';
  contractVersion: 1;
  taskId: string;
  label: string;
  instructionHash: string;
  docPath?: string;
  docExcerpt?: string;
  sourceRanges?: SourceRange[];
  sourceDocumentHash?: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  timeoutMs: number;
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  notes?: string[];
}
```

`parse-doc` 可以产出候选，`run-task` 才能产出正式执行合同。正式合同必须经过路径归一化、验证命令推导、风险评估和 instruction hash 计算。

### 6. Confirmation Layer

文档任务默认不应直接执行。应先进入确认层：

```text
ParsedTaskCandidate
-> contract preview
-> user confirm / edit / ignore / split / merge
-> ConfirmedTaskContract
```

推荐 CLI 形态：

```bash
vectahub doc preview ./plan.md
vectahub doc confirm ./plan.md --task T1
vectahub doc edit ./plan.md --task T1
vectahub doc ignore ./plan.md --task T2
vectahub doc split ./plan.md --task T3
vectahub doc merge ./plan.md --tasks T4,T5
```

确认界面应展示：

```text
任务：补齐 workflow 保存前回读校验
来源：docs/plan.md:42-57
建议文件：src/workflow/storage.ts, src/workflow/validation.ts
建议验证：npm test -- src/workflow/storage.test.ts
风险：medium
置信度：boundary medium
```

### 7. Permission Decision

权限确认不应散落在多个命令里。目标合同：

```ts
interface PermissionDecision {
  schemaVersion: '1.0';
  phase: 'preflight' | 'verification' | 'post_execution';
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  affectedFiles: string[];
  canContinue: boolean;
  requiresDiffReview: boolean;
}
```

语义边界：

- `preflight`：执行前确认。还没有仓库副作用，用户确认后可继续原路径。
- `verification`：验证前确认。验证命令还没运行，必须按验证命令风险处理。
- `post_execution`：执行后确认。已经有 `gitChanges`，必须要求用户先看 diff，不能当作普通继续确认。

多 Agent workflow 中，每个 Agent step 都必须独立过权限门，不允许首个 step 通过后自动放行后续 step。

### 8. Workflow Generation

workflow 应从确认后的合同生成，而不是直接从原始文档生成。

```text
ConfirmedTaskContract
-> Workflow Draft
-> workflow preview
-> save with schemaVersion
-> pre-save round-trip validation
```

推荐链路：

```text
opencli / codex collect context
-> gemini / claude refine plan or document
-> codex / aider implement
-> exec verification commands
```

示例：

```yaml
schemaVersion: "1.0"
name: doc-task-workflow
mode: relaxed
steps:
  - id: collect-context
    type: opencli
    site: project
    command: inspect
    args: ["docs", "workflow"]
    outputVar: research_summary

  - id: refine-plan
    type: delegate
    delegateTo: gemini
    dependsOn: [collect-context]
    delegatePrompt: "基于 ${research_summary} 整理任务执行计划。"
    outputVar: refined_plan

  - id: implement
    type: delegate
    delegateTo: codex
    dependsOn: [refine-plan]
    delegatePrompt: "根据确认后的任务合同和 ${refined_plan} 完成实现。"
```

当前 `delegate` 仍需要确认执行路径 handler 是否已注册，因此这类 workflow 应被标注为目标合同或受限能力。

### 9. Trace and Recovery

文档处理 trace 应从解析开始，而不是从 Agent spawn 开始。

建议新增关联：

- `docParseTraceId`：一次文档解析产生哪些任务。
- `contractTraceId`：任务合同如何从文档片段、文件边界和验证命令推导出来。
- `workflowRunTraceId`：多 Agent workflow 中每个 step 的 parent/child 关系。

恢复必须基于合同和 diff：

- 恢复前比较 `instructionHash`。
- hash 不一致时保守阻断。
- 未收口执行不能自动重试。
- 有 gitChanges 的失败应进入 bounded fix task，而不是从头执行。
- `sourceRunId -> recoveryRunId -> newRunId` 必须可追踪。

## Tradeoffs

- 先做统一文档数据层会比直接增强 LLM prompt 慢，但长期可维护。
- source map 会增加数据结构复杂度，但它是用户信任、确认、trace 和恢复的基础。
- 先支持 Markdown/Text 会牺牲格式覆盖面，但能避免 PDF/DOCX 过早带来多套解析逻辑。
- 用户确认层会降低“一键自动化”的速度，但能显著降低误执行和越权修改风险。

## Migration Plan

1. 新增 `ParsedDocument`、`SourceRange`、`ParsedTaskCandidate` 目标类型文档和测试样例。
2. 让 `parse-doc --json` 兼容返回旧 `tasks`，并可选返回 richer `parsedDocument`。
3. 为 chunk 增加 source map 和 coverage 统计。
4. 让 `run-task --contract-preview` 优先消费 richer task candidate。
5. 给 `AgentTaskContract` 增加 `schemaVersion`、`contractVersion`、`sourceRanges`、`sourceDocumentHash`。
6. 增加 `doc preview / confirm / edit / ignore` 交互命令。
7. 从 confirmed contract 生成 workflow draft。
8. workflow 保存前执行 schemaVersion 和 round-trip 校验。
9. 把 doc parse、contract build、workflow run 和 recovery 串成 trace。

## Test Plan

- Markdown 表格任务能保留 source range。
- 长文档分 chunk 后能统计 coverage。
- LLM 分段失败时能返回 chunk-level warning，而不是只给全局 degraded。
- regex fallback 任务必须标记低置信或 degraded。
- `run-task --contract-preview` 不输出完整 `docExcerpt`。
- instruction hash 包含 task、文档来源、文件边界、工具和配置 digest。
- post-execution confirmation 必须要求 diff review。
- 文档内容变更后，旧 run record 不能被误用于恢复。
