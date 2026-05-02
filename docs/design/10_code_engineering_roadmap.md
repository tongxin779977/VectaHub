# VectaHub 代码工程技术方案

> 版本: 2.0.0
> 日期: 2026-05-02
> 目标: 提高代码工程能力、可扩展性、可维护性

---

## 0. 现状分析

### 0.1 当前问题

| 维度 | 现状 | 问题 |
|------|------|------|
| **架构** | 单一层面 | 缺少分层架构、依赖关系混乱 |
| **技能系统** | 简单目录 | 缺少统一的技能注册和发现机制 |
| **扩展性** | 硬编码 | 缺少插件化、扩展点设计 |
| **测试** | 部分测试 | 缺少 E2E 测试、集成测试覆盖不足 |
| **文档** | 部分设计文档 | 缺少开发指南、API 文档 |
| **构建** | 基础 TypeScript | 缺少代码分割、Tree Shaking |
| **监控** | 基础日志 | 缺少性能监控、错误追踪 |

### 0.2 核心原则

1. **模块化**：单一职责，高内聚低耦合
2. **可测试**：依赖注入，易于单元测试
3. **可扩展**：插件架构，扩展点明确
4. **可维护**：清晰的代码结构和命名规范
5. **可部署**：独立构建，易于发布

---

## 1. 新架构设计

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层 (Application)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   CLI    │  │  VSCode  │  │  Web UI  │  │  REST API│       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    服务层 (Service Layer)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  NL Parser   │  │  Workflow    │  │  Execution   │          │
│  │   Service    │  │   Service    │  │   Service    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Skill     │  │    Config    │  │    Audit     │          │
│  │   Service    │  │   Service    │  │   Service    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    核心层 (Core Layer)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    工作流引擎 (Engine)                     │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │  │
│  │  │Executor │  │Storage  │  │Context  │  │Scheduler│     │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   技能系统 (Skills)                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │   Registry   │  │  Discovery   │  │   Lifecycle  │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   沙盒系统 (Sandbox)                       │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │  │
│  │  │ Security│  │ Isolation│  │Detector │                   │  │
│  │  └─────────┘  └─────────┘  └─────────┘                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    基础设施层 (Infrastructure)                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Logger  │  │ Config  │  │  Cache  │  │  Queue  │          │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 新目录结构

```
vectahub/
├── src/
│   ├── core/                          # 核心层
│   │   ├── workflow/                  # 工作流引擎
│   │   │   ├── engine/
│   │   │   │   ├── executor.ts        # 执行器 (抽象)
│   │   │   │   ├── scheduler.ts       # 调度器
│   │   │   │   └── state-machine.ts   # 状态机
│   │   │   ├── storage/               # 存储
│   │   │   │   ├── adapter.ts         # 存储适配器接口
│   │   │   │   ├── file-adapter.ts    # 文件存储
│   │   │   │   └── memory-adapter.ts  # 内存存储
│   │   │   └── types.ts               # 类型定义
│   │   ├── skills/                    # 技能系统
│   │   │   ├── registry/              # 技能注册
│   │   │   │   ├── registry.ts
│   │   │   │   └── types.ts
│   │   │   ├── discovery/             # 技能发现
│   │   │   │   ├── local-discovery.ts
│   │   │   │   └── npm-discovery.ts
│   │   │   └── lifecycle/             # 生命周期管理
│   │   │       ├── loader.ts
│   │   │       └── activator.ts
│   │   └── sandbox/                   # 沙盒系统
│   │       ├── security/              # 安全
│   │       │   ├── rules/
│   │       │   └── detector.ts
│   │       └── isolation/             # 隔离
│   │           ├── macos.ts
│   │           ├── linux.ts
│   │           └── windows.ts
│   │
│   ├── services/                      # 服务层
│   │   ├── nl-parser/
│   │   │   ├── nl-parser.service.ts
│   │   │   └── intent-matcher.service.ts
│   │   ├── workflow/
│   │   │   ├── workflow.service.ts
│   │   │   └── template.service.ts
│   │   ├── execution/
│   │   │   ├── execution.service.ts
│   │   │   └── audit.service.ts
│   │   ├── skill/
│   │   │   └── skill.service.ts
│   │   └── config/
│   │       └── config.service.ts
│   │
│   ├── skills/                        # 技能实现
│   │   ├── llm-dialog-control/        # LLM 对话控制
│   │   ├── iterative-refinement/      # 迭代优化
│   │   └── [new-skill]/               # 新技能
│   │
│   ├── application/                   # 应用层
│   │   ├── cli/                       # CLI
│   │   │   ├── commands/
│   │   │   └── cli.ts
│   │   └── api/                       # API (预留)
│   │
│   ├── infrastructure/                # 基础设施层
│   │   ├── logger/
│   │   │   ├── logger.ts
│   │   │   └── transports.ts
│   │   ├── config/
│   │   │   ├── loader.ts
│   │   │   └── validator.ts
│   │   └── cache/
│   │       └── cache.ts
│   │
│   └── types/                         # 全局类型
│       └── index.ts
│
├── tests/
│   ├── unit/                          # 单元测试
│   ├── integration/                   # 集成测试
│   └── e2e/                           # E2E 测试
│
├── docs/
│   ├── api/                           # API 文档
│   ├── guides/                        # 开发指南
│   └── design/                        # 设计文档
│
└── scripts/                           # 脚本
    ├── build.ts
    ├── test.ts
    └── release.ts
```

