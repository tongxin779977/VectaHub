# AI CLI 环境发现与智能降级集成计划

> 基于现有项目架构分析，制定将环境发现与智能降级功能融入 VectaHub 的实施计划。

---

## 一、现状分析

### 1.1 设计文档核心功能

| 模块 | 职责 | 设计文档定义 |
|------|------|-------------|
| EnvironmentDetector | 扫描环境中的 AI CLI 工具 | 检测 gemini/claude/codex/aider/opencli 可用性 |
| ProviderRegistry | 管理工具注册表和优先级 | 构建降级路径图，查询接口 |
| FallbackStrategy | 智能降级决策 | 根据条件自动降级到替代工具 |
| AIDelegateExecutor | 委派执行器 | 执行 AI 任务，处理失败重试 |

### 1.2 项目现有相关模块

| 现有模块 | 路径 | 功能 | 与设计文档关系 |
|---------|------|------|---------------|
| **ToolScanner** | `src/cli-tools/discovery/scanner.ts` | 通用 CLI 工具发现（git/npm/docker等） | **可复用**，但需要扩展 AI CLI 工具检测 |
| **Known Tools** | `src/cli-tools/discovery/known-tools.ts` | 已知工具库定义 | **需扩展**，添加 AI CLI 工具定义 |
| **AI Delegate** | `src/workflow/ai-delegate.ts` | AI 委托执行框架（Session/Task/Daemon管理） | **需集成**，缺少环境检测和降级逻辑 |
| **Executor** | `src/workflow/executor.ts` | 工作流步骤执行器 | **需修改**，增加 AI 委派执行入口 |
| **CLI Commands** | `src/cli.ts` + `src/utils/tools.ts` | Commander.js 命令体系 | **需扩展**，添加 `vectahub ai` 子命令 |
| **Audit Logger** | `src/utils/audit.ts` | 审计日志框架 | **可复用**，记录环境检测和降级事件 |

### 1.3 关键差异对比

| 维度 | 设计文档方案 | 现有项目方案 | 融合策略 |
|------|-------------|-------------|----------|
| **检测工具** | `which` + `spawn` | `execFile` + PATH 扫描 | 复用 ToolScanner 架构 |
| **AI 工具列表** | 5个（gemini/claude/codex/aider/opencli） | 10个通用工具（无AI工具） | 扩展 KNOWN_TOOLS |
| **状态类型** | `available/installed/not_found/version_mismatch/permission_denied` | 简单的 `discovered/failed` | 扩展 DiscoveredTool 类型 |
| **降级逻辑** | FallbackStrategy 独立模块 | 无 | **新建模块** |
| **配置管理** | `~/.vectahub/ai-config.yaml` | `vectahub-dev.config.yaml` | 新建 AI 专用配置 |

---

## 二、集成架构设计

### 2.1 模块归属

| 新模块 | 文件路径 | 负责 Agent | 依赖现有模块 |
|--------|---------|-----------|-------------|
| AI 工具定义 | `src/cli-tools/discovery/ai-tools.ts` | Agent D | KNOWN_TOOLS |
| 环境检测器 | `src/workflow/ai-env-detector.ts` | Agent D | ToolScanner |
| 提供者注册表 | `src/workflow/ai-provider-registry.ts` | Agent D | 无 |
| 降级策略 | `src/workflow/ai-fallback-strategy.ts` | Agent D | ProviderRegistry |
| AI 配置管理 | `src/utils/ai-config.ts` | Agent G | yaml |
| AI CLI 命令 | `src/utils/ai.ts` | Agent A | 以上所有模块 |

### 2.2 数据流图

```
启动 vectahub
    │
    ▼
┌─────────────────────────┐
│  ToolScanner (现有)       │  扫描通用 CLI 工具
└────────────┬────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌─────────────┐  ┌─────────────────────┐
│ 通用工具     │  │ AIEnvDetector (新)   │  扫描 AI CLI 工具
│ 注册表      │  │ - 复用 ToolScanner   │
└─────────────┘  │ - 扩展 AI 工具定义    │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ ProviderRegistry     │  构建降级图
                 │ (新)                 │  - available 列表
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ FallbackStrategy     │  降级决策
                 │ (新)                 │  - 自动降级
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ AIDelegateExecutor   │  执行 AI 任务
                 │ (现有 ai-delegate)   │  - 集成降级逻辑
                 └─────────────────────┘
```

### 2.3 类型系统融合

**扩展现有类型（`src/cli-tools/discovery/types.ts`）：**

```typescript
// 新增 AI 专用状态
export type AIProviderStatus = 
  | 'available'        // 对应现有的 discovered
  | 'installed'        // 已安装但缺配置（新增）
  | 'not_found'        // 对应现有的 failed
  | 'version_mismatch' // 版本不匹配（新增）
  | 'permission_denied'; // 权限不足（新增）

// 扩展 DiscoveredTool
export interface AIDiscoveredTool extends DiscoveredTool {
  aiStatus: AIProviderStatus;
  requiredEnvVars: string[];
  missingEnvVars: string[];
  minVersion?: string;
  priority: number;
  fallbackTargets: string[];
}
```

