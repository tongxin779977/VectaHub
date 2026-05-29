# 本地服务与集成层架构设计

> Document Status: Current Implementation / Partial Implementation / Target Design
> Authority: 本地服务、API、VS Code 集成、模式切换、导入导出能力的架构口径。

## Problem

VectaHub 的主形态是 CLI，但当前仓库已经出现了多种“CLI 之外的入口”：

- 本地 socket service，
- AI daemon，
- HTTP API server，
- VS Code extension，
- import/export，
- mode switching，
- monitor/debug/vscode diagnostic commands。

这些能力容易被误解成“多用户服务平台”或“云端控制面”。这不是当前合适的产品定位。

更准确的理解是：这些能力是围绕单用户本地 CLI 内核形成的本地集成层。它们让 CLI 可以被编辑器、本地服务、自动化脚本和备份迁移流程复用，但不改变 VectaHub 的本地优先边界。

## Goals

- 明确本地服务与集成层的真实边界。
- 区分当前已经实现、部分实现和目标设计。
- 解释 socket service、daemon、HTTP API、VS Code extension 和 import/export 的关系。
- 避免把本地服务误写成多用户 SaaS 或生产级远程平台。
- 为后续统一 RunContext、权限确认、trace、恢复和结构化输出提供设计入口。

## Non-Goals

- 不在本文定义远程多租户认证、授权、计费或团队协作模型。
- 不把 HTTP API 描述成已稳定对外发布的公共 API。
- 不要求 VS Code extension 复制 CLI 的执行逻辑。
- 不在本文重新定义 workflow、run-task、Agent Runtime 的内部合同。
- 不把 import/export 描述成完整跨版本迁移系统，除非实现已有明确版本兼容规则。

## 多视角讨论

### 产品边界视角

本地服务与集成层的价值不是“上线一个服务端产品”，而是降低 CLI 的使用摩擦。

它应该服务于这些场景：

- 用户在 VS Code 里选择文档任务，然后调用 CLI 执行。
- 用户启动本地服务，让多个本机入口共享任务提交、查询和关闭能力。
- 用户导出 workflows、executions、sessions 和 config，做备份或迁移。
- 用户通过 HTTP API 做本地实验、调试或轻量集成。

它不应该承诺：

- 多用户隔离，
- 远程访问安全边界，
- 服务端权限模型，
- 分布式队列，
- 长期兼容的开放平台 API。

### 架构集成视角

CLI core 仍然应该是唯一执行权威。

```text
VS Code / local script / client command / API caller
        |
        v
Local Integration Layer
        |
        +-- socket service
        +-- daemon client
        +-- HTTP API server
        +-- import/export
        +-- mode switch
        |
        v
VectaHub CLI Core
        |
        +-- intent routing
        +-- workflow engine
        +-- document-task execution
        +-- Agent Runtime
        +-- safety / trace / recovery
```

集成层可以提供入口、状态查询、UI 展示和数据搬运，但不应该复制一套独立的执行真相。

长期应把这些入口统一到同一组结构化合同：

- RunContext，
- PermissionDecision，
- ExecutionRecord，
- TraceSpan，
- RecoveryDecision，
- RuntimeCatalog。

### 执行可靠性视角

本地服务一旦出现长驻进程、socket、API 和导入导出，就必须比普通 CLI 命令更重视收口语义：

- 请求体大小限制，
- 错误传播，
- 审计记录，
- stdout/stderr 或 JSON 输出边界，
- secrets 脱敏，
- import overwrite 风险，
- daemon shutdown，
- socket 不可连接时的失败分类，
- 执行记录与 trace 的关联。

这些能力的设计重点不是“服务跑起来”，而是“本地入口不会绕过 CLI 的安全和恢复闭环”。

### 架构师收口

本地服务与集成层应该被定义为 VectaHub 的本机适配层。

它的职责是：

- 承接非 CLI 入口，
- 调用 CLI core 的权威能力，
- 返回结构化结果，
- 保留审计和 trace，
- 遵守安全确认和恢复规则，
- 支持本地数据导入导出。

它不应该拥有自己的业务规则副本。

## Current Implementation

### Socket service 与 client

当前已有 `serve` 和 `client` 命令。

当前行为：

- `vectahub serve` 启动本地 socket service。
- socket path 默认在临时目录下的 `vectahub.sock`。
- `vectahub client submit "<input>"` 提交自然语言输入。
- `vectahub client status <task-id>` 查询任务。
- `vectahub client list` 列出任务。
- `vectahub client mode [STRICT|RELAXED|CONSENSUS]` 查询或切换 service 内 sandbox mode。
- `vectahub client config` 查询 sandbox config。
- `vectahub client shutdown` 关闭 service。
- service 启动、关闭和错误会写 audit event。

