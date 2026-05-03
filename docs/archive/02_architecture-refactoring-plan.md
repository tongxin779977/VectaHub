# VectaHub 1.0 架构重构计划

> ⚠️ **归档文档** - 此为历史规划，任务已完成
> 版本: 1.0.0 | 最后更新: 2026-05-03 | 状态: ✅ 已归档

---

## 执行摘要

基于对 VectaHub 1.0 代码库的全面分析，我们识别出以下需要重构优化的核心模块，以保持现有功能完整性的同时提升未来可扩展性、可维护性和性能：

### 核心重构模块

| 优先级 | 模块 | 问题类型 | 预估工作量 |
|--------|------|----------|------------|
| 🔴 高 | 自然语言处理 (NL) | 架构分散、硬编码过多 | 2-3 周 |
| 🔴 高 | 工作流引擎 | 职责过重、状态管理混乱 | 1-2 周 |
| 🟡 中 | CLI 命令系统 | 耦合过重、可扩展性差 | 1 周 |
| 🟡 中 | 插件/Skill 系统 | 未充分利用、集成度低 | 1 周 |
| 🟢 低 | 配置与类型系统 | 类型分散、缺少统一管理 | 0.5 周 |

---

## 第一部分：问题深度分析

### 1.1 自然语言处理 (NL) 模块问题

#### 问题 1：职责混乱
```typescript
// src/nl/llm.ts - 同时做了太多事情：
// 1. LLM API 调用
// 2. Prompt 构建
// 3. 响应解析
// 4. 会话管理
// 5. 配置加载
```

#### 问题 2：硬编码泛滥
**位置 1: `command-synthesizer.ts`**
```typescript
const COMMAND_TEMPLATES: Record<TaskType, CommandTemplate[]> = {
  GIT_OPERATION: [
    { synthesize: (params) => ({ cli: 'git', args: ['add', '-A'] }) },
    { synthesize: (params) => ({ cli: 'git', args: ['commit', '-m', params.message || 'auto commit'] }) },
    // ... 更多硬编码
  ],
  // ... 200+ 行硬编码逻辑
};
```

---

## 第二部分：重构方案

### 2.1 NL 模块重构

#### 目标架构
```
src/nl/
├── core/
│   ├── types.ts              # 统一类型定义
│   ├── context.ts            # 上下文管理
│   └── pipeline.ts           # Skill Pipeline
├── skills/                   # 核心 Skills
│   ├── intent-skill.ts       # 意图识别
│   ├── command-skill.ts      # 命令生成
│   └── workflow-skill.ts     # 工作流生成
├── prompt/                   # Prompt 管理
│   ├── registry.ts           # Prompt 注册表
│   ├── loader.ts             # 从文件加载
│   └── types.ts
├── fallback/                 # 降级策略
│   └── keyword-matcher.ts    # 关键词匹配
└── index.ts                  # 对外接口
```

### 2.2 工作流引擎重构

#### 目标架构
```
src/workflow/
├── core/
│   ├── types.ts              # 核心类型
│   └── context.ts            # 执行上下文
├── engine/
│   ├── workflow-manager.ts   # 工作流管理
│   ├── state-manager.ts      # 状态管理
│   └── scheduler.ts          # 调度器
├── executor/
│   ├── step-executor.ts      # 单步执行
│   ├── parallel-executor.ts  # 并行执行
│   └── interpolator.ts       # 变量插值
├── storage/
│   ├── storage.ts            # 持久化
│   └── types.ts
├── validator/
│   └── workflow-validator.ts # 工作流验证
└── index.ts                  # 对外接口
```

---

## 第三部分：实施计划

### Phase 1: 基础设施重构（1-2 周）
- [ ] 类型系统统一
- [ ] 配置系统实现
- [ ] Skill 系统完善
- [ ] 向后兼容层

### Phase 2: 工作流引擎重构（1-2 周）
- [ ] 组件拆分
- [ ] 重构实现
- [ ] 验证

### Phase 3: NL 模块重构（2-3 周）
- [ ] 核心基础设施
- [ ] Prompt 管理系统
- [ ] Skill 实现
- [ ] 配置迁移
- [ ] 集成与测试

### Phase 4: CLI 命令系统重构（1 周）
- [ ] 中间件系统
- [ ] 命令重构

### Phase 5: 优化与清理（1 周）
- [ ] 清理工作
- [ ] 性能优化

---

## 总结

本次重构将：

1. ✅ **消除硬编码** - 将 1200+ 行硬编码迁移到配置文件
2. ✅ **职责分离** - 将巨文件拆分为单一职责的组件
3. ✅ **Skill 驱动** - 将核心流程重构为 Skill 驱动架构
4. ✅ **统一抽象** - 定义清晰的接口，降低耦合
5. ✅ **向后兼容** - 保持现有功能完整，渐进式迁移
6. ✅ **测试保障** - 完整的测试覆盖，确保质量

---

**归档日期**: 2026-05-03