---

## 2. 核心设计

### 2.1 技能系统架构

#### 2.1.1 技能接口定义

```typescript
// src/core/skills/registry/types.ts
export interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  category: 'llm' | 'workflow' | 'security' | 'utility';
  tags?: string[];
}

export interface SkillConfig {
  [key: string]: any;
}

export interface SkillContext {
  config: SkillConfig;
  logger: Logger;
}

export interface Skill {
  metadata: SkillMetadata;
  
  activate(context: SkillContext): Promise<void>;
  deactivate(): Promise<void>;
  
  execute(...args: any[]): Promise<any>;
}

export interface SkillFactory {
  create(config?: SkillConfig): Skill;
}
```

#### 2.1.2 技能注册表

```typescript
// src/core/skills/registry/registry.ts
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private factories: Map<string, SkillFactory> = new Map();
  
  registerFactory(id: string, factory: SkillFactory): void {
    this.factories.set(id, factory);
  }
  
  register(skill: Skill): void {
    this.skills.set(skill.metadata.id, skill);
  }
  
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }
  
  list(category?: string): Skill[] {
    const skills = Array.from(this.skills.values());
    if (category) {
      return skills.filter(s => s.metadata.category === category);
    }
    return skills;
  }
  
  async loadAll(): Promise<void> {
    // 自动发现和加载技能
  }
}
```

### 2.2 依赖注入 (DI) 容器

```typescript
// src/core/di/container.ts
export interface DIContainer {
  register<T>(token: Token<T>, provider: Provider<T>): void;
  resolve<T>(token: Token<T>): T;
}

export type Token<T> = symbol | string | Constructor<T>;
export type Provider<T> = 
  | ClassProvider<T> 
  | FactoryProvider<T> 
  | ValueProvider<T>;

export class SimpleDIContainer implements DIContainer {
  private registry = new Map<Token<any>, Provider<any>>();
  private instances = new Map<Token<any>, any>();
  
  register<T>(token: Token<T>, provider: Provider<T>): void {
    this.registry.set(token, provider);
  }
  
  resolve<T>(token: Token<T>): T {
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }
    
    const provider = this.registry.get(token);
    if (!provider) {
      throw new Error(`No provider for token: ${String(token)}`);
    }
    
    const instance = this.createInstance(provider);
    this.instances.set(token, instance);
    return instance;
  }
  
  private createInstance<T>(provider: Provider<T>): T {
    // 实现实例化逻辑
  }
}
```

### 2.3 事件总线

```typescript
// src/core/events/event-bus.ts
export interface Event {
  type: string;
  payload?: any;
  timestamp: number;
}

export interface EventHandler {
  (event: Event): void | Promise<void>;
}

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  
  on(type: string, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }
  
  async emit(event: Event): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    for (const handler of handlers) {
      await Promise.resolve(handler(event));
    }
  }
}
```

### 2.4 存储适配器模式

```typescript
// src/core/workflow/storage/adapter.ts
export interface StorageAdapter {
  save<T>(key: string, value: T): Promise<void>;
  load<T>(key: string): Promise<T | undefined>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export class FileStorageAdapter implements StorageAdapter {
  constructor(private baseDir: string) {}
  
  async save<T>(key: string, value: T): Promise<void> {
    // 实现文件存储
  }
  
  async load<T>(key: string): Promise<T | undefined> {
    // 实现文件读取
  }
  
  // ...
}

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, any>();
  
  async save<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
  
  // ...
}
```

---

## 3. 代码工程规范

### 3.1 编码规范

