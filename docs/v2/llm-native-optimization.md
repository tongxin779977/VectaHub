# VectaHub LLM-Native 优化方案 (2026)

> 版本: 1.1.0 | 状态: 推进中 (Execution Phase 2)
> 目标: 将 VectaHub 从“启发式规则引擎”升级为“LLM-Native 代理框架”

---

## 1. 核心目标

1.  **意图解析进化**: 从基于关键词权重的 `MatchingPipeline` 转向以 **LLM Tool Calling** 为核心的解析架构。 (DONE)
2.  **引擎能力增强**: 引入标准的表达式引擎，支持动态、复杂的条件分支逻辑。 (CURRENT)
3.  **闭环自愈系统**: 实现智能诊断（Intelligent Diagnosis），支持执行失败后的自动修复与重试。
4.  **架构解耦**: 规范化插件接口，支持 AI 模块的热插拔。

---

## 2. 优化路线图 (Roadmap)

### 阶段 1: LLM-Native 解析重构 (DONE)
- [x] **重构 `run.ts`**: 将 LLM 解析接入核心执行路径，不再作为降级方案。
- [x] **集成 Chat 模块**: 将 LLM Tool Calling 集成到 `src/chat/repl.ts`，使 Chat 模式下的自然语言理解直接利用 LLM 工具。
- [x] **定义 Tool Schema**: 将现有的 16 种意图（Intent）映射为标准的 JSON Schema 描述。
- [x] **实现 Tool Calling 转换器**: 将 LLM 的输出直接转换为工作流任务序列。

### 阶段 2: 表达式与上下文升级 (DONE)
- [x] **集成逻辑引擎**: 引入 `json-logic-js`，支持复杂条件表达式（如 `${steps.step1.output.code == 200}`）。
- [x] **作用域变量优化**: 改进 `ContextManager`，支持通过 `executionId` 进行结构化数据检索。
- [x] **增强插值语法**: 统一了 `${vars.xxx}`、`${steps.id.output}`、`${env.xxx}` 的访问方式。

### 阶段 3: 智能诊断与自愈 (Current)
- [ ] **诊断模块接入**: 当步骤失败时，自动捕获 `stderr`、`exitCode` 与上下文。
- [ ] **LLM 根因分析**: 调用 LLM (Intelligent Diagnosis Skill) 分析失败原因。
- [ ] **自动修复建议**: LLM 给出修复命令或参数调整建议。
- [ ] **自愈重试流**: 在 `run.ts` 中实现：解析修复建议 -> 用户确认 -> 自动重新执行修正后的步骤。

---

## 3. 技术规范变更

### 3.1 意图定义 (Implemented)
意图已通过 `src/nl/tool-calling.ts` 动态映射为 LLM Tools。

### 3.2 表达式引擎 (Planned)
采用 `json-logic-js` 或类似的确定性引擎，避免 `eval` 带来的安全风险，同时提供比正则匹配更强的逻辑表达力。

### 3.3 核心执行流 (New)
1.  **Parse**: 调用 LLM (Tool Calling) 获取结构化意图。
2.  **Validate**: 通过安全协议审计生成的命令。
3.  **Execute**: 在沙箱中执行，利用 **Expression Engine** 处理复杂的流转逻辑。
4.  **Feedback**: 失败则触发 `DiagnosisModule`。

---

## 4. 关键文件调整清单

| 文件 | 变更说明 |
|------|---------|
| `src/utils/run.ts` | (Completed) 修改核心逻辑，优先调用 LLM Parser。 |
| `src/nl/tool-calling.ts` | (New) 定义 Tool Schema 与转换逻辑。 |
| `src/workflow/interpolation.ts` | (Next) 引入表达式引擎支持复杂插值。 |
| `src/workflow/engine.ts` | (Next) 增加对复杂条件表达式的支持。 |
| `src/skills/intelligent-diagnosis.ts` | (Future) 实现核心诊断逻辑。 |


---

**文档批准人**: Gemini CLI (Senior AI Engineer)
**日期**: 2026-05-07
