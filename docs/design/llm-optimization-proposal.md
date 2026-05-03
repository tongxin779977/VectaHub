# VectaHub LLM 优化建议

## 问题分析

### 当前实现的局限
1. **静态 System Prompt**: 使用硬编码的字符串，每次调用都一样
2. **缺少上下文感知**: 无法根据用户历史、项目状态动态调整
3. **Prompt 工程化不足**: 没有结构化的 Prompt 管理、版本控制、A/B测试
4. **缺少动态调整**: 无法根据用户反馈或执行结果优化后续调用
5. **功能单一**: 主要只做意图识别，没有充分利用 LLM 的能力

---

## 优化方向

---

## 1️⃣ Prompt 管理系统

### 1.1 Prompt 分层架构
```typescript
interface Prompt {
  id: string;
  name: string;
  version: string;
  description: string;
  category: 'parsing' | 'workflow' | 'assistant' | 'refinement';
  tags: string[];
  system: string;
  userTemplate: string;
  examples: Example[];
  constraints: Constraint[];
  metadata: PromptMetadata;
}

interface Example {
  input: string;
  output: string;
  explanation?: string;
}

interface Constraint {
  type: 'format' | 'content' | 'length' | 'tone';
  rule: string;
}

interface PromptMetadata {
  author: string;
  createdAt: Date;
  lastUpdated: Date;
  effectiveness: number; // 成功率评分
  uses: number;
}
```

### 1.2 Prompt 仓库
- 创建 `src/nl/prompts/` 目录
- 按用途分类存放 Prompt
- 支持版本控制（v1, v2, ...）
- 提供 Prompt 测试和评估工具

---

## 2️⃣ 上下文感知增强

### 2.1 会话上下文
```typescript
interface SessionContext {
  sessionId: string;
  history: Message[];
  userPreferences: UserPreferences;
  projectContext: ProjectContext;
  recentActions: RecentAction[];
}

interface ProjectContext {
  cwd: string;
  gitStatus?: GitStatus;
  packageJson?: PackageJson;
  configFiles?: string[];
}

interface UserPreferences {
  executionMode: 'strict' | 'relaxed' | 'consensus';
  preferredTools: string[];
  verbose: boolean;
  autoConfirm: boolean;
}
```

### 2.2 动态 System Prompt 生成
```typescript
function buildContextAwareSystemPrompt(
  basePrompt: string,
  context: SessionContext
): string {
  let enhanced = basePrompt;
  
  // 添加项目上下文
  if (context.projectContext) {
    enhanced += `\n## 当前项目上下文\n`;
    enhanced += `- 工作目录: ${context.projectContext.cwd}\n`;
    if (context.projectContext.gitStatus) {
      enhanced += `- Git 状态: ${context.projectContext.gitStatus.branch}\n`;
    }
  }
  
  // 添加用户偏好
  enhanced += `\n## 用户偏好\n`;
  enhanced += `- 执行模式: ${context.userPreferences.executionMode}\n`;
  enhanced += `- 偏好工具: ${context.userPreferences.preferredTools.join(', ')}\n`;
  
  return enhanced;
}
```

---

## 3️⃣ 多阶段 Prompt 工程

### 3.1 意图识别阶段
```typescript
// 阶段1: 粗略意图分类
const INTENT_CLASSIFICATION_PROMPT = `
将用户输入分类到以下类别之一：
- 文件操作（file）
- Git 操作（git）
- npm 操作（npm）
- 系统信息（system）
- 网络操作（network）
- 其他（other）

输入: {userInput}
输出: {category}
`;

// 阶段2: 精确意图匹配
const INTENT_MATCHING_PROMPT = `
从以下意图列表中选择最匹配的：
{intentList}

用户输入: {userInput}
历史上下文: {history}
`;

// 阶段3: 参数提取
const PARAM_EXTRACTION_PROMPT = `
从用户输入中提取以下参数：
{paramSchema}

用户输入: {userInput}
`;
```

### 3.2 工作流生成多阶段
```typescript
// 阶段1: 需求分析
const ANALYSIS_PROMPT = `分析用户需求，确定：
1. 需要完成什么任务
2. 需要哪些步骤
3. 需要什么工具
`;

// 阶段2: 步骤设计
const STEP_DESIGN_PROMPT = `根据分析结果，设计工作流步骤...`;

