# BUG 清单

| 序号 | 标题 | 状态 | 位置 | 修复版本 |
|:---:|------|:----:|------|:--------:|
| 1 | 动态导入可能导致运行时错误 | **已修复** | `src/skills/init.ts#L34-38` | - |
| 2 | keywordFallback.match is not a function | **已修复** | `src/nl/core/pipeline.ts` | - |
| 3 | createSkillSystem未传入llmConfig导致workflowSkill未注册 | **已修复** | `src/commands/run.ts#L93` | - |
| 4 | useLLM硬编码为false导致WORKFLOW_GENERATE返回占位符 | **已修复** | `src/commands/run.ts#L109` | - |
| 5 | createTaskListFromWorkflow不解析YAML返回占位符 | **已修复** | `src/nl/core/pipeline.ts#L237` | - |

---

## 详情

### 1. 动态导入可能导致运行时错误

**问题描述**：
- 使用 `require()` 动态导入模块存在风险：
  1. 如果模块文件不存在或导出错误，会导致运行时错误；
  2. 无法在编译时进行类型检查。

**修复方案**：
- 将动态 `require()` 改为静态 `import` 语句
- 导入的模块包括：`createIntentSkill`、`createWorkflowSkill`、`createPipelineSkill`、`createPromptRegistry`、`createLLMDialogControlSkill`
- 保留条件分支中的 try-catch 错误处理逻辑

**影响文件**：
- `src/skills/init.ts`

**修复状态**：已修复

### 4. useLLM硬编码为false导致WORKFLOW_GENERATE返回占位符

**问题描述**：
- 执行 `vectahub run "生成workflow"` 时，只输出 "Task executed successfully"
- `WORKFLOW_GENERATE` 意图需要 LLM 生成，但实际没有使用

**根本原因**：
- [run.ts:109](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/run.ts#L109) 中 `useLLM` 被硬编码为 `false`
- 导致即使 `llmConfig` 存在，NL processor 也不会使用 LLM

**修复方案**：
- 将 `options: { useLLM: false }` 改为 `options: { useLLM: !!llmConfig }`

**影响文件**：
- `src/commands/run.ts`

**修复状态**：已修复

### 2. keywordFallback.match is not a function

**问题描述**：
- 运行命令 `vectahub run "/Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/01_SYSTEM_ARCHITECTURE_V2.md使用这个文档生成几个好用的workflow"` 时报错
- 错误信息：`keywordFallback.match is not a function`
- 发生时间：2026-05-06

**复现步骤**：
1. 执行 `vectahub run "某文档路径使用这个文档生成几个好用的workflow"`

**影响文件**：
- `src/nl/` (目录)

**修复状态**：已修复

**修复方案**：
- 将 `keywordFallback` 参数类型从 `KeywordMatcher` 改为 `NLProcessor`
- 将 `keywordFallback.match(input)` 调用改为 `await keywordFallback.parse(context)`
- 适配 `parse()` 返回的 `NLResult` 结构（使用 `.success` 代替 `.matched`，`.taskList` 代替 `.tasks`）

**影响文件**：
- `src/nl/core/pipeline.ts`（主要修复）
- `src/nl/core/types.ts`（类型扩展）

### 3. createSkillSystem未传入llmConfig导致workflowSkill未注册

**问题描述**：
- 执行 `vectahub run "某文档生成workflow"` 时，只输出 "Task executed successfully"
- 生成的 workflow 内容没有实际显示

**根本原因**：
- `createSkillSystem()` 调用时未传入 `llmConfig`
- 导致 `workflowSkill` 未注册到 registry 中
- 降级到 fallback 返回占位符输出

**修复方案**：
- 在 [run.ts:93](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/run.ts#L93) 传入 `llmConfig`：`createSkillSystem({ llmConfig })`

**影响文件**：
- `src/commands/run.ts`

**修复状态**：已修复

### 5. createTaskListFromWorkflow不解析YAML返回占位符

**问题描述**：
- `createTaskListFromWorkflow` 函数没有真正解析传入的 YAML 内容
- 无论传入什么 YAML，都返回固定的占位符 `echo Workflow generated from YAML`

**根本原因**：
- 函数硬编码返回固定任务列表，没有使用 YAML 解析器解析 workflowYAML 参数

**修复方案**：
- 在 `createTaskListFromWorkflow` 中添加 YAML 解析逻辑
- 提取 workflow 中的 steps，转换为任务命令

**影响文件**：
- `src/nl/core/pipeline.ts`

**修复状态**：已修复
