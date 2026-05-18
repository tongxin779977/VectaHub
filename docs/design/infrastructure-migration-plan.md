# VectaHub 基础设施全项目替换方案

## 1. 概述

本方案描述如何将项目从使用全局单例和 utils 模块的旧架构，逐步替换为使用依赖注入（DI）和标准化基础设施模块的新架构。

本方案适用于已完成以下前置工作的项目：
- ✅ Phase 1: SSOT 类型统一
- ✅ Phase 2: Interface-first 接口定义
- ✅ Phase 3: DI 依赖注入改造
- ✅ Phase 4: 基础设施模块整合

---

## 2. 架构对比

### 2.1 旧架构（全局单例模式）
```
- src/utils/
  - 各种工具函数、管理器
  - 全局单例通过 getXXXInstance() 获取
  - 测试困难，依赖硬编码

- src/workflow/
- src/sandbox/
- src/nl/
  - 各自独立，直接调用 utils 中的函数
```

### 2.2 新架构（依赖注入模式）
```
- src/infrastructure/
  - audit、config、errors、logger 等核心模块
  - paths、event、security、data、concurrency、loaders 新模块
  - 通过 DI 注入，无全局单例

- src/workflow/interfaces.ts
- src/sandbox/interfaces.ts
- ...
  - 统一接口定义，便于替换实现
```

---

## 3. 迁移策略

采用**渐进式迁移**策略，分阶段进行：

| 阶段 | 重点 | 风险等级 | 预计工作量 |
|------|------|----------|------------|
| 1 | 审计日志改造 | 低 | 1 天 |
| 2 | 安全协议改造 | 中 | 1-2 天 |
| 3 | 工作流引擎改造 | 高 | 3-5 天 |
| 4 | 自然语言处理改造 | 中 | 2-3 天 |
| 5 | 沙箱管理器改造 | 中 | 2-3 天 |
| 6 | 清理和验证 | 低 | 1 天 |

---

## 4. 详细迁移步骤

### 4.1 阶段一：审计日志迁移

#### 目标
将全局审计实例替换为 DI 方式。

#### 变更点

1. **入口改造** ([src/cli.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/cli.ts)):
```typescript
// 旧代码
import { getAuditInstance } from '../infrastructure/audit/index.js';
const audit = getAuditInstance();

// 新代码
import { AuditLogger } from '../infrastructure/audit/index.js';
const audit = new AuditLogger(sessionId, baseDir);
```

2. **模块内部改造** - 注入审计日志实例

例如 [src/workflow/engine.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/engine.ts):
```typescript
// WorkflowEngineDeps 接口扩展
interface WorkflowEngineDeps {
  executor?: Executor;
  storage?: Storage;
  contextManager?: ContextManager;
  stateManager?: ExecutionStateManager;
  audit?: AuditLogger; // 新增
}

// 在工厂函数中使用
export function createWorkflowEngine(deps: WorkflowEngineDeps = {}) {
  const audit = deps.audit ?? new AuditLogger();
  // ...
}
```

#### 验证
- 运行审计相关测试
- 检查日志文件是否正常生成

---

### 4.2 阶段二：安全协议迁移

#### 目标
将全局 SecurityGuard 替换为 DI 方式。

#### 变更点

1. **入口改造** ([src/security-protocol/index.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/security-protocol/index.ts) 或其他入口):
```typescript
// 旧代码
import { getSecurityGuard } from './factory.js';
const guard = getSecurityGuard();

// 新代码
import { createSecurityGuard, SecurityGuardDeps } from './factory.js';
const guard = createSecurityGuard({
  evaluators: [
    new CommandRuleEvaluator(),
    new SandboxSemanticEvaluator(),
    // 自定义评估器可以在此注入
  ]
});
```

2. **沙箱集成改造** ([src/sandbox/sandbox.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/sandbox/sandbox.ts)):
```typescript
// SandboxManagerDeps 扩展
interface SandboxManagerDeps {
  detector?: Detector;
  ruleEngine?: CommandRuleEngine;
  securityGuard?: SecurityGuard; // 新增
}
```

---

### 4.3 阶段三：工作流引擎迁移

#### 目标
将所有工作流相关代码转换为纯 DI 模式。

#### 变更点
1. **executor 注入链改造** ([src/workflow/executor.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/executor.ts)):
   - `ExecutorDeps` 中的依赖已经支持注入
   - 验证所有 Handler 也接受注入

2. **存储层改造** ([src/workflow/storage.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/workflow/storage.ts)):
   - 定义 IStorage 接口
   - 提供内存实现和文件实现两种选项
   - 通过 DI 注入

---

### 4.4 阶段四：自然语言处理迁移

#### 目标
将 NLP 相关模块改为 DI 模式。

#### 变更点

1. **NL 处理器创建改造** ([src/nl/core/pipeline.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/core/pipeline.ts)):
```typescript
// 已经支持
const nlProcessor = createNLProcessor({
  llmConfig: createLLMConfig(),
  semanticDetector: createSemanticDetector(),
});
```

2. **LLM 客户端抽象** ([src/nl/llm.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/nl/llm.ts)):
   - 确保 ILLMClient 接口完整
   - 提供不同 provider 的实现

---

### 4.5 阶段五：沙箱管理器迁移

#### 目标
完善沙箱模块的 DI 支持和测试覆盖。

#### 变更点
- 确保所有子组件（detector、ruleEngine）均可注入
- 提供 mock 实现便于测试

---

### 4.6 阶段六：清理和验证

#### 任务
1. 移除 `@deprecated` 警告（或保留作为过渡期提示）
2. 运行完整测试套件
3. 性能回归测试
4. 更新架构文档

---

## 5. 测试策略

### 5.1 单元测试
- 为每个接口创建 mock 实现
- 测试依赖注入配置的各种组合

### 5.2 集成测试
- 确保新 DI 链完整运行
- 验证向后兼容性（无参调用仍然正常）

### 5.3 回滚方案
如果出现问题，可使用 git 回滚到重构前的版本。

---

## 6. 进度跟踪

### 已完成 ✅
- Phase 1: SSOT 类型统一
- Phase 2: Interface-first 接口定义
- Phase 3: DI 依赖注入改造
- Phase 4: 基础设施整合

### 待进行 ⏳
- 全项目逐步替换为 DI 模式
- 各模块 index.ts 导出接口
- 完整测试验证

---

## 7. 注意事项

1. **向后兼容性** - 所有现有代码应该无需修改即可继续工作
2. **渐进式迁移** - 不要一次性改太多，逐个模块验证
3. **测试优先** - 每个变更后确保相关测试通过
4. **文档同步** - 及时更新架构文档

---

## 8. 成功标准

- [ ] 没有 `@deprecated` 警告（或已明确保留）
- [ ] 所有测试通过
- [ ] 可以方便地替换各个基础设施组件的实现
- [ ] 架构文档与代码一致
- [ ] 性能无明显下降

---

## 9. 相关文档

- [基础设施重构规范](file:///Users/xin.tong/apps/project/test_trae/VectaHub/.trae/specs/infrastructure-refactoring/spec.md)
- [Checklist](file:///Users/xin.tong/apps/project/test_trae/VectaHub/.trae/specs/infrastructure-refactoring/checklist.md)
- [任务清单](file:///Users/xin.tong/apps/project/test_trae/VectaHub/.trae/specs/infrastructure-refactoring/tasks.md)
- [架构文档](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/architecture.md)
