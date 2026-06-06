# Worktree 隔离层设计

> Document Status: Design Draft
> Authority: 本文定义 worktree 隔离层的目标架构、接口合同、diff 归因策略、清理策略和边界情况。实现细节以源码和测试为准。
> Traceability: 关联 `src/sandbox/worktree-manager.ts`、`docs/contracts.md` 中的 `AgentTaskContract.executionMode`、`docs/design/orchestration-and-delegation-architecture.md`。

## 定位

Worktree 隔离层是 VectaHub 执行治理的关键基础设施。

它的职责不是替代 git worktree，而是在 Agent 执行链路中提供**可审计、可归因、可恢复**的工作区隔离：

- 每个 Agent 任务在独立 worktree 中执行，避免并发任务互相污染。
- Agent 产生的 diff 可以精确归因到具体任务和 trace。
- 失败或完成后，worktree 被安全清理，不留下悬空资源。
- 非 git 项目降级到文件系统复制，保持行为一致。

```text
Agent Task (executionMode: isolated-required)
  -> Worktree Isolation Layer
     -> create isolated worktree (git worktree / fs cp fallback)
     -> agent runs in isolated cwd
     -> collect diff (git diff / fs diff)
     -> attribute changes to task + trace
     -> teardown and cleanup
```

## 当前实现事实

当前 `src/sandbox/worktree-manager.ts` 已提供基础能力：

- `createSandbox(options)` 可创建 git worktree 或降级为 `fs.cp`。
- `teardownSandbox(context)` 可移除 worktree 并清理残留分支。
- 分支命名规则：`vectahub/sandbox/{traceId}`。
- Worktree 存放路径：`{gitRoot}/.vectahub/worktrees/{traceId}`。
- 非 git 项目降级路径：`{sourceCwd}/.vectahub/worktrees/{traceId}`。

当前边界：

- 没有 diff 归因：Agent 执行后的变更无法精确映射回 `AgentTaskContract`。
- 没有并发安全：多个 Agent 任务使用同一 traceId 或同时创建 worktree 时可能冲突。
- 清理是同步的，失败后没有重试或孤儿回收机制。
- 没有与 execution record 或 trace 系统集成。
- 没有 checkpoint 或部分恢复能力。

## 目标

- 隔离层与 AgentTaskContract 执行模式绑定。
- diff 归因精确到任务、trace 和 Agent。
- 清理策略可靠，支持孤儿回收。
- 接口定义清晰，不包含实现代码。
- 保持本地优先、轻量、可审计。

## 非目标

- 不做分布式 worktree 池。
- 不做跨机器 worktree 同步。
- 不做 Agent 自主 worktree 管理。
- 不替代 git worktree 本身的语义。
- 不在 worktree 层面做完整文件快照或版本管理。

## 接口定义

### WorktreeIsolationManager

隔离层核心管理器接口。负责 worktree 生命周期和 diff 归因，不包含实现。

```typescript
/**
 * Worktree 隔离层管理器接口
 * 职责：worktree 创建、diff 归因、清理
 */
export interface IWorktreeIsolationManager {
  /**
   * 为指定任务创建隔离 worktree
   * 如果项目是 git 仓库，使用 git worktree
   * 如果项目不是 git 仓库，降级为文件系统复制
   */
  createIsolation(request: IsolationRequest): Promise<IsolationContext>;

  /**
   * 收集隔离 worktree 中的变更并归因
   * 返回归因后的 diff 结果
   */
  collectChanges(context: IsolationContext): Promise<ChangeAttribution>;

  /**
   * 清理隔离 worktree
   * 包括移除 worktree、清理分支、删除临时目录
   */
  teardownIsolation(context: IsolationContext): Promise<TeardownResult>;

  /**
   * 回收孤儿 worktree
   * 扫描 .vectahub/worktrees 下的残留目录，清理未被活跃任务持有的资源
   */
  reclaimOrphans(options?: ReclaimOptions): Promise<ReclaimResult>;

  /**
   * 列出当前活跃的隔离 worktree
   */
  listActiveIsolations(): Promise<IsolationContext[]>;
}
```

### IsolationRequest

创建隔离 worktree 的请求参数。

```typescript
export interface IsolationRequest {
  /** 任务 ID，来自 AgentTaskContract.taskId */
  taskId: string;
  /** 追踪 ID，来自 trace 系统 */
  traceId: string;
  /** Agent 标识，例如 'codex'、'gemini'、'claude' */
  agentId: string;
  /** 源工作目录 */
  sourceCwd: string;
  /** 执行模式，决定隔离策略 */
  executionMode: 'serial' | 'parallel-eligible' | 'isolated-required';
  /** 基准 commit，默认 HEAD */
  baseRef?: string;
  /** 超时时间（毫秒），超过后 worktree 应被标记为孤儿 */
  timeoutMs?: number;
}
```

### IsolationContext

隔离创建后的运行时上下文。