---

## 三、实施步骤

### Phase 1: 基础设施（P0）

#### Step 1.1: 定义 AI CLI 工具库

**文件**: `src/cli-tools/discovery/ai-tools.ts`

**内容**:
- 定义 5 个 AI CLI 工具的 KnownTool 配置
- 包含: gemini, claude, codex, aider, opencli
- 每个工具配置: name, versionCommands, requiredEnvVars, minVersion, priority, fallbackTargets

**依赖**: `src/cli-tools/discovery/known-tools.ts`

---

#### Step 1.2: 创建环境检测器

**文件**: `src/workflow/ai-env-detector.ts`

**内容**:
- `EnvironmentDetector` 类
- `scan()`: 扫描所有 AI 工具，返回 `EnvironmentReport`
- `detectProvider()`: 检测单个工具可用性
- `getVersion()`: 获取工具版本
- `isVersionOlder()`: semver 比较
- 复用 `ToolScanner` 的路径扫描逻辑
- 检查环境变量（API Key 等）

**依赖**: 
- `src/cli-tools/discovery/scanner.ts`
- `src/cli-tools/discovery/ai-tools.ts`
- `src/utils/audit.ts`

---

#### Step 1.3: 创建提供者注册表

**文件**: `src/workflow/ai-provider-registry.ts`

**内容**:
- `ProviderRegistry` 类
- `getAvailableProviders()`: 获取可用工具列表
- `getProvider()`: 查询特定工具
- `getFallbackTargets()`: 获取降级目标
- `getRecommendedProvider()`: 获取推荐工具
- `canUseProvider()`: 检查工具可用性
- `buildFallbackGraph()`: 构建降级路径图
- `printStatus()`: 打印环境状态

**依赖**: `src/workflow/ai-env-detector.ts`

---

#### Step 1.4: 创建降级策略引擎

**文件**: `src/workflow/ai-fallback-strategy.ts`

**内容**:
- `FallbackStrategy` 类
- `resolveProvider()`: 解析最终使用的提供者
- `findFallbackTarget()`: 查找降级目标
- `promptUser()`: 用户确认交互
- 支持配置: autoFallback, promptBeforeSwitch, maxFallbackAttempts, timeoutMs

**依赖**: `src/workflow/ai-provider-registry.ts`

---

#### Step 1.5: 创建 AI 配置管理

**文件**: `src/utils/ai-config.ts`

**内容**:
- `loadAIConfig()`: 加载 `~/.vectahub/ai-config.yaml`
- `saveAIConfig()`: 保存配置
- `getDefaultAIConfig()`: 默认配置
- 配置结构: environment_scan, fallback, provider_priority, built_in_ai

**依赖**: `yaml`

---

### Phase 2: 集成与 CLI 命令（P0）

#### Step 2.1: 集成到 Executor

**文件**: `src/workflow/executor.ts` (修改)

**修改内容**:
- 导入 `FallbackStrategy`
- 在 `executeStep()` 中增加 `delegate_to` 类型步骤处理
- 调用 `fallback.resolveProvider()` 解析提供者
- 委托给 `ai-delegate.ts` 的 `createDelegateExecutor()` 执行

---

#### Step 2.2: 更新 AI Delegate

**文件**: `src/workflow/ai-delegate.ts` (修改)

**修改内容**:
- 在 `executeDelegate()` 中集成降级逻辑
- 执行失败时触发降级
- 记录降级事件到审计日志

---

#### Step 2.3: 创建 AI CLI 命令

**文件**: `src/utils/ai.ts`

**内容**:
- `vectahub ai status`: 查看环境状态
- `vectahub ai rescan`: 重新扫描环境
- `vectahub ai list`: 列出可用提供者
- `vectahub ai test <provider>`: 测试特定提供者
- `vectahub ai config <key> <value>`: 配置降级策略

**依赖**: 以上所有新模块

---

#### Step 2.4: 注册 CLI 命令

**文件**: `src/cli.ts` (修改)

**修改内容**:
- 导入 `aiCmd`
- 添加 `program.addCommand(aiCmd)`

---

### Phase 3: 测试与优化（P1）

#### Step 3.1: 环境检测测试

**文件**: `src/workflow/ai-env-detector.test.ts`

**测试用例**:
- 检测可用提供者
- 报告缺失环境变量
- 检测版本不匹配
- 并行检测性能

---

#### Step 3.2: 降级策略测试

**文件**: `src/workflow/ai-fallback-strategy.test.ts`

**测试用例**:
- 使用可用提供者
- 降级到下一个可用工具
- 全部不可用时降级到 built-in
- 禁用自动降级时抛出错误
- 用户交互确认

---

#### Step 3.3: 缓存优化

**文件**: `src/workflow/ai-env-detector.ts` (修改)

**优化内容**:
- 添加检测结果缓存
- 24 小时过期策略
- 支持 `force` 参数强制重新扫描
- 使用 `Promise.all` 并行检测

