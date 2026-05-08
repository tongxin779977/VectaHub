# VectaHub 2.0 系统架构设计文档

---

## 1. 文档信息

| 属性 | 值 |
|------|-----|
| **文档版本** | v2.0 |
| **创建日期** | 2026-05-08 |
| **最后更新** | 2026-05-08 |
| **状态** | Go 重构设计 |
| **作者** | Architecture Team |
| **技术栈** | Go 1.21+ |

---

## 2. 设计目标

VectaHub 2.0 是对当前 TypeScript CLI 项目的 Go 语言重构版本，不是重新定义产品。2.0 必须继承 1.x 已验证的用户能力、命令语义、安全边界和数据模型，同时通过 Go 的单二进制交付、并发模型、接口边界和服务化能力降低运行时复杂度。

### 2.1 迁移原则

| 原则 | 要求 |
|------|------|
| 行为优先 | 先保持 1.x 用户可见行为，再替换内部实现 |
| 安全默认 | `dry-run` 零副作用、preview first、危险命令检测必须保留 |
| 数据兼容 | 2.0 能读取 1.x 的 workflow、execution、audit、config 数据 |
| 可观测 | 所有 CLI、workflow step、sandbox 判定、API 调用都可审计 |
| 可嵌入 | CLI、REST、gRPC、VS Code 插件最终共享同一 Go core |
| 单二进制 | 默认发布为 `vectahub` 单文件 CLI，服务能力按需启用 |

### 2.2 当前 1.x 基线

| 基线项 | 当前状态 |
|--------|----------|
| 构建 | `npm run build` 通过 |
| 类型检查 | `npm run typecheck` 通过 |
| 测试 | `100` 个测试文件通过，`1178 passed | 18 skipped` |
| dry-run | 已实现零副作用，不安装、不扫描、不执行、不写记录 |
| 数据目录 | 支持 `VECTAHUB_HOME`，测试使用临时目录 |
| doctor | 能识别本地开发依赖并正常退出 |
| Chat/NL/workflow | 核心行为测试已对齐 |

---

## 3. 总体架构

```text
vectahub
  cmd/                  Cobra CLI
  internal/app/         应用装配、配置、生命周期
  internal/nl/          自然语言解析、规则匹配、LLM tool calling
  internal/workflow/    工作流解析、DAG、执行状态机
  internal/executor/    步骤执行、重试、输出收集
  internal/sandbox/     危险检测、隔离策略、命令规则
  internal/tools/       git/npm/docker/curl 等工具注册
  internal/security/    RBAC、策略、审计
  internal/storage/     文件/SQLite 存储、版本和归档
  internal/api/         REST + gRPC 服务
  internal/plugin/      插件接口与注册
  internal/monitoring/  trace、metrics、alerts
  pkg/core/             可被 CLI / API / 插件复用的稳定 SDK
```

2.0 的核心依赖方向:

```text
CLI / REST / gRPC / VS Code Adapter
        |
      Core SDK
        |
NL -> Workflow -> Executor -> Sandbox/Tools
        |
Storage / Audit / Monitoring
```

---

## 4. 模块设计

### 4.1 CLI 层

技术选型: Cobra + Viper。

迁移 1.x 能力:

- `run`: 自然语言或 YAML workflow 执行。
- `--dry-run`: 零副作用预览。
- `doctor`: 环境诊断。
- `tools`: 工具列表、详情、搜索、命令列表。
- `security`: 命令安全测试、规则查看。
- `mode`: strict / relaxed / consensus。
- `list` / `history` / `detail` / `rerun` / `resume` / `archive`。
- `templates` / `generate` / `schedule`。
- `serve` / `client` / `daemon`。
- `debug` / `monitor` / `plugins`。
- `export` / `import`。

2.0 必须新增稳定 JSON 协议:

```bash
vectahub run --dry-run --json "查看 git 状态"
vectahub run --json "查看 git 状态"
vectahub doctor --json
vectahub tools list --json
vectahub security test --json "git status"
vectahub history --json
```

### 4.2 NL 层

迁移 1.x 能力:

- 规则匹配和关键词降级。
- LLM 优先 + 规则 fallback。
- 多意图协调、分类路由、优先级规则。
- 参数提取、命令合成。
- YAML workflow 转 task list。
- Chat 轻量上下文和最近 workflow 记忆。

Go 设计:

```go
type Processor interface {
    Parse(ctx context.Context, input ParseInput) (*ParseResult, error)
}

type SkillPipeline interface {
    Execute(ctx context.Context, input SkillInput) (*SkillResult, error)
}
```

### 4.3 Workflow 层

迁移 1.x 能力:

