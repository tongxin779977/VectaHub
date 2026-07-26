# AGENTS.md — src/infrastructure/

> DI 容器 + 可替换基础服务。父级规则见 `../../AGENTS.md`。

## OVERVIEW

`InfrastructureContext`（`context.ts`）是唯一的依赖注入容器，组装 5 个核心服务。所有模块通过构造函数 / `createX(ctx)` factory 接收 context 或其子集。

## STRUCTURE（77 files, 19 子目录）

| 目录 | 用途 | 规模 |
|------|------|------|
| `interfaces/` | 5 个服务接口契约（IEnvironmentService, IConfigService, ILoggerService, IEventBus, IAuditService）+ `index.ts` barrel | 6 files |
| `environment/` | 环境变量读取、VECTAHUB_HOME 解析 | 1 file |
| `config/` | 配置加载与 schema 校验 | 7 files |
| `logger/` | pino 封装、日志级别、redact-transport | 7 files |
| `audit/` | 审计日志写入、env-audit 环境审计 | 5 files |
| `trace/` | 链路追踪（tracer, context propagation, writer） | 8 files |
| `trace-audit/` | 链路审计（alerts, async-writer, query-engine, rotation, system） | 15 files |
| `event/` | 内存事件总线（bus, event-manager） | 4 files |
| `security/` | 敏感数据脱敏、配置安全检查 | 3 files |
| `data/` | 数据清理、操作日志 | 3 files |
| `concurrency/` | worker-pool | 2 files |
| `loaders/` | lazy-loader 模块延迟加载 | 2 files |
| `paths/` | VECTAHUB_HOME 子路径解析 | 4 files |
| `errors/` | `VectaHubError`、6 种 ErrorType、classify/format/toJSON | 2 files |
| `benchmark/` | 性能基准工具 | — |
| `testing/` | `createTestInfrastructureContext()`（MockEnvironmentService + MockLoggerService + MockAuditService，纯内存） | 2 files |
| 根级 | `context.ts`（容器）、`cli-output.ts`（text/json/silent 输出控制）、`index.ts`（统一 re-export） | 3 files |

## WHERE TO LOOK

| 要做什么 | 起点 |
|----------|------|
| 加新基础服务 | `interfaces/` 定义接口 → 子目录实现 → `context.ts` 注入 → `index.ts` 导出 |
| 替换服务实现 | 实现 `interfaces/` 中的接口，通过 `InfrastructureContext` 构造函数注入 |
| 测试用 Mock | `testing/mock-services.ts`，通过 `createTestInfrastructureContext()` 获得纯内存 context |
| 读写路径标准化 | `paths/facade.ts`（withDeps）/ `paths/compat-bridge.ts`（桥接） |
| 错误分类与 JSON 输出 | `errors/index.ts`: `classifyError()` → `toJSONError()` |
| 审计日志 | `audit/service.ts` → `AuditService`，lazy-init via `context.audit` |
| CLI 输出模式 | `cli-output.ts`: `resolveCliOutputMode()` / `createCliOutput()` |

## CONVENTIONS

### Facade + Compat-Bridge 三层模式（logger, config, paths, event 采用）

1. **`interfaces/*.ts`** — 接口契约，零依赖
2. **`service.ts`** — 接口实现，通过 `InfrastructureContext` 构造函数注入
3. **`facade.ts`** — 显式依赖注入（`*WithDeps()` 函数，参数为 `XxxDeps` 接口）。**新代码首选**
4. **`compat-bridge.ts`** — 全局单例包装，内部调用 `getDefaultContext()`。仅限 `*-bridge.ts` 文件使用（受 `check:default-context-usage` 约束），标记 `@deprecated`

### 纯逻辑模块（无 facade/compat-bridge）

`concurrency/`, `data/`, `loaders/`, `security/`, `errors/`, `cli-output.ts`, `benchmark/` 不遵循三层模式：这些模块要么无状态、要么直接接收依赖而非通过 context 注入。

### 测试

- 始终用 `createTestInfrastructureContext()` 做内存化测试，不碰文件系统
- Mock 服务在 `testing/mock-services.ts` 中统一维护
- `environment/` 测试：用 `process.env.VECTAHUB_HOME` 但 **必须在 afterEach 清理**

## ANTI-PATTERNS

- ❌ 在非 `*-bridge.ts` 文件中调用 `getDefaultContext()`（会被 CI 阻塞）
- ❌ 绕过 `InfrastructureContext` 直接 new 服务实例
- ❌ 在 `service.ts` 中直接读写 process.env（走 `IEnvironmentService`）
- ❌ 在 `facade.ts` 中 import `compat-bridge.ts`（依赖方向只允许 compat-bridge → facade）
- ❌ 在测试中用真实 `EnvironmentService` 而非 Mock（有 FS 副作用）
- ❌ 在 `interfaces/` 中放运行时逻辑
