# Agent Worker Contract Spec

## 1. 任务目标

将文档任务执行中的 Agent 从“读取整份文档并自由发挥”收敛为“执行边界清楚的小任务”。

P2 的核心目标：

- 每个 Agent 任务都有结构化输入合同。
- Agent 只收到必要文档片段，不默认吃完整大文档。
- 每个任务有明确允许修改范围、禁止修改范围和验证命令。
- 批量并发前必须通过边界检查。
- 边界推导失败时降级为串行，不阻塞执行。
- 保持低内存、低 IO、低 prompt 体积。

## 2. 当前基线

当前实现状态：

- P0 Trace v1 已完成，插件和 CLI 可通过 trace 关联。
- P1 文档任务状态机已完成，任务运行记录可以持久化。
- `parse-doc` 只提取 `id` 和 `label`。
- `run-task` 已接入 `AgentTaskContract`，JSON 输出只包含合同摘要。
- 插件批量执行前已做本地轻量边界预检。
- 边界未知或文件重叠时，插件会自动降级串行。

P2 不重写 LLM 解析器，不引入数据库，不引入 worktree 隔离。

## 2.1 实施状态

已完成：

- 阶段 1：合同类型和纯函数。
- 阶段 2：CLI `run-task` 接入。
- 阶段 3：插件批量边界检查。
- 阶段 4：合同预览和 lint hardening。

仍需后续 hardening：

- 合并 CLI 与插件端的合同推导实现，减少规则重复。
- 增加真实批量执行的端到端测试。
- 插件端后续可改为调用合同预览命令，避免长期复制 CLI 规则。

## 3. In Scope

- 新增 Agent 任务输入合同类型。
- 新增文档片段提取函数。
- 新增文件边界归一化和校验函数。
- 新增验证命令推导规则。
- `run-task` prompt 接入 AgentTaskContract。
- 文档任务运行记录保存合同摘要。
- 批量任务并发前做边界检查。
- 插件执行前展示任务边界摘要。
- 补充类型、纯函数、run-task 和插件逻辑测试。

## 4. Out of Scope

- 不做 worktree 隔离。
- 不做自动代码审查。
- 不做完整 P3 验证闭环执行。
- 不做 UI 时间线。
- 不改变 `run-task --json` 现有字段语义。
- 不要求 LLM 一次性准确推导所有文件边界。
- 不读取整仓文件树。
- 不把完整文档内容保存到 task run record。

### 5.4 任务指纹 (Instruction Hash)
为了精确检测需求变更，每个合同必须包含 `instructionHash`。

**计算公式**：
`Hash = SHA-256(taskId + label + docExcerpt + toolName + normalizedAllowedFiles + normalizedForbiddenFiles)`

**执行契约 (Mandates)**：
1.  **因子完整性**：计算 Hash 时必须包含上述所有 6 个维度。
2.  **比对阶段的因子对称性 (Critical)**：插件在比对历史 Hash 与当前 Hash 时，**必须保证计算因子完全对称**。这意味着在比对前，系统必须先根据当前环境执行轻量级的“边界预推导”，获取当前的 `allowedFiles` 和 `forbiddenFiles`，再与 `toolName` 等共同参与计算。
3.  **禁止单向校验**：严禁在比对阶段仅使用部分因子。不对称的计算会导致 Hash 永远无法匹配，造成系统逻辑失效。


### 5.1 类型定义

建议放在：

```text
src/types/doc-task.ts
```

```ts
export interface AgentTaskContract {
  taskId: string;
  label: string;
  docPath?: string;
  docExcerpt?: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  timeoutMs: number;
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  notes?: string[];
}
```

### 5.2 边界合同

```ts
export interface AgentTaskBoundary {
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
  boundaryConfidence: 'none' | 'low' | 'medium' | 'high';
  parallelEligible: boolean;
  reason?: string;
}
```

### 5.3 并发判定结果

```ts
export interface AgentTaskConcurrencyDecision {
  mode: 'serial' | 'parallel';
  reason: string;
  groups: string[][];
}
```

## 6. 数据边界

允许进入 AgentTaskContract：

- `taskId`
- `label`
- `docPath`
- `docExcerpt`
- `allowedFiles`
- `forbiddenFiles`
- `validationCommands`
- `timeoutMs`
- `boundaryConfidence`

禁止进入 AgentTaskContract：

- API key。
- token。
- 完整 env。
- 完整 stdout/stderr。
- 完整 trace。
- 完整 git diff。
- 超大文档全文。