```typescript
export interface IsolationContext {
  /** 任务 ID */
  taskId: string;
  /** 追踪 ID */
  traceId: string;
  /** Agent 标识 */
  agentId: string;
  /** 隔离 worktree 的绝对路径，Agent 应在此目录执行 */
  worktreePath: string;
  /** git 分支名（仅 git 模式） */
  branchName: string;
  /** 是否使用了降级模式（文件系统复制） */
  isFallback: boolean;
  /** 基准 commit SHA */
  baseCommitSha: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 过期时间戳（如果设置了 timeout） */
  expiresAt?: number;
}
```

### ChangeAttribution

变更归因结果。

```typescript
export interface ChangeAttribution {
  /** 任务 ID */
  taskId: string;
  /** 追踪 ID */
  traceId: string;
  /** Agent 标识 */
  agentId: string;
  /** 是否为 git 仓库 */
  isGitRepo: boolean;
  /** 变更文件列表 */
  changedFiles: ChangedFile[];
  /** 原始 diff（仅 git 模式，文本格式） */
  rawDiff?: string;
  /** 归因元数据 */
  attribution: AttributionMeta;
}

export interface ChangedFile {
  /** 文件的相对路径（相对于 worktree 根目录） */
  path: string;
  /** 变更类型 */
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  /** 旧路径（仅 rename） */
  oldPath?: string;
}

export interface AttributionMeta {
  /** 基准 commit SHA */
  baseCommitSha: string;
  /** 工作区 commit SHA（如果有） */
  worktreeCommitSha?: string;
  /** 归因时间戳 */
  attributedAt: number;
  /** 归因方式 */
  method: 'git-diff' | 'fs-diff';
}
```

### TeardownResult

清理结果。

```typescript
export interface TeardownResult {
  /** 是否成功清理 */
  success: boolean;
  /** 清理了哪些资源 */
  cleanedResources: string[];
  /** 清理失败的资源（不阻断，记录告警） */
  failedResources: Array<{ resource: string; error: string }>;
}
```

### ReclaimOptions / ReclaimResult

孤儿回收参数和结果。

```typescript
export interface ReclaimOptions {
  /** 最大存活时间（毫秒），超过此时间的 worktree 视为孤儿，默认 24h */
  maxAgeMs?: number;
  /** 是否强制清理（即使目录被锁定） */
  force?: boolean;
  /** 是否试运行，只报告不清理 */
  dryRun?: boolean;
}

export interface ReclaimResult {
  /** 扫描到的孤儿列表 */
  orphans: Array<{
    worktreePath: string;
    branchName?: string;
    ageMs: number;
    cleaned: boolean;
    error?: string;
  }>;
}
```

## Git Diff 归因策略

### 设计原则

- 每个 Agent 任务在独立 worktree 中执行，变更天然被隔离在独立分支上。
- 归因基于 `git diff {baseRef}..{worktreeBranch}` 或 `git diff {baseRef} -- {worktreePath}`。
- 归因结果必须包含任务 ID、trace ID、Agent ID 和基准 commit，确保可审计。
- 归因不依赖 Agent 自报，而是由 VectaHub 自行从 worktree 中采集。

### 归因流程

```text
1. 创建 worktree 时记录 baseCommitSha (HEAD 或指定 baseRef)
2. Agent 在 worktree 中执行
3. 执行完成后调用 collectChanges()
4. collectChanges 执行:
   a. git 模式: git diff --name-status {baseCommitSha} -- {worktreePath}
                 git diff {baseCommitSha} -- {worktreePath} (raw diff)
   b. 降级模式: 遍历 worktree 目录，与源目录做文件级别比较
5. 结果绑定 taskId + traceId + agentId + attribution meta
6. 归因结果写入 execution record
```

### diff 粒度

- **文件级归因**：每个变更文件关联到产生它的任务和 trace。
- **行级 diff**：通过 `rawDiff` 字段保留完整 diff 文本，但不解析为结构化行映射。行级分析留给上层（如 verification 或 review UI）。
- **跨 worktree 边界**：Agent 不能修改 worktree 路径之外的文件。如果 Agent 尝试写入外部路径，应由 sandbox 层拦截，不在归因层处理。

### 并发场景下的归因

当多个 Agent 任务并行执行时（`executionMode: parallel-eligible`），每个任务有独立的 worktree 和分支，归因互不干扰：

```text
Task A (trace-a) -> worktree at .vectahub/worktrees/trace-a, branch vectahub/sandbox/trace-a
Task B (trace-b) -> worktree at .vectahub/worktrees/trace-b, branch vectahub/sandbox/trace-b

归因 A: git diff HEAD..vectahub/sandbox/trace-a
归因 B: git diff HEAD..vectahub/sandbox/trace-b
```

### 非 git 项目的降级归因

当项目不是 git 仓库时，使用文件系统级别的比较：

```text
1. 创建 worktree 时通过 fs.cp 复制源目录
2. Agent 在副本中执行
3. collectChanges 遍历 worktree 目录
4. 与源目录做文件级别比较（存在性 + 内容 hash）
5. 输出 ChangedFile 列表，method 标记为 'fs-diff'
6. 不提供 rawDiff（无文本 diff 语义）
```
