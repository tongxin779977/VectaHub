# NL Task Contract Redesign

> Document Status: Proposed Design / Review Draft
> Authority: 定义 NL 系统从 `intent-first` 迁移到 `task-contract-first` 的目标设计。当前实现仍以源码行为为准。
> Last Verified: 2026-06-09

## Problem

当前 NL 体系的主要问题不是“没有接入 LLM”，而是系统把 `intent` 当成了产品核心对象，导致理解、执行和展示三层耦合在一起：

- 理解层倾向于把用户输入塞进固定 intent 标签。
- 执行层依赖多套分散的命令映射和 capability 规则。
- 展示层直接暴露 `Intent`、`step_*`、内部命令结果和调试语义。

结果是：

- 用户感觉系统在“猜标签”，而不是“理解任务”。
- 同一请求可能在 capability、LLM tool-calling 和旧模板路径中产生不同执行结果。
- 意图识别看似智能，真正执行却像模板引擎。
- UI 看起来像调试输出，而不是产品回复。

这就是“意图不智能”的根因。

## Design Decision

NL 系统的核心不再是“识别 intent”，而是：

```text
把用户请求建模成稳定的任务合同
-> 再选择合适的执行策略
-> 最后统一生成用户可理解的结果表示
```

结论：

- `intent` 降级为内部路由信号，不再作为产品主对象。
- `TaskContract` 升级为 NL 主合同。
- LLM 负责理解、抽取和规划候选任务，不负责结果真实性。
- 用户界面不再暴露 `intent`、`step_*`、内部 command surface 等调试对象。

## Goals

- 让语义理解优先于标签分类。
- 让相似请求收敛到同一任务合同，而不是分裂到多个 intent。
- 让 capability、LLM tool-calling、workflow 和 CLI 执行都围绕统一合同工作。
- 让结果展示变成产品语义，而不是编排语义。
- 让 LLM 输出只能影响“理解和规划”，不能直接声明事实或伪造执行结果。

## Non-Goals

本设计不要求：

- 删除所有 intent。
- 让 LLM 直接执行命令。
- 让 LLM 直接生成最终用户可见结果并作为事实真相。
- 一次性重写 capability router、workflow engine 和 chat UI。
- 在本阶段追求 autonomous agent 行为。

## Core Principles

### 1. Intent Is Internal

`intent` 只用于：

- 路由优化
- 评估统计
- 缓存命中
- 规则分流
- trace / audit

`intent` 不再用于：

- 决定产品主输出结构
- 直接展示给用户
- 充当唯一命令映射真相

### 2. Task Contract Is Primary

用户输入先形成 `TaskContract`，系统再根据合同决定：

- 直接回复
- 请求澄清
- 阻断
- 直接执行本地能力
- 生成 workflow draft
- 委托 Agent runtime

### 3. LLM Understands, System Verifies

LLM 负责：

- 归纳目标
- 抽取对象
- 判断约束
- 提议执行方式
- 生成澄清问题

VectaHub 负责：

- schema 校验
- capability 存在性校验
- command surface 校验
- 安全策略
- 执行
- 验证
- trace / recovery

### 4. Product UI Must Not Leak Routing Internals

用户应看到：

- 系统理解的任务摘要
- 即将采用的执行方式
- 结果或澄清问题

用户不应默认看到：

- `Intent: doctor`
- `step_doctor`
- `tool_call`
- `generated VectaHub command is not registered`

这些应该进入日志、trace 或 debug 模式。

## Target Model

### Task Contract

推荐主合同：