---

### Phase 4: 文档与集成（P2）

#### Step 4.1: 更新设计文档索引

**文件**: `docs/design/README.md`

**内容**:
- 添加 AI 环境发现与降级设计文档链接
- 更新模块归属表

---

#### Step 4.2: 更新项目规则

**文件**: `.trae/rules/project_rules.md`

**内容**:
- 在模块分配表中添加 AI 环境检测模块
- 更新 CLI 命令列表

---

## 四、文件清单

### 4.1 新增文件

| 文件 | 阶段 | 优先级 | 行数估算 |
|------|------|--------|---------|
| `src/cli-tools/discovery/ai-tools.ts` | Phase 1 | P0 | ~80 |
| `src/workflow/ai-env-detector.ts` | Phase 1 | P0 | ~200 |
| `src/workflow/ai-provider-registry.ts` | Phase 1 | P0 | ~150 |
| `src/workflow/ai-fallback-strategy.ts` | Phase 1 | P0 | ~150 |
| `src/utils/ai-config.ts` | Phase 1 | P0 | ~100 |
| `src/utils/ai.ts` | Phase 2 | P0 | ~200 |
| `src/workflow/ai-env-detector.test.ts` | Phase 3 | P1 | ~100 |
| `src/workflow/ai-fallback-strategy.test.ts` | Phase 3 | P1 | ~100 |

### 4.2 修改文件

| 文件 | 修改内容 | 阶段 | 优先级 |
|------|---------|------|--------|
| `src/cli-tools/discovery/types.ts` | 添加 AIProviderStatus 类型 | Phase 1 | P0 |
| `src/cli-tools/discovery/index.ts` | 导出 AI 工具 | Phase 1 | P0 |
| `src/workflow/executor.ts` | 集成 AI 委派执行 | Phase 2 | P0 |
| `src/workflow/ai-delegate.ts` | 集成降级逻辑 | Phase 2 | P0 |
| `src/cli.ts` | 注册 AI 命令 | Phase 2 | P0 |

---

## 五、风险与注意事项

### 5.1 依赖风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `which` 包未安装 | 环境检测失败 | 使用现有的 PATH 扫描逻辑替代 |
| API Key 检测安全 | 可能泄露敏感信息 | 只检查存在性，不记录值 |
| 版本检测超时 | 启动慢 | 设置 5s 超时，并行检测 |

### 5.2 兼容性注意事项

1. **类型兼容**: 新类型需与现有 `DiscoveredTool` 兼容
2. **审计日志**: 降级事件需记录到审计日志
3. **沙盒模式**: AI CLI 工具执行需遵循沙盒规则
4. **错误码**: 使用现有错误码体系（1001-1006）

### 5.3 安全注意事项

1. **环境变量**: 只检查是否存在，不暴露实际值
2. **PATH 安全**: 只检测标准 PATH 路径
3. **版本信息**: 只读取版本号
4. **用户权限**: 不需要 sudo 权限
5. **日志脱敏**: 不记录敏感信息

---

## 六、执行顺序

```
Phase 1 (P0 - 核心功能)
  ├── Step 1.1: ai-tools.ts         # AI 工具定义
  ├── Step 1.2: ai-env-detector.ts  # 环境检测器
  ├── Step 1.3: ai-provider-registry.ts  # 注册表
  ├── Step 1.4: ai-fallback-strategy.ts  # 降级策略
  └── Step 1.5: ai-config.ts        # 配置管理

Phase 2 (P0 - 集成)
  ├── Step 2.1: executor.ts 修改    # Executor 集成
  ├── Step 2.2: ai-delegate.ts 修改 # Delegate 集成
  ├── Step 2.3: ai.ts              # CLI 命令
  └── Step 2.4: cli.ts 修改         # 命令注册

Phase 3 (P1 - 测试)
  ├── Step 3.1: 检测测试
  ├── Step 3.2: 降级测试
  └── Step 3.3: 缓存优化

Phase 4 (P2 - 文档)
  ├── Step 4.1: 设计文档索引
  └── Step 4.2: 项目规则更新
```

---

## 七、验收标准

### 7.1 功能验收

- [ ] `vectahub ai status` 显示环境检测结果
- [ ] `vectahub ai rescan` 重新扫描环境
- [ ] `vectahub ai list` 列出可用提供者
- [ ] 用户指定不可用提供者时自动降级
- [ ] 降级逻辑记录审计日志
- [ ] 支持配置降级策略

### 7.2 测试验收

- [ ] 环境检测测试覆盖率 ≥ 80%
- [ ] 降级策略测试覆盖率 ≥ 75%
- [ ] 所有测试通过

### 7.3 性能验收

- [ ] 环境检测耗时 < 3s
- [ ] 降级决策耗时 < 100ms
- [ ] 缓存命中率 > 90% (24小时内)

---

```yaml
version: 1.0.0
createdAt: 2026-05-02
status: plan_created
totalSteps: 15
phases: 4
estimatedNewFiles: 8
estimatedModifiedFiles: 5
```
