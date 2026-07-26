# AGENTS.md — src/security-protocol/

> 父级 `AGENTS.md` 覆盖项目全局事实。本文只记载本目录的非显然设计决策与约束。

## OVERVIEW

命令风险决策引擎 —— 不是隔离层，是喂给 sandbox 的评估 pipeline。

## STRUCTURE

```
guard.ts            SecurityGuardImpl: 链式运行 evaluators，收集结果后做最终 decision
factory.ts          createSecurityGuard(deps) 组装 evaluator 链; getSecurityGuard() 已 deprecated
engine.ts           兼容层: assessCommandRisk(), 内部调 getSecurityGuard()
manager.ts          SecurityProtocolManager: rule/DB 生命周期管理 (load/update/export)
types.ts            领域类型: SecurityRule / SecurityConfig / DetectionResult
interfaces.ts       Evaluator / Guard 接口
redactor.ts         输出脱敏: API keys, JWT/Bearer, 中国手机号/身份证/邮箱, 信用卡, 敏感路径 (10+ 类别，递归对象遍历)
rbac.ts             角色权限: developer / ci-runner / admin
command-detector.ts 命令语义分类
pattern-matcher.ts  正则匹配引擎
default-rules.ts    20 条内置安全规则
security-rule-store.ts  规则持久化
security-config-store.ts 配置持久化
evaluators/
  command-rule.ts    静态 blocklist/allowlist (消费 command-rules/)
  sandbox-semantic.ts 语义危险检测 (复用 sandbox/semantic-detector.ts)
  protocol-rule.ts   正则规则库评估
  shared.ts          共享工具
```

## WHERE TO LOOK

| 问题 | 文件 |
|---|---|
| 评估 pipeline 入口 | `guard.ts` |
| 如何组装 evaluator 链 | `factory.ts` → `createSecurityGuard()` |
| 决策类型定义 | `../types/security.ts` (`SecurityDecision`) |
| 命令是否危险 | `command-detector.ts` |
| 规则库增删 | `default-rules.ts` + `security-rule-store.ts` |
| 输出敏感信息过滤 | `redactor.ts` |
| 角色权限变更 | `rbac.ts` |

## CONVENTIONS

- **Decision 类型**: `PASSED` / `BLOCKED` / `REQUIRES_CONFIRMATION` / `REDACTED`
  - 当前 `REQUIRES_CONFIRMATION` → auto-reject (未启用交互确认)
- **Risk 等级**: `none` / `low` / `medium` / `high` / `critical`
- **Evaluator 顺序**: 先静态规则，再语义检测，最后正则库 —— 逐层收敛
- **Evaluator 并发**: 各 evaluator **独立运行**，互不阻塞；guard 收集所有结果后统一决策
- **guard 消费方**: `SecurityGuardImpl.assess()` 返回 `SecurityDecision`，上层不应直接解析 evaluator 内部结果
- **类型安全**: switch default 分支用 `never` 类型强制 exhaustive check，新增 `SecurityDecisionType` 必须覆盖所有 switch
- **factory**: 创建新 guard 实例用 `createSecurityGuard({ evaluators })`，不要调 `getSecurityGuard()` (已 deprecated，仅 engine.ts 兼容层使用)
- **deprecated 清理**: 移除 `getSecurityGuard()` 时同步改 `engine.ts`，否则编译直接炸
- **跨模块依赖**: `sandbox/detector.ts` 依赖 SecurityManager 做 RBAC；`evaluators/sandbox-semantic.ts` 复用 `sandbox/semantic-detector.ts` 的危险命令判定逻辑

## ANTI-PATTERNS

- 不要在本模块做进程隔离或文件系统限制 —— 那是 `sandbox/` 的职责
- 不要在 evaluator 中修改原始 command intention (只读，返回评分)
- 不要在 guard 之外直接做 decision (绕过 pipeline)
- 不要用 `getSecurityGuard()` 创建新实例，除非改的是 `engine.ts` 兼容层
- 新增 evaluator 不要跳过类型注册 (必须加入 `SecurityEvaluator` 联合类型，否则 guard 收不到)