```ts
type TaskContract =
  | ReplyTaskContract
  | ClarifyTaskContract
  | ExecutionTaskContract
  | BlockedTaskContract;

interface TaskContractBase {
  schemaVersion: '1.0';
  requestId: string;
  rawInput: string;
  normalizedGoal: string;
  confidence: number;
  language: 'zh-CN' | 'en-US' | 'mixed' | 'unknown';
  internalSignals: {
    intentCandidates: string[];
    routeSource: 'capability' | 'llm-tool-calling' | 'rule' | 'mixed';
  };
}

interface ReplyTaskContract extends TaskContractBase {
  kind: 'reply';
  replyMode: 'answer' | 'explain' | 'status-summary';
  answerTopic: string;
}

interface ClarifyTaskContract extends TaskContractBase {
  kind: 'clarify';
  missing: string[];
  question: string;
}

interface BlockedTaskContract extends TaskContractBase {
  kind: 'blocked';
  reason: string;
  safetyCategory?: 'policy' | 'permission' | 'unsupported' | 'ambiguous';
}

interface ExecutionTaskContract extends TaskContractBase {
  kind: 'execute';
  taskKind: 'diagnose' | 'inspect' | 'modify' | 'generate' | 'delegate' | 'workflow';
  operation: string;
  target: {
    scope: 'project' | 'repo' | 'file' | 'session' | 'environment' | 'unknown';
    identifier?: string;
  };
  constraints: {
    requiresConfirmation: boolean;
    requiresVerification: boolean;
    sideEffects: Array<'read' | 'write' | 'command' | 'network'>;
  };
  executionStrategy: {
    mode: 'capability' | 'direct-command' | 'workflow-draft' | 'agent-runtime';
    capabilityId?: string;
    commandSurfaceId?: string;
  };
  expectedOutput: {
    format: 'text' | 'json' | 'report' | 'workflow';
    audience: 'user' | 'system';
  };
}
```

关键点：

- `taskKind` 高于 `intent`。
- `target` 和 `operation` 是一等公民。
- `executionStrategy` 是显式字段，不再靠多个模块隐式猜。
- `internalSignals.intentCandidates` 仍保留，但仅用于内部。

### Presentation Model

面向 UI 的结构不应直接复用 `TaskContract` 或 `NLResult`：

```ts
interface ChatPresentationModel {
  title: string;
  summary: string;
  actionLabel?: string;
  detailLines: string[];
  resultBody?: string;
  nextStepHint?: string;
}
```

`TaskContract` 是系统合同，`ChatPresentationModel` 才是产品输出。

## Execution Strategy Layer

`TaskContract` 生成后，不立即执行命令，而是进入统一策略选择层：

```text
TaskContract
-> Strategy Resolver
-> Reply / Clarify / Blocked / Direct Command / Workflow Draft / Agent Runtime
```

策略选择原则：

- `reply`：只做回答，不生成命令。
- `clarify`：信息不足时优先问问题，不猜。
- `blocked`：不安全或当前不支持时显式阻断。
- `direct-command`：单步、本地、低副作用且有稳定 command surface。
- `workflow-draft`：多步、有依赖、需要验证或存在副作用。
- `agent-runtime`：需要代码修改、跨文件分析或长任务执行。

## Why Current Intent Model Feels Unintelligent

### 1. It Over-Indexes On Label Selection

当前系统首先试图回答“这是哪个 intent”，而不是“用户到底要完成什么任务”。

副作用：

- 句式稍变就容易落到不同路径。
- 意图数量越多，边界越模糊。
- 中文自然表达越丰富，固定标签越容易失真。

### 2. It Under-Models Target And Goal

用户表达通常包含：

- 动作
- 目标对象
- 任务目的
- 约束条件

当前实现对动作词更敏感，对目标和目的建模不足。

示例：

```text
帮我诊断一下这个项目
看看这个仓库现在有什么环境问题
检查一下当前工程能不能正常开发
```

这三句本应收敛到同一个 `diagnose project environment` 任务合同，而不是只依赖某个 `doctor` intent 是否被正则或 tool-call 命中。

### 3. It Mixes Understanding With Command Selection

当前系统中：

- 模板定义
- tool-calling 映射
- category 路由
- command-dispatch 约束

都在部分承担“理解用户请求”的责任。

这会导致理解逻辑分散在多个层次，最终没有一个权威解释。

### 4. It Leaks Internal State To Users

