# VectaHub 实用工程能力提升方案

> 版本: 1.0.0
> 日期: 2026-05-02
> 目标: AI 友好、工具衔接、渐进式重构

---

## 一、现状分析

### 1.1 核心问题

| 问题 | 位置 | 影响 |
|------|------|------|
| **模块职责混乱** | `cli.ts`、`utils/` | AI 难以理解代码结构 |
| **工具衔接困难** | `run.ts`、`engine.ts` | 添加新功能需要改多处 |
| **缺乏统一协调** | 全局依赖、硬编码 | 可扩展性差 |
| **上下文传递弱** | 步骤之间数据流转 | 工具间数据共享困难 |
| **工具发现不足** | 无搜索、无元数据 | AI 和用户难以找到合适工具 |

### 1.2 实际痛点场景

**场景 1：AI 理解困难**
```
用户输入: "帮我查找文件并压缩"
AI 需要深入: cli.ts → run.ts → parser.ts → engine.ts
问题: 模块职责不清晰，AI 需要读大量代码才能理解流程
```

**场景 2：工具衔接困难**
```
用户想要: 先执行 git 命令，再执行 npm 命令，最后压缩文件
现状: 需要在多个文件中修改代码
问题: 工具之间没有统一协调机制
```

**场景 3：扩展困难**
```
用户想要: 添加一个新的工作流步骤类型 "http-call"
现状: 需要修改 executor.ts、类型定义、多处逻辑
问题: 缺乏统一的扩展点设计
```

---

## 二、核心提升方案

### 2.1 建立"AI 友好的模块边界"

#### 目标
让 AI 能快速理解各模块功能，减少代码阅读成本

#### 具体做法

**1. 模块入口标准化**

每个核心模块创建一个清晰的 `index.ts`，对外只暴露必要接口：

- `src/nl/index.ts` - NL 解析器入口
- `src/workflow/index.ts` - 工作流引擎入口  
- `src/cli-tools/index.ts` - 工具注册入口
- `src/skills/index.ts` - 技能系统入口

**2. 清理 `utils/` 文件夹**

当前问题：`utils/` 堆了太多不相关的功能

重构方案：
- `logger.ts` → `src/infrastructure/logger/`
- `audit.ts` → `src/infrastructure/audit/`
- `config.ts` → `src/infrastructure/config/`
- `errors.ts` → `src/infrastructure/errors/`
- 其他文件按功能归类到对应模块

**3. 模块使用示例文档**

每个模块的 `README.md` 包含：
- 模块职责（1-2句话）
- 核心接口列表
- 使用示例（3-5个典型场景）
- 依赖关系图

#### 边界条件

- ✅ 允许：模块内部自由组织代码
- ❌ 禁止：外部直接访问模块内部文件
- ✅ 允许：通过 `index.ts` 导出所有公共接口
- ❌ 禁止：循环依赖（A→B→C→A）

#### 举一反三

**AI 使用场景**：
- AI 查看 `nl/index.ts` 就能知道 NL 解析器提供什么功能
- AI 查看 `workflow/index.ts` 就能知道工作流引擎的使用方式
- 不需要深入阅读实现细节

**开发场景**：
- 新功能开发时，通过模块入口找到正确的位置
- 重构时，只影响模块内部，不影响外部使用

---

### 2.2 实现"统一工具协调器"

#### 目标
让所有工具（CLI 工具、工作流步骤、技能等）都能方便衔接

#### 当前问题

**run.ts 中的问题**：
```typescript
// 当前 run.ts 中混合了太多职责：
// 1. 解析自然语言
// 2. 创建工作流
// 3. 执行工作流
// 4. 保存工作流
// 5. 显示结果
```

**engine.ts 中的问题**：
```typescript
// 引擎直接依赖审计日志、存储、执行器
// 无法轻松替换其中任何一个组件
```

#### 具体做法

**1. 定义标准工具接口**

所有工具都实现统一接口：

```
interface Tool {
  name: string;              // 工具名称（如 "git"、"npm"）
  description: string;       // 工具描述
  category: string;          // 分类（如 "version-control"、"build"）
  commands: ToolCommand[];   // 支持的命令列表
  execute(command: string, args: string[]): Promise<ToolResult>;
}

interface ToolCommand {
  name: string;              // 命令名称（如 "status"、"commit"）
  description: string;       // 命令描述
  parameters: Parameter[];   // 参数定义
  validate(args: string[]): boolean;
}

interface ToolResult {
  success: boolean;
  output: string[];
  error?: string;
  context?: Record<string, any>;
}
```

**2. 实现工具注册中心**

统一管理所有工具：

```
class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(category?: string): Tool[];
  search(keyword: string): Tool[];
}
```