// 阶段3: YAML 生成
const YAML_GENERATION_PROMPT = `生成符合 VectaHub 规范的 YAML...`;
```

---

## 4️⃣ 反馈循环和学习

### 4.1 执行后反馈
```typescript
async function getFeedbackAndRefine(
  workflow: Workflow,
  executionResult: ExecutionResult,
  userFeedback?: UserFeedback
): Promise<Workflow> {
  if (executionResult.success) {
    // 记录成功案例，用于 Prompt 优化
    recordSuccess(workflow, executionResult);
    return workflow;
  }
  
  // 失败，尝试优化
  const refined = await refineWorkflowWithLLM(
    workflow,
    executionResult,
    userFeedback
  );
  
  return refined;
}
```

### 4.2 Prompt 效果评估
- 收集每个 Prompt 的成功率
- A/B 测试不同版本
- 根据效果自动选择最佳 Prompt

---

## 5️⃣ LLM 功能扩展

### 5.1 智能工作流优化
```typescript
// 根据执行历史优化工作流
async function optimizeWorkflow(
  workflow: Workflow,
  history: ExecutionHistory[]
): Promise<Workflow> {
  const prompt = `
根据以下历史执行记录，优化当前工作流：

历史记录:
${formatHistory(history)}

当前工作流:
${formatWorkflow(workflow)}

请给出优化建议并生成优化后的 YAML。
`;
  
  return await llm.generateYAML(prompt);
}
```

### 5.2 自然语言调试助手
```typescript
// 当工作流执行失败时，提供自然语言调试建议
async function debugWorkflow(
  error: ExecutionError,
  workflow: Workflow
): Promise<string> {
  const prompt = `
工作流执行失败，请分析问题并给出修复建议：

错误信息:
${error.message}

工作流:
${formatWorkflow(workflow)}

请用简洁的中文给出：
1. 问题原因
2. 修复建议
3. 修正后的工作流（可选）
`;
  
  return await llm.chat(prompt);
}
```

### 5.3 工作流文档自动生成
```typescript
// 为保存的工作流自动生成使用文档
async function generateWorkflowDocs(workflow: Workflow): Promise<string> {
  const prompt = `
为以下工作流生成用户友好的使用说明：

工作流:
${formatWorkflow(workflow)}

请生成：
1. 一句话简介
2. 使用场景
3. 注意事项
4. 示例输入输出
`;
  
  return await llm.chat(prompt);
}
```

---

## 6️⃣ 可配置的 LLM 策略

### 6.1 LLM 策略配置
```typescript
interface LLMOptions {
  // 基础策略
  useLLM: boolean;
  fallbackToKeyword: boolean;
  
  // Prompt 策略
  promptVersion: string;
  useFewShot: boolean;
  useContext: boolean;
  
  // 生成策略
  temperature: number;
  maxTokens: number;
  autoRefine: boolean;
  maxRetries: number;
  
  // 成本策略
  useCheapModelForSimpleTasks: boolean;
  maxCostPerDay: number;
}
```

### 6.2 按任务难度选择模型
```typescript
function selectModelByTaskComplexity(task: string): string {
  const complexity = estimateComplexity(task);
  
  if (complexity === 'simple') {
    return 'gpt-4o-mini'; // 或 llama3
  } else if (complexity === 'medium') {
    return 'gpt-4o';
  } else {
    return 'gpt-4'; // 或 claude-3-5-sonnet
  }
}
```

---

## 7️⃣ Prompt 工程化工具

### 7.1 Prompt 测试套件
```bash
# 测试所有 Prompt
vectahub llm test

# 测试特定 Prompt
vectahub llm test --prompt intent-v2

# A/B 测试
vectahub llm ab-test --prompt intent-v1 --vs intent-v2
```

### 7.2 Prompt 管理命令
```bash
# 列出所有 Prompt
vectahub llm prompts list

# 查看 Prompt 详情
vectahub llm prompts show intent-v2

# 评估 Prompt 效果
vectahub llm prompts evaluate intent-v2

# 导出 Prompt
vectahub llm prompts export intent-v2 --to file.json
```

---

## 实施路线图

### Phase 1: 基础 Prompt 管理
- [ ] 创建 Prompt 数据结构
- [ ] 重构现有硬编码 Prompt
- [ ] 添加 Prompt 版本控制

### Phase 2: 上下文感知
- [ ] 实现会话上下文管理
- [ ] 动态构建 System Prompt
- [ ] 添加项目上下文注入

### Phase 3: 多阶段处理
- [ ] 拆分意图识别为多阶段
- [ ] 实现工作流生成流水线
- [ ] 添加反馈循环

### Phase 4: 功能扩展
- [ ] 实现智能工作流优化
- [ ] 添加调试助手
- [ ] 实现文档生成

### Phase 5: 工程化工具
- [ ] 开发 Prompt 测试工具
- [ ] 添加 A/B 测试框架
- [ ] 实现效果评估系统

---

## 总结

### 预期收益
1. **准确率提升**: 更好的上下文感知 + 多阶段处理
2. **灵活性增强**: 可配置的 Prompt 策略，适应不同场景
3. **可维护性**: 结构化的 Prompt 管理，方便迭代优化
4. **功能丰富**: 从简单意图识别扩展到智能助手、调试、优化
5. **成本优化**: 按任务复杂度选择模型，节省成本

### 关键原则
- **渐进式改进**: 先重构现有代码，不破坏现有功能
- **数据驱动**: 通过 A/B 测试和效果评估指导优化
- **用户体验优先**: 优化应该让用户感觉更智能、更易用
- **保持回退**: 始终保留关键词匹配作为兜底方案

---

**文档版本**: 1.0.0
**创建日期**: 2026-05-03
**状态**: 待讨论
