# AGENTS.md — src/skills/

> 父级 `AGENTS.md` 覆盖项目全局事实。本文只记载本目录的非显然设计决策与约束。

## OVERVIEW

可插拔 skill 框架 —— registry 发现和路由，executor 带重试/超时/沙箱运行，manager 管生命周期。不是 chat 的 NL 入口；chat 直接走 `nl/`。

## STRUCTURE

```
types.ts              Skill/SkillContext/SkillResult 等核心接口 + CompositeSkill + 沙箱/缓存/版本化类型
registry.ts           SkillRegistry: register/get/list/enable/disable, 语义匹配 (stem + keyword scoring)
executor.ts           SkillExecutor: execute/executeWithRetry (3 次指数退避)/executeComposite (sequential|parallel|conditional)
manager.ts            SkillManager: register→enable→execute→disable→unload 五态生命周期
init.ts               createSkillSystem(registry, executor, moduleRegistry?) — 组合根，注入 logger/config/AI module 注册表
intent-skill.ts       LLM 意图识别 skill
command-skill.ts      文件操作/git/代码生成/安全扫描 skill
workflow-skill.ts     YAML workflow 生成 skill (LLM)
pipeline-skill.ts     意图→workflow 顺序组合 CompositeSkill
ai-modules/           AI 模块子系统 (独立类型/AIModuleRegistry，与 Skill 体系平行)
  types.ts            AIModule/AIModuleContext/AIModuleResult/AIModuleRegistry
  registry.ts         createAIModuleRegistry()
  agent-delegate/     AgentLoopConfig/ToolCall/DelegateStepResult — workflow delegate handler 消费
  cli-plugin/         Feishu/OpenCLI/Gemini 的 AIModule 工厂
  intelligent-diagnosis/  错误诊断模块
  semantic-matching/      语义匹配模块
iterative-refinement/ 迭代改进子系统
  index.ts            createIterativeRefinementSkill()
  types.ts            RetryConfig/FiveWhysAnalysis/RefinementResult
  retry-manager.ts    指数退避重试 (被 workflow/engine.ts 消费)
  5whys-analyzer.ts   根因分析器
llm-dialog-control/   LLM 输出验证与格式化
  types.ts            OutputFormat (json|yaml|text), ValidationResult
  validator.ts        validateOutput()/extractCleanOutput()/createRetryPrompt()
```

## WHERE TO LOOK

| 问题 | 文件 |
|---|---|
| 新增一个 skill | `types.ts` 定义接口 → `registry.ts` 注册 → `init.ts` createSkillSystem 注入 |
| debug skill 为什么没被匹配 | `registry.ts` → `findApplicable()`/`findSkillsBySemantic()`/stem() |
| 调整重试策略 | `executor.ts` → ResolvedSkillExecutorOptions.maxRetries (默认 3)/timeout (默认 120s) |
| 调整重试退避算法 | `iterative-refinement/retry-manager.ts` |
| 新增 AI 能力模块 | `ai-modules/types.ts` 实现 AIModule → `ai-modules/registry.ts` 注册 → `init.ts` 注入 moduleRegistry |
| LLM 输出校验逻辑 | `llm-dialog-control/validator.ts` → validateOutput() |
| workflow engine 如何消费重试 | `workflow/engine.ts` 直接 import `createRetryManager` |
| delegate handler 如何消费 AI module | `workflow/handlers/delegate-handler.ts` import `AIModule/AIModuleContext/AIModuleResult` |
| chat 是否消费 skill | **不。** chat 直接走 `nl/` 做 NL→workflow 路由 |

## CONVENTIONS

- **Skill vs AIModule**: 两套平行体系。Skill 面向 workflow/orchestration；AIModule 面向 AI 工具调用。registry 独立，互不依赖。
- **组合根在 init.ts**: `createSkillSystem()` 是唯一入口。不要直接 new SkillRegistry/SkillExecutor 到业务代码。
- **executor 重试**: 所有 skill 经由 executor.execute() 跑，自动享受 3 次指数退避重试。skill 自身不实现重试。
- **CompositeSkill strategy**: sequential 逐个执行依次返回结果；parallel promise.all 并发；conditional 按第一个 canHandle=true 的 child 执行。
- **moduleRegistry 可选**: init.ts 的 SkillSystem.moduleRegistry 只在传了 AIModuleConfig 时初始化。消费方用 optional chaining。
- **context 注入**: Skill.execute(input, context) 接收 SkillContext，包含 userInput/sessionId/projectContext/executionHistory。不访问 getDefaultContext()。
- **测试**: 每个根级 skill 文件有对应 .test.ts (command/intent/workflow/pipeline/init)，子模块也有独立测试。vitest + 内存化。
- **语义匹配**: registry.findSkillsBySemantic() 基于小写/stem/关键词打分，不是 LLM 调用。仅在精确匹配失败时做 fallback。

## ANTI-PATTERNS

- **不要在 skill 内部做重试。** 那是 executor 的职责。skill.execute() 跑一次，返回 SkillResult；executor 决定是否重试。
- **不要把 Skill 和 AIModule 类型混用。** Skill.id 是 string，AIModule.id 也是 string，但它们注册到不同 registry，不要互串。
- **不要绕过 createSkillSystem()。** 不要在业务代码直接 new SkillRegistry() 或 new SkillExecutor()。技能系统组合、配置、生命周期全在 init.ts 里。
- **不要直接从 chat/ 消费 skill。** chat 走 nl/ → orchestration-plan/ → workflow/ 链路。往 skill/ 加 chat 专用逻辑会造成耦合。
- **不要调 getDefaultContext()。** 用 SkillContext/AIModuleContext 收窄注入。