当前边界：

- 它是本地 socket service，不是远程服务网关。
- client 依赖 service 正在运行。
- socket 不可连接时会直接失败。
- 当前文档不应承诺跨用户隔离、远程访问或持久队列语义。

关键实现：

- [src/commands/serve.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/serve.ts:1)
- [src/daemon/socket-server.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/daemon/socket-server.ts:1)

### AI daemon

当前已有 `daemon` 命令族。

当前行为：

- `vectahub daemon --socket <path> start` 启动 daemon。
- `vectahub daemon --socket <path> stop` 通过 daemon client 请求 shutdown。
- `vectahub daemon --socket <path> status` 查询 state、uptime、active sessions、queued tasks 和 processed tasks。

当前边界：

- daemon 是本地辅助进程管理能力。
- stop/status 依赖 socket 可连接。
- 不能把它写成生产级任务调度平台。

关键实现：

- [src/commands/daemon.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/daemon.ts:1)
- [src/daemon/index.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/daemon/index.ts:1)
- [src/daemon/client.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/daemon/client.ts:1)

### HTTP API server

当前已有 HTTP API server 代码路径。

当前接口形态包括：

- `GET /api/workflows`
- `GET /api/executions`
- `GET /api/audit`
- `POST /api/workflows`
- `POST /api/ai-delegate`
- `GET /health`

当前已有防护：

- 请求体默认最大 1MB。
- 非 JSON object 会返回请求解析错误。
- API 请求会写 audit。
- 部分执行路径会调用 workflow engine。

当前边界：

- 它应被视为本地 API server 入口。
- 不能描述为稳定的公网 API。
- 当前鉴权、多用户隔离、跨租户数据边界不是已实现能力。
- API 执行路径必须继续收敛到 workflow、safety、trace 和 recovery 合同，而不是形成第二套执行系统。

关键实现：

- [src/api/server.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/api/server.ts:1)
- [src/commands/serve.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/serve.ts:1)

### VS Code extension

当前仓库包含 VS Code extension workspace。

当前 extension 的产品入口包括：

- 任务面板，
- 高级选项，
- 预览意图，
- 刷新任务列表，
- 一键验证全部，
- 同步并修复，
- 启动长驻任务，
- 停止运行任务，
- 选择文档文件，
- 解析文档任务，
- 选择 Agent CLI，
- 执行文档任务，
- 队列删除和清空，
- LLM 配置，
- 一键启动全部文档任务。

当前边界：

- VS Code extension 是 CLI 的本地 UI 入口。
- 它不应该复制 workflow engine、Agent Runtime、permission、trace 或 recovery 的权威逻辑。
- 插件应优先依赖 CLI JSON 输出或共享合同包。
- 用户可见状态应该是任务语义，不应该暴露内部布尔字段。

关键参考：

- [packages/vectahub-vscode-extension/package.json](/Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/package.json:1)
- [docs/design/vscode-ui-logic.md](./vscode-ui-logic.md)
- [docs/ui/vscode-extension.md](../ui/vscode-extension.md)

### import/export

当前已有数据导入导出命令。

当前 export 能力：

- 导出 config，
- 导出 workflows，
- 导出 executions，
- 导出 sessions，
- 默认脱敏常见 secret 字段，
- 只有显式 `--include-secrets` 才包含 secrets，
- 支持执行记录 JSON/CSV 导出，
- 非 Windows 平台尝试打包为 `tar.gz`，失败时保留目录。

当前 import 能力：

- 支持目录或 `.tar.gz` 输入，
- 支持 `--dry-run` 预览，
- 支持 `--overwrite` 覆盖，
- 默认合并已有数据，
- 可导入 config、workflows、executions、sessions。

当前边界：

- import/export 是备份、迁移和数据检查能力。
- `--overwrite` 具有破坏性，需要在用户层明确风险。
- 默认脱敏不等于全量安全审计，不能保证识别所有 secret 格式。
- 当前 manifest 有版本字段，但不应把它写成完整跨版本迁移协议。

关键实现：

- [src/commands/export.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/export.ts:1)
- [docs/contracts/service-import-export.md](../contracts/service-import-export.md)

### mode switching

当前已有 `mode` 命令，也有 `client mode` 路径。

当前有效模式：

- `strict`
- `relaxed`
- `consensus`

当前边界：

- mode 是本地执行策略输入。
- 它应该影响 sandbox 和安全确认语义。
- 不应该被解释成用户权限等级或租户策略。

关键实现：

- [src/commands/mode.ts](/Users/xin.tong/apps/project/test_trae/VectaHub/src/commands/mode.ts:1)

## Target Design

### 1. 统一入口合同

长期应该让 CLI、socket service、API server、VS Code extension 都走同一组入口合同。