长度限制：

```text
docExcerpt: <= 8000 chars
allowedFiles: <= 100 items
forbiddenFiles: <= 100 items
validationCommands: <= 10 items
notes: <= 20 items
single validation command: <= 300 chars
serialized contract target: <= 16KB
Agent prompt contract section: <= 12000 chars
```

超过限制必须截断，并在 `notes` 中记录。

## 7. 文档片段提取策略

### 7.1 目标

Agent 不应默认读取整份文档。系统应尽量根据 `taskId` 提取任务附近片段。

### 7.2 规则

输入：

```ts
deriveDocExcerpt(input: {
  docContent: string;
  taskId: string;
  label: string;
  maxChars?: number;
}): {
  excerpt: string;
  truncated: boolean;
  strategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback';
}
```

优先级：

1. 找到包含 `taskId` 的标题，截取该标题到下一个同级或更高级标题。
2. 找到包含 `taskId` 的行，截取前后窗口。
3. 找到包含 `label` 关键词的行，截取前后窗口。
4. 取文档开头作为 fallback。

默认：

```text
maxChars = 8000
window before = 2000
window after = 6000
```

不得：

- 为了提取片段读取仓库其他文件。
- 把片段写入 task run record。
- 在插件常驻内存中长期保存完整文档。

## 8. 文件边界推导

### 8.1 第一版边界来源

P2 第一版不要求 LLM 准确推导文件范围，先用确定性规则：

- 从文档片段中识别反引号路径。
- 从文档片段中识别 `src/...`、`packages/...`、`docs/...` 等路径。
- 从 task label 中识别明显模块名。
- 如果无法推导，`allowedFiles=[]`，`boundaryConfidence='none'`。

### 8.2 路径归一化

```ts
normalizeAgentTaskFiles(input: {
  files: string[];
  projectRoot: string;
}): string[]
```

要求：

- 只保留相对项目根目录的路径。
- 去重。
- 移除空字符串。
- 移除 `..` 越界路径。
- 移除绝对路径中的用户 home 前缀，只保留项目相对路径。
- 最多保留 100 个。

### 8.3 禁止修改范围

默认 forbidden：

```text
.env
.env.*
**/*.pem
**/*.key
**/node_modules/**
**/.git/**
```

项目已有安全规则优先，P2 不重复实现危险命令系统。

## 9. 验证命令推导

### 9.1 第一版规则

```ts
deriveValidationCommands(input: {
  allowedFiles: string[];
  taskLabel: string;
  packageScripts?: string[];
}): string[]
```

规则：

- 如果涉及 `src/**/*.test.ts`，优先运行对应测试。
- 如果涉及 `src/**`，加入 `npm run typecheck`。
- 如果涉及 `packages/vectahub-vscode-extension/src/**`，加入 `npm run compile -w packages/vectahub-vscode-extension`。
- 如果无法推导，默认 `npm run typecheck`。
- 最多 10 条。

P2 只生成验证命令，不自动执行。自动执行属于 P3。

## 10. 并发边界检查

### 10.1 判定原则

```text
unknown boundary -> serial
overlapping allowedFiles -> serial
forbiddenFiles touched -> serial
isolated-required -> serial
all high/medium confidence and no overlap -> parallel
```

### 10.2 纯函数

```ts
decideAgentTaskConcurrency(contracts: AgentTaskContract[]): AgentTaskConcurrencyDecision
```

输出：

- `serial`：保持现有串行或 maxConcurrent=1。
- `parallel`：允许按不重叠 group 执行。

P2 不实现 worktree 隔离。没有隔离时，即使允许 parallel，也要限制最大并发不超过现有配置。

## 11. `run-task` 接入要求

修改：

```text
src/commands/run-task.ts
```

### 11.1 新增步骤

在生成 Agent 命令前：

```text
load doc content if docPath exists
derive doc excerpt
derive file boundary
derive validation commands
build AgentTaskContract
```

### 11.2 Prompt 合同

默认 prompt 中必须包含：

```text
任务编号
任务描述
参考文档路径
文档片段
允许修改范围
禁止修改范围
建议验证命令
执行要求
```

执行要求：

```text
- 只围绕当前任务改动。
- 优先修改 allowedFiles。
- 不要修改 forbiddenFiles。
- 如果必须越界修改，先在输出中说明原因。
- 完成后运行或说明 validationCommands。
```

### 11.3 JSON 输出兼容

`run-task --json` 不改变已有字段语义。

可以新增可选字段：

