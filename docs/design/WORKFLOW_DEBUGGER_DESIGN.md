# 工作流调试器功能设计文档

## 1. 功能概述

工作流调试器是VectaHub的核心调试工具，提供工作流执行过程的可视化、断点设置、单步执行和状态检查功能，帮助开发者定位和修复工作流中的问题。

---

## 2. 功能需求分析

### 2.1 需求列表

| 需求ID | 需求描述 | 来源 |
|--------|---------|------|
| DBG-001 | 开发工作流执行过程可视化工具 | 产品需求 |
| DBG-002 | 支持断点设置和单步执行 | 产品需求 |
| DBG-003 | 实现工作流状态检查和变量监视 | 产品需求 |
| DBG-004 | 提供错误捕获和堆栈跟踪能力 | 产品需求 |
| DBG-005 | 支持工作流执行历史记录查询和回放 | 产品需求 |
| DBG-006 | 支持条件断点 | 功能需求 |

### 2.2 功能范围

**包含功能：**
- 断点管理（设置、启用、禁用、删除）
- 单步执行（step over）
- 变量监视
- 状态检查
- 执行历史记录
- 错误捕获和堆栈跟踪

**不包含功能：**
- 远程调试（后续迭代）
- 图形化调试界面（后续迭代）

---

## 3. 功能模块设计

### 3.1 模块架构

```
┌────────────────────────────────────────────────────────────────┐
│                    Workflow Debugger                          │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Debugger API │  │ Debugger     │  │ CLI Commands │        │
│  │ (类型定义)   │  │ Core         │  │              │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                 │                  │                 │
│         └─────────────────┼──────────────────┘                 │
│                           ▼                                   │
│                    ┌──────────────┐                           │
│                    │  History     │                           │
│                    │  Storage     │                           │
│                    └──────────────┘                           │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块职责

| 模块 | 职责 | 关键类/函数 |
|------|------|------------|
| **Debugger API** | 定义调试器接口规范 | `Breakpoint`, `DebugState`, `WatchExpression` |
| **Debugger Core** | 调试逻辑核心 | `setBreakpoint()`, `stepOver()`, `runWorkflow()` |
| **CLI Commands** | 调试命令接口 | `breakpoint set/list/enable/disable/remove` |
| **History Storage** | 执行历史存储 | 文件系统存储 |

---

## 4. 接口定义

### 4.1 断点类型

```typescript
export type BreakpointType = 'step' | 'condition' | 'error';
```

### 4.2 断点接口

```typescript
export interface Breakpoint {
  id: string;
  stepId: string;
  type: BreakpointType;
  condition?: string;
  enabled: boolean;
  hitCount: number;
}
```

### 4.3 调试状态接口

```typescript
export interface DebugState {
  workflowId: string;
  currentStepId: string;
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'error';
  variables: Record<string, unknown>;
  callStack: StepFrame[];
  breakpoints: Breakpoint[];
  lastError?: ErrorInfo;
}
```

### 4.4 调用栈帧接口

```typescript
export interface StepFrame {
  stepId: string;
  stepName: string;
  timestamp: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}
```

### 4.5 错误信息接口

```typescript
export interface ErrorInfo {
  message: string;
  stack: string;
  timestamp: number;
  stepId: string;
}
```

### 4.6 监视表达式接口

```typescript
export interface WatchExpression {
  id: string;
  expression: string;
  value?: unknown;
  error?: string;
}
```

---

## 5. 功能流程设计

### 5.1 调试执行流程

```
设置断点 → 启动调试 → 执行工作流 → 遇到断点 → 暂停 → 单步执行 → 完成
              │              │            │          │         │
              │              │            │          │         ▼
              │              │            │          │    继续/停止
              │              │            │          ▼
              │              │            │    变量监视
              │              │            ▼
              │              │    检查条件断点
              │              ▼
              │         检查断点
              ▼
         加载工作流
```

### 5.2 CLI命令流程

#### 5.2.1 设置断点

```
vectahub debug breakpoint set step-1 -c "value > 10"
    │
    ▼
验证参数 → 创建断点对象 → 存储断点 → 输出确认
```

#### 5.2.2 查看状态

```
vectahub debug state
    │
    ▼
获取当前状态 → 格式化输出 → 显示工作流ID、当前步骤、变量、调用栈
```

#### 5.2.3 查看历史

```
vectahub debug history
    │
    ▼
读取历史记录 → 格式化输出 → 显示执行列表
```

---

## 6. 数据结构设计

### 6.1 执行历史结构

```typescript
interface ExecutionHistory {
  workflowId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  steps: StepExecution[];
}

interface StepExecution {
  stepId: string;
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startTime: number;
  endTime?: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error?: ErrorInfo;
}
```

---

## 7. 测试设计

### 7.1 测试覆盖范围

| 测试类型 | 测试内容 | 覆盖度目标 |
|---------|---------|-----------|
| **单元测试** | 断点管理、调试状态、监视表达式 | 100% |
| **集成测试** | 工作流调试执行、历史记录 | 100% |

### 7.2 测试用例设计

| 测试场景 | 预期结果 |
|---------|---------|
| 设置普通断点 | 断点创建成功 |
| 设置条件断点 | 条件存储正确 |
| 启用/禁用电断点 | 状态更新正确 |
| 删除断点 | 断点被移除 |
| 添加监视表达式 | 表达式注册成功 |
| 执行遇到断点 | 执行暂停 |
| 单步执行 | 执行下一步 |

---

**文档版本**: v1.0  
**创建日期**: 2026-05-06  
**作者**: VectaHub Debugger Team