```text
Input
-> Intent / Task Contract / Workflow Request
-> Permission Gate
-> RunContext
-> Execution
-> Trace / Audit
-> Structured Result
-> Recovery Decision
```

这能避免同一个任务在 CLI 和 VS Code 里表现不一致。

### 2. 统一结构化输出

所有面向机器消费的入口都应输出稳定结构：

- `status`
- `runId`
- `traceId`
- `workflowId`
- `taskId`
- `permission`
- `artifacts`
- `warnings`
- `nextAction`

人类可读输出可以存在，但不能成为 VS Code 或其他集成层判断状态的唯一依据。

### 3. 统一权限确认

本地服务和 UI 入口不能绕过 CLI 的安全确认。

目标规则：

- 普通 chat/reply 不触发执行。
- command/workflow/run-task 执行前必须经过风险判断。
- destructive、overwrite、network、filesystem mutation 等动作要进入 Permission Gate。
- VS Code 弹窗只承接用户确认，不重新实现风险分类。

### 4. 统一运行记录

本地入口应能共享运行记录。

目标记录应包含：

- request source，
- user intent summary，
- workflow or task snapshot，
- definition hash，
- selected Agent CLI，
- permission decision，
- trace id，
- output artifact refs，
- verification result，
- recovery decision。

### 5. import/export hardening

import/export 后续需要补强：

- manifest schema version，
- source VectaHub version，
- exported data categories，
- secret redaction summary，
- checksum 或文件清单，
- dry-run diff，
- overwrite confirmation，
- partial import failure report。

## Tradeoffs

### 保持本地轻量 vs 做完整服务平台

推荐保持本地轻量。

原因：

- 当前最强能力在文档任务、workflow、Agent Runtime 和恢复闭环。
- 多用户服务平台会引入认证、授权、存储隔离、并发一致性和运维复杂度。
- 这些复杂度会稀释“小马拉大车”的 CLI 内核定位。

### HTTP API 直接执行 vs API 只做控制入口

短期可以保留 HTTP API 的本地执行能力，但长期应收敛到统一 RunContext。

如果 API 自己生成 workflow、自己执行、自己返回状态，就容易变成第二套执行路径。更稳的方向是 API 只负责请求接入，执行仍交给 workflow/run-task/Agent Runtime 的统一合同。

### VS Code 复制逻辑 vs VS Code 调用 CLI

推荐 VS Code 调用 CLI 或共享合同包，不复制执行逻辑。

插件可以做：

- 选择文件，
- 展示任务，
- 发起执行，
- 展示结果，
- 触发确认。

插件不应该做：

- 自己判断所有命令风险，
- 自己实现 workflow engine，
- 自己维护 Agent Runtime 真相，
- 自己决定恢复策略。

## Implementation Roadmap

### Phase 1: 文档收口

- 将本地服务与集成层纳入能力地图。
- 明确 service/API/VS Code/import-export 是本地集成层，不是多用户平台。
- 把 `service-import-export.md` 降级为字段级规格参考。

### Phase 2: 输出合同收敛

- 为 service/client/API/VS Code 统一结构化结果字段。
- 明确哪些命令支持 JSON。
- 明确人类输出和机器输出边界。

### Phase 3: RunContext 接入

- 让 service、API 和 VS Code 执行路径都能携带 source、trace、permission 和 recovery 上下文。
- 运行记录中保留入口来源和执行定义快照。

### Phase 4: import/export 强化

- 增加 manifest schema。
- 增加 dry-run diff。
- 增加 overwrite confirmation。
- 增加 secret redaction report。

## Verification Plan

文档层验证：

- 搜索是否仍把本地服务描述成多用户平台。
- 搜索 API 是否被描述成稳定公网 API。
- 搜索 VS Code 是否被描述成独立执行引擎。
- 检查能力地图、架构总览和 specs 入口是否互相链接。

实现层验证：

- service/client 命令测试应覆盖 socket 不可连接、submit/status/list/mode/config/shutdown。
- API server 测试应覆盖 body size、invalid JSON、unknown route、workflow list 和 execution list。
- import/export 测试应覆盖 dry-run、overwrite、secret redaction、archive fallback。
- VS Code 集成测试应覆盖 CLI path、agent selection、document task execution、permission prompt 和 cancellation。

## Open Questions

- `serve` 和 `daemon` 是否应长期合并成一个本地服务模型？
- HTTP API 是否需要默认只绑定 localhost，并在文档中明确禁止公网暴露？
- `client submit` 的任务状态是否应与 run-task execution record 统一？
- VS Code extension 是否应只消费 `tools agents --json` 和 `run-task --json` 这类机器接口？
- import/export 的 manifest 版本是否应与 workflow schema version 和 execution record version 联动？