- 顺序执行。
- `if` 条件步骤。
- `for_each` 循环步骤。
- `parallel` 并行步骤。
- `dependsOn` 拓扑排序。
- 插值和上下文传递。
- 暂停、恢复、终止。
- 从失败步骤恢复。
- 执行记录、输出引用、归档。
- 调度计划 `schedules.json`。

Go 设计:

```go
type Engine interface {
    Create(ctx context.Context, name string, steps []Step) (*Workflow, error)
    Execute(ctx context.Context, wf *Workflow, opts ExecuteOptions) (*ExecutionRecord, error)
    Preview(ctx context.Context, wf *Workflow, opts PreviewOptions) (*PreviewResult, error)
    Resume(ctx context.Context, executionID string, opts ExecuteOptions) (*ExecutionRecord, error)
    Abort(ctx context.Context, executionID string) error
}
```

### 4.4 Executor 与 Sandbox 层

迁移 1.x 能力:

- CLI 命令执行。
- timeout 和进程终止。
- 危险命令检测。
- 黑名单/白名单规则。
- macOS `sandbox-exec`。
- Linux `bubblewrap` / `unshare`。
- 降级到目录隔离。
- 命令签名和文件哈希校验。
- AI CLI 委派: gemini、claude、codex、aider。

Go 设计:

```go
type Executor interface {
    ExecuteStep(ctx context.Context, step Step, env ExecutionEnv) (*StepResult, error)
}

type Sandbox interface {
    Assess(command Command) (*RiskAssessment, error)
    Run(ctx context.Context, command Command, policy SandboxPolicy) (*CommandResult, error)
}
```

### 4.5 Storage 层

2.0 默认数据目录:

```text
VECTAHUB_HOME > $HOME/.vectahub
```

目录布局:

```text
.vectahub/
  config.yaml
  workflows/
  executions/
  outputs/
  logs/
    audit/
    traces/
  schedules.json
  command-rules/
  security-config.json
  security-database.json
  plugins/
  templates/
  archives/
```

2.0 可以引入 SQLite 作为可选索引层，但文件格式仍需兼容 1.x。

### 4.6 API 层

技术选型: Gin + gRPC。

迁移 1.x 能力:

- `/health`
- `/api/workflows`
- `/api/executions`
- `/api/audit`
- `/api/workflows` POST 执行。
- `/api/ai-delegate`

2.0 API 必须复用 core SDK，不应复制 CLI 逻辑。

### 4.7 Plugin 与 VS Code 集成

2.0 保留插件接口，并为 VS Code 插件提供稳定 JSON 协议和 Core SDK。第一版 VS Code 插件仍建议通过 CLI Adapter 调用全局 CLI，后续再迁移到 Core SDK。

---

## 5. 运行模式

| 模式 | 说明 | 默认策略 |
|------|------|----------|
| CLI | 单次命令执行 | preview first + audit |
| Server | REST / gRPC 服务 | 显式启动 |
| Daemon | 本地后台执行器 | 用户显式启用 |
| Plugin Shell | VS Code 等插件调用 CLI | strict + isolated `VECTAHUB_HOME` |
| Core SDK | Go 包直接嵌入 | 调用方负责生命周期 |

---

## 6. 安全架构

2.0 安全默认值:

- 自然语言执行必须先能 preview。
- `dry-run` 不能写配置、扫描外部 CLI、保存 execution、执行命令。
- 高危命令必须二次确认。
- 所有用户输入都作为参数数组传递，不拼接 shell 字符串。
- 审计日志必须脱敏。
- 插件和 CI 调用必须支持隔离 `VECTAHUB_HOME`。

---

## 7. 迁移路线

| 阶段 | 目标 | 输出 |
|------|------|------|
| Phase 0 | 冻结 1.x 行为契约 | JSON 协议、兼容测试、数据格式说明 |
| Phase 1 | Go CLI 骨架 | Cobra/Viper、doctor、version、config、paths |
| Phase 2 | Core 迁移 | NL、workflow、executor、sandbox、storage |
| Phase 3 | 服务化 | Gin REST、gRPC、daemon、monitoring |
| Phase 4 | 插件和 SDK | Go plugin API、VS Code Adapter、Core SDK |
| Phase 5 | 发布硬化 | 跨平台打包、迁移工具、兼容测试 |

---

## 8. 非目标

- 2.0 不在第一阶段重做完整图形化工作流编辑器。
- 2.0 不默认启用云同步。
- 2.0 不要求一开始支持多用户团队权限；RBAC 可作为服务模式能力逐步开启。
- 2.0 不允许牺牲 CLI 稳定性来优先做 UI。

---

## 附录：版本历史

| 版本 | 日期 | 变更 | 作者 |
|------|------|------|------|
| v2.0 | 2026-05-08 | 新增 Go 重构总体架构与 1.x 迁移基线 | Architecture Team |
