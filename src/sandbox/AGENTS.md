# AGENTS.md — src/sandbox/

> 父级 `AGENTS.md` 覆盖项目全局事实。本文只记载本目录的非显然设计决策与约束。

## OVERVIEW

进程级隔离 + filesystem 沙箱执行层 —— 消费 `security-protocol/` 的评估结果，在不同平台上选择最优隔离策略后才实际 spawn 子进程。

## STRUCTURE

```
sandbox.ts              SandboxManager: 入口类，组装 detector + ruleEngine + securityGuard + audit
isolation-strategies.ts 4 种策略: sandbox-exec (macOS deny-rules) / bubblewrap (Linux) / unshare (Linux user+mount+pid namespaces) / directory (fallback, 仅限制 cwd+env)
detector.ts             Detector: composable detection, 组合 SecurityManager RBAC + 内置 regex
semantic-detector.ts    语义检测: 12 个 prompt injection 模式 (双语) + 16 个语义危险命令模式
command-security.ts     SHA-256 命令签名 / 路径解析 / 可执行性验证
sudo-checker.ts         sudo 权限提升检测
worktree-manager.ts     git worktree 托管沙箱目录
pool-manager.ts         Sandbox 池化: max 5 实例, idle 超时回收
resource-tracker.ts     沙箱进程资源跟踪
memory-monitor.ts       内存阈值监控
alert-monitor.ts        异常告警
lifecycle.ts            Hook 链: init → beforeExec → afterExec → onError → onCleanup → destroy
validator.ts            Decision 优先级: block > warn > log > allow
config.ts / constants.ts / types.ts / interfaces.ts / index.ts
```

## WHERE TO LOOK

| 问题 | 文件 |
|---|---|
| 沙箱执行入口 | `sandbox.ts` → `SandboxManager.exec()` |
| 隔离策略如何选择 | `isolation-strategies.ts` (按平台检测分发) |
| 模式 (STRICT/RELAXED/CONSENSUS) | `validator.ts` (模式 → decision 映射) |
| 命令是否危险 | `detector.ts` + `semantic-detector.ts` |
| 命令签名/完整性校验 | `command-security.ts` |
| 沙箱生命周期 | `lifecycle.ts` |
| 资源/内存监控 | `resource-tracker.ts` + `memory-monitor.ts` |
| 沙箱池复用 | `pool-manager.ts` (max 5, idle timeout) |
| git worktree 隔离 | `worktree-manager.ts` |
| sudo 检测 | `sudo-checker.ts` |

## CONVENTIONS

- **执行顺序**: `SandboxManager.exec()` → `Detector.detect()` + `SecurityGuard.assess()` → 选 isolation strategy → spawn。不允许跳过 guard。
- **策略选择**: 基于 `process.platform` 自动分发，不要手动 hardcode 策略路径。
- **Validator 优先级**: block > warn > log > allow。任一 evaluator 返回 block → 整条链终止。
- **Audit**: 所有 exec 调用通过 infrastructure audit service (`AuditHelper`) 写入审计日志，不可旁路。
- **Lifecycle hooks**: 新行为如需在 exec 前后注入，通过 lifecycle hook 注册，不要直接嵌入 `sandbox.ts` 主流程。
- **模式语义**: STRICT 阻止所有危险操作，RELAXED 只阻止 critical/high，CONSENSUS 需要用户确认。
- **跨模块依赖**: `SandboxManager` 消费 `security-protocol/factory` 的 `SecurityGuard`，不直接消费 evaluators。
- **pool-manager**: 沙箱实例可复用，idle 超时自动销毁；最多保留 5 个活跃池。
- **worktree**: git worktree 沙箱目录由 `worktree-manager.ts` 统一管理创建/清理，不要手动 `git worktree add`。

## ANTI-PATTERNS

- 不要在 `sandbox.ts` 中直接做命令风险判断 —— 那是 `security-protocol/` 的职责。这里接收 `SecurityDecision` 并执行。
- 不要绕过 `isolation-strategies.ts` 的分发逻辑，直接用 `child_process.spawn()`。
- 不要在 handler 中创建临时沙箱实例 —— 走 `pool-manager` 复用。
- 不要硬编码特定平台的隔离策略（如判断 `darwin` 然后直接调 sandbox-exec）—— 统一走 `isolation-strategies.ts` 分发。
- 不要跳过 audit —— 每个 `exec()` 调用必须走 `AuditHelper`。
- 新增检测模式不要在 `detector.ts` 里堆正则 —— 语义类检测放进 `semantic-detector.ts`。