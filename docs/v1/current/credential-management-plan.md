# VectaHub 1.2 凭证管理与智能预检：多维度 Agent 自动化实施方案

> **状态**: 待执行 (Ready for Autonomous Execution)
> **目标**: 解决跨生态工具（gh, npm, git 等）在自动化执行中的凭证缺失问题，采用业界标准的“环境代理 + 智能预检”模式。
> **执行指令**: Agent 需严格按照本方案的 [阶段] 顺序执行，每完成一个 [任务] 必须运行对应的 [验证脚本] 并记录 [认证证据]。

## 0. 架构决策与风险声明 (Architectural Decisions & Risks)

### 0.1 核心决策
不造凭证保险箱，不进行运行时的环境变量截获注入。VectaHub 采用 **“只诊断不代劳，只预检不弹框”** 的策略。
1. **预检阻断**: 在工作流执行前，通过非破坏性命令（如 `gh auth status`）检查工具的授权状态。
2. **错误自愈**: 授权失败时，将底层工具的原生报错交由 LLM 自愈模块分析，向用户输出准确的排障建议。

### 0.2 已知风险与局限性 (Risks)
- **预检开销**: 预检命令会引入额外的网络或子进程开销（通常 < 500ms），可能轻微影响工作流的启动速度。
- **环境碎片化**: 由于依赖外部工具自身的配置（如 `~/.npmrc`），在复杂的 Docker 或 CI 环境中，如果底层工具的鉴权链损坏，VectaHub 仅能给出提示，无法自动修复系统环境。

---

## 阶段一：工具注册表能力升级 (Registry Enhancement)

### 任务 1.1: 扩展 CliTool 类型定义
- **开发维度**:
  - 修改 `src/cli-tools/types.ts`。
  - 在 `CliTool` 接口中新增可选字段：`authCheckCommand?: string` 和 `authHelpMessage?: string`。
- **测试维度**:
  - 运行 `npm run typecheck`。
- **认证维度**:
  - 证据：类型检查通过，且不破坏现有工具的定义。

### 任务 1.2: 注入内置工具的预检规则
- **开发维度**:
  - 修改 `src/cli-tools/tools/gh.ts`: 添加 `authCheckCommand: 'gh auth status'` 和友好的 `authHelpMessage`。
  - 修改 `src/cli-tools/tools/npm.ts`: 添加 `authCheckCommand: 'npm whoami'`。
- **测试维度**:
  - 运行 `npm exec -- vitest run src/cli-tools/registry.test.ts`。
- **认证维度**:
  - 证据：测试通过，注册表能够正确读取新加入的属性。

---

## 阶段二：工作流预检引擎 (Pre-flight Engine)

### 任务 2.1: 实现预检拦截逻辑
- **开发维度**:
  - 修改 `src/workflow/executor.ts` 中的 `executeWorkflow` 方法。
  - 在开始按序执行 `steps` 之前，扫描所有步骤依赖的 CLI 工具。
  - 并发调用对应工具的 `authCheckCommand`。
  - 若预检失败，立即中止工作流，并抛出带有 `authHelpMessage` 的统一 JSON 错误（使用 `toJSONError`）。
- **测试维度**:
  - 新增 `src/workflow/preflight.test.ts`，模拟 `gh` 未登录的场景。
  - 运行 `npm exec -- vitest run src/workflow/preflight.test.ts`。
- **认证维度**:
  - 证据：工作流在首个步骤执行前被拦截，返回 `ok: false` 且错误信息包含具体的授权修复建议。

---

## 阶段三：智能自愈深度整合 (Self-Healing Integration)

### 任务 3.1: 强化 401/403 日志分析
- **开发维度**:
  - 检查 `src/skills/iterative-refinement/` 或自愈处理入口。
  - 优化 LLM 的 System Prompt，明确指示：“当遇到凭证相关的错误日志（如 unauthorized, 401, token expired）时，优先建议用户检查系统级配置文件或环境变量，而不是修改工作流代码。”
- **测试维度**:
  - 运行自然语言命令模拟授权失败的返回日志进行自愈诊断。
- **认证维度**:
  - 证据：LLM 输出的修复建议中明确指出“请运行 xxx 进行登录”或“请配置 xxx 环境变量”。

---

## 4. 完成定义 (DoD)
1. **代码质量**: 全量代码通过 TypeCheck 和 Lint。
2. **测试覆盖**: 新增的预检逻辑必须有单元测试覆盖，且原有工作流测试不回归。
3. **架构合规**: 预检机制不能引入新的 `homedir()` 路径硬编码，必须完全依赖子进程本身的执行环境。
4. **认证产出**: Agent 执行完毕后，更新 `CERTIFICATION_REPORT.md`，追加“智能预检与凭证管理”维度的通过状态。