当用户看到：

```text
Intent: doctor
  - step_doctor
```

系统就在告诉用户：

- “我没有产品级解释层”
- “你看到的是内部编排结构”

这会直接削弱“系统理解了我”的感受。

## Target Pipeline

推荐新主链路：

```text
User Input
-> Input Normalization
-> Semantic Task Modeling
-> TaskContract
-> Strategy Resolver
-> Validation
-> Execution / Reply / Clarify / Block
-> Presentation Model
-> UI
```

### Stage 1: Input Normalization

负责：

- 清理空白和噪声
- 识别语言
- 识别会话上下文引用
- 提取明显的局部显式目标

### Stage 2: Semantic Task Modeling

由 LLM 和规则共同完成，但产物必须是 `TaskContract`。

输出重点不是：

- `intent = doctor`

而是：

- `taskKind = diagnose`
- `target.scope = project`
- `operation = inspect current project environment and toolchain`
- `executionStrategy.mode = direct-command`

### Stage 3: Strategy Resolver

根据合同判断落地方式：

- capability
- direct command
- workflow draft
- agent runtime
- clarify
- blocked

### Stage 4: Validation

必须校验：

- schema
- command existence
- capability existence
- permission boundary
- side effect policy

### Stage 5: Presentation

执行前后都生成产品语义输出：

- 我理解你要做什么
- 我会如何处理
- 这是结果

## Mapping Policy

新设计下，`intent` 不应直接映射到命令；应先映射到任务语义，再映射到执行策略。

推荐分三层：

```text
Intent Candidate
-> Task Semantic Class
-> Execution Strategy
-> Runtime Command / Workflow / Agent
```

示例：

```text
doctor
-> taskKind: diagnose
-> strategy: direct-command
-> runtime: vectahub doctor
```

这样做的好处：

- 可以保留现有 intent 资产
- 避免每个 intent 直接持有最终命令
- 允许多个 intent 候选收敛到同一任务合同

## Migration Plan

### Phase 1: Introduce Task Contract Without Breaking Existing NLResult

- 在 `processInput()` 后新增 `TaskContract` 生成层。
- 保留现有 `NLResult` 兼容字段。
- 先让 `chat` 和 `run` 消费 `TaskContract` 的只读视图。

### Phase 2: Demote Intent To Internal Signals

- `intent` 不再作为 UI 默认输出。
- `step_*` 不再直接进入用户界面。
- trace 保留 `intentCandidates` 和 `routeSource`。

### Phase 3: Unify Execution Mapping

- 从 `TaskContract.executionStrategy` 派生执行动作。
- 删除 `intent -> command` 的分散手写映射。
- 所有可执行 surface 必须从真实 command registry 或 capability catalog 派生。

### Phase 4: Unify Chat And REPL Semantics

- `commands/chat.ts` 和 `chat/repl.ts` 统一到同一任务合同和展示模型。
- 只保留一套用户可见 NL 主链路。

### Phase 5: Retire Intent-First Product Language

- 文档、UI 和日志默认使用 `task summary`、`operation`、`target`。
- `intent` 仅在 debug / trace / eval 模式暴露。

## Acceptance Criteria

- 用户常见请求能够首先形成 `TaskContract`，而不是直接依赖 intent 标签分流。
- 相似表达能够收敛到同一任务语义和执行策略。
- UI 默认不再显示 `Intent`、`step_*`、内部命令调度对象。
- LLM 只负责任务理解和规划，不负责最终结果真实性。
- 所有执行 surface 都来自单一可验证事实源，而不是多套手写映射。

## Open Questions

- `TaskContract` 是否应直接演进为 `OrchestrationPlan` 的前置阶段，还是作为更轻量的 NL 前置合同长期保留。
- 对多轮对话，上下文继承字段应放在 `TaskContract`，还是放在独立 `ConversationContextPack`。
- `run` 与 `chat` 是否共享完全相同的 presentation policy，还是分别保留 CLI / REPL 风格差异。