**3. 提供工具链功能**

让多个工具可以串联执行：

```
interface ToolChain {
  steps: ToolStep[];
  context: ExecutionContext;
  
  addStep(tool: Tool, command: string, args: string[]): void;
  execute(): Promise<ToolChainResult>;
}
```

#### 边界条件

- ✅ 允许：工具实现自己的内部逻辑
- ❌ 禁止：工具直接访问其他工具的内部状态
- ✅ 允许：通过 ToolRegistry 查询和调用工具
- ✅ 允许：工具通过 ExecutionContext 共享数据

#### 举一反三

**用户场景**：
```bash
# 用户可以轻松组合工具
vectahub run "git status && npm test && compress images"
```

**AI 场景**：
- AI 查询 ToolRegistry 找到所有可用工具
- AI 根据用户意图推荐合适的工具组合
- AI 通过标准接口调用工具，不需要深入实现细节

**开发场景**：
- 新工具只需实现接口 → 注册 → 即可使用
- 不需要修改其他代码
- 工具可以被工作流、CLI、技能等任何地方调用

---

### 2.3 建立"上下文传递机制"

#### 目标
让工具之间的数据流转更自然

#### 当前问题

**engine.ts 中的上下文传递**：
```typescript
// 当前只有简单的 previousOutputs
// 缺乏完整的上下文管理
```

#### 具体做法

**1. 定义标准化上下文**

```
interface ExecutionContext {
  variables: Map<string, any>;      // 变量存储
  previousOutputs: Map<string, any>; // 上一步输出
  metadata: ExecutionContextMeta;   // 元数据
  tools: Map<string, ToolResult>;   // 工具执行结果
}

interface ExecutionContextMeta {
  workflowId: string;
  executionId: string;
  currentStep: string;
  startTime: Date;
  totalSteps: number;
  completedSteps: number;
}
```

**2. 实现上下文管理器**

```
class ContextManager {
  private context: ExecutionContext;
  
  get(key: string): any;
  set(key: string, value: any): void;
  getPreviousOutput(stepId: string): any;
  setPreviousOutput(stepId: string, output: any): void;
  getToolResult(toolName: string): ToolResult | undefined;
  setToolResult(toolName: string, result: ToolResult): void;
}
```

**3. 提供上下文转换工具**

```
interface ContextTransformer {
  transform(source: ExecutionContext, target: ExecutionContext): void;
  export(context: ExecutionContext): Record<string, any>;
  import(data: Record<string, any>): ExecutionContext;
}
```

#### 边界条件

- ✅ 允许：工具读取上下文中的数据
- ✅ 允许：工具更新自己相关的上下文数据
- ❌ 禁止：工具删除其他工具的上下文数据
- ✅ 允许：上下文在工具之间传递

#### 举一反三

**工作流场景**：
```yaml
steps:
  - id: step1
    type: exec
    cli: git
    args: ["status"]
    output: "git_status"
    
  - id: step2
    type: exec
    cli: npm
    args: ["test"]
    dependsOn: ["step1"]
    
  - id: step3
    type: exec
    cli: compress
    args: ["${git_status.output}", "${step2.output}"]
```

**调试场景**：
- 可以查看完整的上下文流转历史
- 可以导出上下文用于分析问题
- 可以导入上下文用于复现问题

---

### 2.4 实现"智能工具发现"

#### 目标
让 AI 和用户都能轻松找到需要的工具

#### 当前问题

**cli.ts 中的工具注册**：
```typescript
// 当前只注册了 git 工具
// 没有搜索功能
// 没有元数据描述
```

#### 具体做法

**1. 为工具添加详细元数据**

```
interface ToolMetadata {
  name: string;
  description: string;
  category: string;
  tags: string[];           // 标签（如 ["git", "version-control"]）
  examples: ToolExample[];  // 使用示例
  parameters: Parameter[];  // 参数定义
  relatedTools: string[];   // 相关工具
}

interface ToolExample {
  description: string;
  command: string;
  expectedOutput: string;
}
```

**2. 实现搜索功能**

```
class ToolDiscoveryService {
  private registry: ToolRegistry;
  
  search(keyword: string): Tool[];
  searchByCategory(category: string): Tool[];
  searchByTag(tag: string): Tool[];
  recommend(intent: string): Tool[];
}
```

**3. 生成工具目录文档**

自动从工具元数据生成：
- 工具列表（按分类）
- 每个工具的详细说明
- 使用示例
- 相关工具推荐

#### 边界条件

- ✅ 允许：工具定义自己的元数据
- ✅ 允许：用户通过搜索找到工具
- ❌ 禁止：搜索结果包含未注册的工具
- ✅ 允许：AI 根据意图推荐工具

#### 举一反三