```ts
agentTaskContract?: {
  boundaryConfidence: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  validationCommands: string[];
}
```

但不得把完整 `docExcerpt` 输出到 JSON。

## 12. 插件接入要求

修改：

```text
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts
packages/vectahub-vscode-extension/src/views/tasksView.ts
```

### 12.1 运行记录

`DocTaskRunRecord` 可新增摘要字段：

```ts
agentTaskContract?: {
  boundaryConfidence: string;
  allowedFileCount: number;
  forbiddenFileCount: number;
  validationCommandCount: number;
  executionMode: string;
}
```

不得保存完整 `docExcerpt`。

### 12.2 批量执行

批量执行前：

- 尝试为每个任务获取 contract summary。
- 如果边界未知，保持串行。
- 如果边界重叠，保持串行。
- 如果可并发，允许使用配置并发。

第一版如果无法在插件端预生成完整 contract，可以先由 CLI `run-task --dry-run --json` 或未来 contract preview 命令提供。P2 可以先实现 CLI 侧合同，插件并发检查作为阶段 3。

## 13. 性能与内存预算

硬性预算：

```text
deriveDocExcerpt for 50KB doc: < 10ms
deriveDocExcerpt memory overhead: O(excerpt size)
normalize files 100 items: < 2ms
concurrency decision 100 tasks: < 20ms
AgentTaskContract serialized: <= 16KB
run-task prompt contract section: <= 12000 chars
```

禁止：

- 为每个任务重复读取大文档超过一次。
- 把完整文档复制到每个 task record。
- 扫描整个仓库文件树。
- 在插件 tree refresh 时生成合同。

建议：

- 单次批量执行共享 docContent。
- 只在执行前生成 contract。
- 只保存 contract summary。

## 14. 安全与隐私边界

- `allowedFiles` 和 `forbiddenFiles` 必须经过路径归一化。
- 出现 `..` 越界路径必须丢弃。
- Agent prompt 不包含 secrets。
- 不将完整 env 传给 Agent。
- forbidden 默认包含敏感文件。
- 如果 Agent 输出建议修改 forbidden 文件，任务状态后续应进入 `needs_confirmation`，P2 只记录，不自动阻断。

## 15. 文件修改清单

### 阶段 1：纯类型与函数

新增：

```text
src/commands/agent-task-contract.ts
src/commands/agent-task-contract.test.ts
```

修改：

```text
src/types/doc-task.ts
```

### 阶段 2：`run-task` 接入

修改：

```text
src/commands/run-task.ts
src/commands/run-task.test.ts
```

### 阶段 3：插件批量并发检查

修改：

```text
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts
packages/vectahub-vscode-extension/src/views/tasksView.ts
```

### 阶段 4：文档和 hardening

修改：

```text
docs/v2/agent-worker-contract-spec.md
docs/v2/agent-execution-roadmap.md
```

## 16. 实施顺序

### 阶段 1：合同类型和纯函数

实现：

- `AgentTaskContract`
- `AgentTaskBoundary`
- `deriveDocExcerpt`
- `normalizeAgentTaskFiles`
- `deriveValidationCommands`
- `decideAgentTaskConcurrency`

测试：

- 标题片段提取。
- taskId window fallback。
- label window fallback。
- head fallback。
- 路径去重、越界过滤、数量限制。
- validation command 推导。
- concurrency serial/parallel 判定。

完成标准：

- 无 IO，除测试 fixture 外不读文件。
- 无第三方依赖。
- 性能预算可通过简单测试验证。

### 阶段 2：CLI `run-task` 接入

实现：

- 从 `docPath` 读取文档一次。
- 构造 `AgentTaskContract`。
- 默认 prompt 使用 contract。
- JSON 结果增加 contract summary。
- trace span 记录 contract summary，不记录 docExcerpt。

完成标准：

- `run-task --json` 兼容旧字段。
- 没有 docPath 时仍可执行。
- docPath 不存在时走现有错误路径或分类为 config。
- 测试覆盖 contract summary。

### 阶段 3：插件批量边界检查

实现：

- 批量执行前根据 contract summary 判断是否保持串行。
- 边界未知降级串行。
- 重叠文件降级串行。
- UI 输出降级原因。

完成标准：

- 默认仍安全串行。
- 只有明确不重叠时才并发。
- 不读取完整文档多次。

## 17. 测试计划

必须运行：

```text
npm test -- src/commands/agent-task-contract.test.ts --run
npm test -- src/commands/run-task.test.ts --run
npm run typecheck
npm run compile -w packages/vectahub-vscode-extension
```