#### 3.1.1 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| **类/接口** | PascalCase | `WorkflowEngine`, `SkillRegistry` |
| **函数/方法** | camelCase | `executeStep()`, `registerSkill()` |
| **常量** | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| **文件** | kebab-case | `skill-registry.ts`, `di-container.ts` |
| **类型** | PascalCase + `Type` 后缀 | `StepType`, `ExecutionStatus` |

#### 3.1.2 注释规范

```typescript
/**
 * 工作流执行器
 * 
 * @description 负责工作流的实际执行，包括步骤调度、上下文管理等
 * 
 * @example
 * ```typescript
 * const executor = new WorkflowExecutor(container);
 * await executor.execute(workflow);
 * ```
 */
export class WorkflowExecutor {
  /**
   * 执行单个步骤
   * 
   * @param step 要执行的步骤
   * @param context 执行上下文
   * @returns 执行结果
   * @throws {ExecutionError} 当执行失败时
   */
  async executeStep(step: Step, context: ExecutionContext): Promise<StepResult> {
    // 实现
  }
}
```

### 3.2 模块依赖规则

```
// 允许的依赖方向
application → services → core → infrastructure

// 禁止的依赖方向
infrastructure → core
core → services
services → application
```

### 3.3 测试策略

#### 3.3.1 测试金字塔

```
        /\
       /  \    E2E 测试 (10%)
      /    \
     /      \   集成测试 (30%)
    /        \
   /          \  单元测试 (60%)
  /____________\
```

#### 3.3.2 测试命名规范

```typescript
// 测试文件: [module].test.ts
// 测试用例:  should [expected behavior] when [condition]

describe('WorkflowExecutor', () => {
  it('should execute steps in order when workflow is sequential', async () => {
    // 测试
  });
  
  it('should throw ExecutionError when step fails', async () => {
    // 测试
  });
});
```

---

## 4. 扩展点设计

### 4.1 工作流步骤扩展

```typescript
// 自定义步骤类型
export interface StepTypeExtension {
  type: string;
  validator: (step: any) => boolean;
  executor: (step: any, context: any) => Promise<any>;
}

// 注册扩展
export class StepTypeRegistry {
  private extensions = new Map<string, StepTypeExtension>();
  
  register(extension: StepTypeExtension): void {
    this.extensions.set(extension.type, extension);
  }
}
```

### 4.2 LLM Provider 扩展

```typescript
export interface LLMProviderExtension {
  id: string;
  name: string;
  create(config: LLMConfig): LLMProviderClient;
}

export interface LLMProviderClient {
  complete(messages: Message[]): Promise<string>;
}
```

### 4.3 安全规则扩展

```typescript
export interface SecurityRule {
  id: string;
  name: string;
  check(command: string): boolean;
}

export class SecurityRuleRegistry {
  private rules = new Map<string, SecurityRule>();
  
  register(rule: SecurityRule): void {
    this.rules.set(rule.id, rule);
  }
  
  checkAll(command: string): boolean {
    return Array.from(this.rules.values()).every(rule => rule.check(command));
  }
}
```

---

## 5. 实现路线图

### Phase 1: 基础设施 (1-2 周)

- [ ] 建立 DI 容器
- [ ] 实现事件总线
- [ ] 重构存储适配器
- [ ] 建立日志系统
- [ ] 建立配置管理

### Phase 2: 核心重构 (2-3 周)

- [ ] 重构工作流引擎
- [ ] 实现技能注册表
- [ ] 重构服务层
- [ ] 实现扩展点

### Phase 3: 测试与文档 (1-2 周)

- [ ] 完善单元测试
- [ ] 建立集成测试
- [ ] 编写开发指南
- [ ] 编写 API 文档

### Phase 4: 新技能开发 (持续)

- [ ] 更多 LLM 相关技能
- [ ] 工作流优化技能
- [ ] 安全分析技能

---

## 6. 质量保障

### 6.1 代码质量检查

```json
// 工具链
{
  "eslint": "代码规范检查",
  "prettier": "代码格式化",
  "typecheck": "TypeScript 类型检查",
  "test": "自动化测试",
  "coverage": "测试覆盖率"
}
```

### 6.2 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run coverage
```

---

## 7. 总结

这个技术方案将把 VectaHub 从一个简单的工作流工具提升为：

✅ 架构清晰的分层系统
✅ 可扩展的插件化架构
✅ 可测试的依赖注入设计
✅ 可维护的代码规范
✅ 完善的文档和测试

预期效果：
- 开发效率提升 40%
- 新功能上线时间缩短 60%
- 测试覆盖率达到 85%+
- 代码可读性显著提升

---

version: 2.0.0
lastUpdated: 2026-05-02