**AI 使用场景**：
```
用户输入: "帮我查看 git 状态并提交"
AI 查询: ToolDiscoveryService.search("git status commit")
AI 推荐: git 工具 → status 命令 + commit 命令
```

**用户使用场景**：
```bash
# 搜索工具
vectahub tools search "compress images"

# 查看工具详情
vectahub tools info git

# 查看分类
vectahub tools list version-control
```

---

## 三、实施路径

### Phase 1: 模块边界清晰化（1-2周）

**目标**：让 AI 能快速理解代码结构

**具体任务**：
1. [ ] 创建核心模块的 `index.ts` 入口文件
2. [ ] 清理 `utils/` 文件夹，按功能归类
3. [ ] 为每个模块编写使用示例文档
4. [ ] 更新 `cli.ts`，使用新的模块入口

**验证标准**：
- AI 能通过模块入口快速了解功能
- 所有公共接口都有文档
- 没有循环依赖

**风险评估**：
- 风险：重构过程中可能破坏现有功能
- 缓解：保持向后兼容，逐步迁移

---

### Phase 2: 工具协调器开发（2-3周）

**目标**：让工具衔接更方便

**具体任务**：
1. [ ] 定义标准工具接口
2. [ ] 实现工具注册中心
3. [ ] 迁移现有 CLI 工具到新架构
4. [ ] 实现工具链功能
5. [ ] 更新 `run.ts`，使用工具协调器

**验证标准**：
- 所有工具都通过注册中心管理
- 工具可以串联执行
- 新工具可以轻松添加

**风险评估**：
- 风险：现有工具迁移困难
- 缓解：创建适配器，保持兼容

---

### Phase 3: 上下文传递机制（1-2周）

**目标**：让工具之间数据流转更自然

**具体任务**：
1. [ ] 定义标准上下文格式
2. [ ] 实现上下文管理器
3. [ ] 集成到工作流引擎
4. [ ] 提供上下文转换工具

**验证标准**：
- 上下文在工具之间正确传递
- 可以查看上下文流转历史
- 上下文可以导出和导入

**风险评估**：
- 风险：上下文管理复杂
- 缓解：先实现基础功能，逐步增强

---

### Phase 4: 智能工具发现（1周）

**目标**：让 AI 和用户都能轻松找到工具

**具体任务**：
1. [ ] 为现有工具添加元数据
2. [ ] 实现搜索功能
3. [ ] 生成工具目录文档
4. [ ] 集成到 AI 意图识别

**验证标准**：
- 可以通过关键词搜索工具
- 可以根据意图推荐工具
- 工具目录文档完整

**风险评估**：
- 风险：元数据维护成本高
- 缓解：提供工具自动生成元数据

---

## 四、预期收益

### 4.1 AI 使用效率提升

- **代码理解**：AI 通过模块入口快速了解功能，减少 60% 代码阅读时间
- **功能调用**：AI 通过标准接口调用功能，减少 50% 调试时间
- **工具发现**：AI 通过搜索和推荐找到工具，减少 70% 查找时间

### 4.2 开发体验改善

- **添加新工具**：只需实现接口 + 注册，从 3-4 小时缩短到 30 分钟
- **工具组合**：通过工具链轻松串联，从修改多处代码到简单配置
- **数据流转**：通过上下文传递，工具间数据共享更自然

### 4.3 可维护性增强

- **模块职责**：清晰明确，重构影响范围小
- **测试覆盖**：模块隔离后更容易编写测试
- **文档完善**：每个模块都有使用示例

---

## 五、风险控制

### 5.1 渐进式重构

**原则**：
1. 先试点，再推广
2. 保持向后兼容
3. 小步快跑，逐步验证

**具体做法**：
- Phase 1 只重构模块边界，不改功能逻辑
- Phase 2 创建新架构，但保留旧代码
- Phase 3 逐步迁移，不一次性替换

### 5.2 测试保障

**策略**：
1. 重构前确保现有测试通过
2. 重构过程中保持测试通过
3. 重构后补充缺失测试

### 5.3 文档同步

**要求**：
1. 代码变更时同步更新文档
2. 新功能必须有使用示例
3. 破坏性变更必须有迁移指南

---

## 六、总结

这个方案聚焦于解决实际问题：

1. **AI 友好**：让 AI 能快速理解和使用代码
2. **工具衔接**：让工具之间协作更自然
3. **渐进重构**：不追求一步到位，而是逐步提升
4. **向后兼容**：保持现有功能，平滑迁移

预期效果：
- 开发效率提升 40%
- 工具添加时间缩短 80%
- AI 使用效率提升 60%
- 代码可维护性显著提升

---

version: 1.0.0
lastUpdated: 2026-05-02
