# VectaHub NL 意图识别架构文档

> 版本: 1.1.1
> 最后更新: 2026-05-09

本文档描述了 VectaHub 自然语言处理（NL）引擎的内部逻辑及架构设计。

## 1. 整体架构

VectaHub 将用户的自然语言指令转化为可执行的动作。为避免简单的关键词硬匹配导致执行逻辑不闭环，系统采用了 Goal/Capability 路由架构：

```text
用户输入
  -> Input Normalizer (输入标准化)
  -> Goal Parser (目标解析)
  -> Capability Router (能力路由)
  -> ExecutionPlan Builder (执行计划构建)
  -> Workflow Engine / Direct Runner (执行引擎)
  -> User Report (用户报告)
```

## 2. 核心模块说明

### 2.1 输入标准化 (Input Normalizer)
负责清洗原始输入，提取特征信息：
- 将同义词归一化（例如"修复"、"处理"统一为 `repair`，"挂了"、"失败"统一为 `failure`）。
- 提取日志中的 ID、URL、文件路径、Commit SHA 等实体证据。
- **约束**：该层只做信息提取，不决定具体的执行命令或工作流。

### 2.2 目标解析 (Goal Parser)
将标准化后的词元转化为结构化的目标对象 (`ParsedGoal`)：
- 提取动作 (`action`)、领域 (`domains`)、范围 (`scope`) 和成功标准 (`successCriteria`)。
- 解决领域冲突。例如，当输入同时包含 `git` 和 `actions 失败` 时，优先识别为 `github-actions` 领域，而非普通的 `git` 操作。

### 2.3 能力路由 (Capability Router)
根据解析出的目标和项目上下文，匹配最合适的处理能力 (`Capability`)。
- **置信度分级与裁决**：
  - 分数 `>= 0.70` 且与第二名拉开差距：自动选中并生成计划。
  - 分数在 `0.50` 到 `0.70` 之间：建议预览或回退。
  - 分差过小：标记为需要澄清 (`needsClarification`)。
- 当无法匹配高级能力时，系统会回退到旧版的模板匹配管线 (MatchingPipeline/Coordinator) 或调用 LLM 进行辅助判断。

### 2.4 执行计划与用户报告 (ExecutionPlan & UserReport)
能力路由成功后，会生成标准化的 `ExecutionPlan`。
- **计划适配**：`ExecutionPlan` 是一种语义计划，通过适配层 (`plan-adapter.ts`) 转化为底层引擎可执行的 `Step[]` 列表。
- **内部步骤隔离**：标记为 `internal` 的步骤（如获取日志的中间命令）只用于辅助执行，不能被直接转换为占位的 `echo` 命令，也不能将内部的终端输出（stdout）直接暴露给用户。
- **预览与输出**：在 Dry-run（预览）模式和常规执行后，系统必须通过 `UserReport` 模块生成精简的用户报告。报告只展示阶段摘要和后续建议，隐藏所有冗杂的命令细节、临时日志路径和裸 ID 列表。

## 3. 实现边界与限制
- **LLM 的作用**：LLM 仅用于结构化补全和意图理解辅助，不应直接生成并执行底层的 Shell 命令。最终的执行计划由本地的 Capability 负责构建。
- **行为安全**：系统不会自动执行高风险操作。例如，"提交代码"指令不会静默执行 `git add .` 和 `git commit`，而是降级为只读的 `git status` 预览或要求用户明确确认。