插件阶段额外运行：

```text
npx vitest run test/docTaskStateMachine.test.ts test/docTaskRunStore.test.ts test/docTaskRunHelpers.test.ts
```

## 18. 完成定义

P2 完成必须满足：

- Agent 执行前有结构化任务合同。
- Agent prompt 不再只依赖整份文档。
- 文档片段有明确长度上限。
- 文件边界有归一化和安全过滤。
- 验证命令可推导但不自动执行。
- 并发前有边界检查。
- 边界未知时降级串行。
- 不保存完整 docExcerpt 到持久化记录。
- 测试通过。
- 文档更新执行结果和 commit hash。

## 19. Hardening TODO

P2 后续可做：

- 让 `parse-doc` 提取任务时同步输出建议文件范围。
- 已增加 `vectahub run-task --contract-preview --json`。
- 接入 worktree 隔离并发。
- 用真实 git diff 校验 Agent 是否越界修改。
- 越界修改自动进入 `needs_confirmation`。

## 20. Lint Warning 分析

已处理的插件 warning：

- `src/cli/adapter.ts` 中未使用的 `globalContext`：会让 `ExtensionContext` 被模块级变量长期引用。它不在热路径上，几乎不影响速度，但属于不必要的常驻引用，清理后更利于内存边界。
- `src/project/diagnostic-bridge.ts` 中未使用的 `mkdir` import：运行影响可以忽略，只是无意义模块绑定。清理后 lint 保持干净，减少后续 CI 噪音。

处理后：

```text
npm run lint -w packages/vectahub-vscode-extension
0 warning / 0 error
```

## 21. 执行期优化问题根因分析

当前执行过程中仍会出现性能、内存、响应速度优化空间，根因不是单点代码慢，而是执行链路中存在重复处理和共享状态写入。

### 21.1 根因一：同一文档被重复扫描

现象：

- 插件批量预检读取文档一次，但合同提取阶段会按任务逐个扫描同一份文档。
- CLI 执行每个任务时，如果传入 `--doc`，又会在每个子进程里重新读取和提取文档片段。

影响：

- 批量任务越多，预检阶段越接近 `O(taskCount * docSize)`。
- 文档越大，插件响应越容易出现短暂卡顿。
- 每个 Agent 执行前都有重复 IO 和字符串扫描。

处理顺序：

1. 插件端先建立文档 heading 索引，一次扫描，多任务复用。
2. 后续让插件执行阶段复用 `run-task --contract-preview --json` 或显式合同输入，避免 CLI 子进程重复读文档。

### 21.2 根因二：任务启动链路仍包含 LLM 命令生成

现象：

- `run-task` 在正常执行路径会加载 LLM 配置、发现工具 help、调用 LLM 生成 Agent 命令。
- 即使 Agent CLI 的调用格式固定，也仍经过这条链路。

影响：

- 首个响应时间受 LLM 调用影响。
- 批量任务会把这个开销放大到每个任务。

处理顺序：

1. 保留当前 LLM 生成路径作为 fallback。
2. 后续为 `codex`、`gemini`、`aider`、`claude` 增加确定性命令模板。
3. 模板命中时跳过 LLM 命令生成，只保留安全检查和 trace。

### 21.3 根因三：并发写运行记录会竞争 latest 状态

现象：

- 每个任务运行状态更新都会 append JSONL，并重写 `latest.json`。
- 并发任务可能同时写同一个 `latest.json.tmp`。

影响：

- 并发下存在写入竞争风险。
- 小任务多时，latest 重写 IO 会变多。

处理顺序：

1. 先给 run store 增加进程内写队列，保证同一 store 实例内写入串行。
2. 后续再评估 latest 写入 debounce 或 batch flush。

### 21.4 本轮优化边界

本轮先处理：

- 插件合同预检文档索引复用。已完成：`docTaskDocIndex` 一次扫描文档 heading，批量任务复用索引提取片段。
- run store 写队列串行化。已完成：同一 store 实例内 `startRun/updateRun/startBatch/updateBatch` 写入串行执行，`latest.json` 临时文件使用唯一名。

本轮暂不处理：

- Agent CLI 确定性模板。
- 合同跨进程完整复用。
- worktree 隔离。

原因：

- 这三项会改变执行协议或并发隔离模型，需要单独设计和回归。
- 先处理本地重复扫描和写入竞争，可以直接降低插件响应风险和并发 IO 风险。
