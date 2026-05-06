# VectaHub 2.0 系统架构设计文档

---

## 1. 文档信息

| 属性 | 值 |
|------|-----|
| **文档版本** | v2.0 |
| **创建日期** | 2026-05-06 |
| **最后更新** | 2026-05-06 |
| **状态** | 草案 |
| **作者** | Architecture Team |
| **技术栈** | Go 1.21+ |

---

## 2. 系统概述

### 2.1 产品定位

VectaHub 2.0 是一个基于自然语言的工作流引擎，使用 Go 语言实现，旨在通过自然语言交互让用户快速编排和执行自动化任务。

### 2.2 核心价值

- **自然语言驱动**：通过 NL2Workflow 将自然语言转换为可执行的工作流
- **容器化隔离**：Docker 容器级别的安全隔离
- **高性能执行**：Go 原生并发，充分利用多核性能
- **插件扩展**：基于接口的灵活插件机制
- **调试支持**：完整的工作流调试能力
- **云原生**：Docker/Kubernetes 原生支持

---

## 3. 功能架构

### 3.1 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 5: 用户交互层                          │
│    CLI / Web UI / gRPC Client / REPL Chat                       │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 4: 编排层                              │
│    Workflow Engine / Task Queue / Scheduler                    │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 3: 处理层                              │
│    NL Processing / Intent Matching / Command Synthesis          │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 2: 执行层                              │
│    Container Executor / CLI Tools / Plugins                     │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 1: 基础设施层                          │
│    Audit / Logger / Config / Monitoring / Security             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块划分

| 模块 | 职责 | 状态 |
|------|------|------|
| **CLI** | 命令行接口，用户入口 | 📋 计划中 |
| **NL Core** | 自然语言处理核心 | 📋 计划中 |
| **Workflow Engine** | 工作流执行引擎 | 📋 计划中 |
| **Container Sandbox** | 容器化沙箱隔离 | 📋 计划中 |
| **Debugger** | 工作流调试器 | 📋 计划中 |
| **Plugins** | 插件系统 | 📋 计划中 |
| **Monitoring** | 监控与指标 | 📋 计划中 |
| **Security** | 安全协议 | 📋 计划中 |
| **Daemon** | 后台服务 | 📋 计划中 |

---

## 4. 核心模块设计

### 4.1 自然语言处理模块 (NL Core)

#### 4.1.1 功能定位

负责将用户自然语言输入转换为结构化的意图和参数。

#### 4.1.2 内部架构

```
用户输入 → 分词 → 意图匹配 → 参数提取 → 工作流生成
    │           │           │           │           │
    ▼           ▼           ▼           ▼           ▼
  Input    Tokenizer    Matcher    Extractor    Synthesizer
```

#### 4.1.3 关键组件

| 组件 | 职责 | 技术实现 |
|------|------|---------|
| **IntentMatcher** | 意图识别与匹配 | 规则引擎 + LLM (go-openai) |
| **ParamExtractor** | 参数实体提取 | 正则匹配 + NER |
| **Coordinator** | 多意图协调 | 优先级规则 |
| **CommandSynthesizer** | 命令合成 | 模板引擎 (text/template) |

#### 4.1.4 Go 接口定义

```go
package nl

type IntentMatcher interface {
    Match(input string) (*IntentMatchResult, error)
    RegisterIntent(intent *IntentDefinition) error
    GetIntents() []*IntentDefinition
}

type IntentMatchResult struct {
    Intent    IntentName
    Confidence float64
    Params    map[string]interface{}
}

type IntentName string

const (
    IntentFileFind      IntentName = "FILE_FIND"
    IntentGitWorkflow   IntentName = "GIT_WORKFLOW"
    IntentDataScraping  IntentName = "DATA_SCRAPING"
    IntentContentSummary IntentName = "CONTENT_SUMMARY"
    IntentDialogGreeting IntentName = "DIALOG_GREETING"
    IntentUnknown       IntentName = "UNKNOWN"
)

type IntentDefinition struct {
    Name        IntentName
    Keywords    []string
    Template    string
    Category    IntentCategory
    Priority    int
}

type IntentCategory string

const (
    CategoryQuery    IntentCategory = "QUERY"
    CategoryExecute   IntentCategory = "EXECUTE"
    CategoryGenerate  IntentCategory = "GENERATE"
    CategoryDialog    IntentCategory = "DIALOG"
)
```

---

### 4.2 工作流引擎 (Workflow Engine)

#### 4.2.1 功能定位

负责工作流的解析、调度和执行。

#### 4.2.2 核心数据结构

```go
package workflow

type Workflow struct {
    ID          string                 `yaml:"id" json:"id"`
    Version     string                 `yaml:"version" json:"version"`
    Name        string                 `yaml:"name" json:"name"`
    Description string                 `yaml:"description,omitempty" json:"description,omitempty"`
    Steps       []*Step                `yaml:"steps" json:"steps"`
    Context     map[string]interface{} `yaml:"context,omitempty" json:"context,omitempty"`
    Metadata    map[string]interface{} `yaml:"metadata,omitempty" json:"metadata,omitempty"`
    CreatedAt   string                 `yaml:"created_at" json:"created_at"`
    UpdatedAt   string                 `yaml:"updated_at" json:"updated_at"`
}

type Step struct {
    ID        string   `yaml:"id" json:"id"`
    Type      StepType `yaml:"type" json:"type"`
    Name      string   `yaml:"name,omitempty" json:"name,omitempty"`
    CLI       string   `yaml:"cli,omitempty" json:"cli,omitempty"`
    Args      []string `yaml:"args,omitempty" json:"args,omitempty"`
    Condition string   `yaml:"condition,omitempty" json:"condition,omitempty"`
    Body      []*Step  `yaml:"body,omitempty" json:"body,omitempty"`
    DependsOn []string `yaml:"depends_on,omitempty" json:"depends_on,omitempty"`
    Timeout   int      `yaml:"timeout,omitempty" json:"timeout,omitempty"`
    Retries   int      `yaml:"retries,omitempty" json:"retries,omitempty"`
    OnError   string   `yaml:"on_error,omitempty" json:"on_error,omitempty"`
}

type StepType string

const (
    StepTypeCLI        StepType = "cli"
    StepTypeCondition  StepType = "condition"
    StepTypeLoop       StepType = "loop"
    StepTypeParallel   StepType = "parallel"
)
```

#### 4.2.3 执行流程

```
解析工作流 → 构建执行图 → 拓扑排序 → 并行执行 → 收集结果
     │              │            │           │           │
     ▼              ▼            ▼           ▼           ▼
  Parser        DAG Builder   Topological  Executor    Collector
                             Sorter
```

#### 4.2.4 Go 接口定义

```go
package workflow

type Executor interface {
    Execute(wf *Workflow, context map[string]interface{}) (*ExecutionResult, error)
    Stop(executionID string) error
    GetStatus(executionID string) (*ExecutionStatus, error)
}

type ExecutionResult struct {
    ID           string                 `json:"id"`
    Status       ExecutionStatus        `json:"status"`
    Outputs      map[string]interface{} `json:"outputs"`
    Error        string                 `json:"error,omitempty"`
    StartedAt    string                 `json:"started_at"`
    CompletedAt  string                 `json:"completed_at,omitempty"`
}

type ExecutionStatus string

const (
    StatusPending   ExecutionStatus = "pending"
    StatusRunning   ExecutionStatus = "running"
    StatusPaused    ExecutionStatus = "paused"
    StatusSuccess   ExecutionStatus = "success"
    StatusFailed    ExecutionStatus = "failed"
    StatusCancelled ExecutionStatus = "cancelled"
)
```

---

### 4.3 容器沙箱模块 (Container Sandbox)

#### 4.3.1 功能定位

提供 Docker 容器级别的安全隔离执行环境。

#### 4.3.2 安全模型

| 隔离级别 | 描述 | 实现方式 |
|---------|------|---------|
| **STRICT** | 严格模式，仅允许白名单命令 | Docker + seccomp |
| **RELAXED** | 宽松模式，允许大部分命令 | Docker + 资源限制 |
| **CONSENSUS** | 共识模式，需要用户确认 | Docker + 交互式确认 |

#### 4.3.3 资源限制

```go
package sandbox

type ResourceLimits struct {
    CPUQuota      int64   `yaml:"cpu_quota"`       // CPU 配额 (微秒)
    CPUPeriod     int64   `yaml:"cpu_period"`      // CPU 周期 (微秒)
    MemoryLimit   int64   `yaml:"memory_limit"`    // 内存限制 (字节)
    MemorySwap    int64   `yaml:"memory_swap"`     // 交换空间限制 (字节)
    NetworkAccess bool    `yaml:"network_access"`  // 是否允许网络访问
}

type ContainerConfig struct {
    Image         string          `yaml:"image"`
    Command       []string        `yaml:"command"`
    Env           []string        `yaml:"env"`
    WorkingDir    string          `yaml:"working_dir"`
    Limits        *ResourceLimits `yaml:"limits"`
    Timeout       time.Duration   `yaml:"timeout"`
}
```

#### 4.3.4 Go 接口定义

```go
package sandbox

type SandboxManager interface {
    Execute(command string, options *ExecuteOptions) (*ExecuteResult, error)
    Analyze(command string) (*DangerAnalysis, error)
    SetLimits(limits *ResourceLimits) error
}

type ExecuteOptions struct {
    Timeout   time.Duration
    Env       map[string]string
    CWD       string
    Container *ContainerConfig
}

type ExecuteResult struct {
    Stdout   string
    Stderr   string
    ExitCode int
    Duration time.Duration
}

type DangerAnalysis struct {
    RiskLevel   RiskLevel
    Category    DangerCategory
    Description string
    Suggestion  string
}

type RiskLevel string

const (
    RiskSafe     RiskLevel = "safe"
    RiskLow      RiskLevel = "low"
    RiskMedium   RiskLevel = "medium"
    RiskHigh     RiskLevel = "high"
    RiskCritical RiskLevel = "critical"
)
```

---

### 4.4 调试器模块 (Debugger)

#### 4.4.1 功能定位

提供工作流调试和状态检查能力。

#### 4.4.2 调试功能

| 功能 | 描述 |
|------|------|
| **断点设置** | 在指定步骤设置断点 |
| **单步执行** | 逐步骤执行 |
| **变量监视** | 实时查看变量值 |
| **状态查看** | 查看工作流执行状态 |
| **执行历史** | 查看执行历史记录 |

#### 4.4.3 Go 接口定义

```go
package debugger

type WorkflowDebugger interface {
    SetBreakpoint(stepID string) error
    RemoveBreakpoint(stepID string) error
    StepOver() (*ExecutionState, error)
    Continue() (*ExecutionState, error)
    Pause() error
    Reset() error
}

type WatchExpression struct {
    ID         string
    Expression string
    Value      interface{}
    Error      string
}

type DebuggerContext struct {
    Variables         map[string]interface{}
    WatchExpressions  map[string]*WatchExpression
    
    EvaluateWatchExpressions(variables map[string]interface{}) error
    AddWatchExpression(expression string) (string, error)
    RemoveWatchExpression(id string) error
}
```

---

## 5. 技术选型

### 5.1 语言与框架

| 分类 | 技术 | 版本 | 选型理由 |
|------|------|------|---------|
| **语言** | Go | 1.21+ | 高性能、并发模型、云原生 |
| **CLI** | Cobra | 1.8+ | 成熟的 CLI 框架 |
| **配置** | Viper | 1.18+ | 功能强大的配置管理 |
| **日志** | Zap | 1.26+ | 高性能结构化日志 |
| **HTTP** | Gin | 1.9+ | 高性能 HTTP 框架 |
| **gRPC** | grpc-go | 1.59+ | 高性能 RPC 框架 |
| **容器** | Docker SDK | 24.0+ | Docker API 集成 |
| **LLM** | go-openai | 1.17+ | OpenAI API 客户端 |
| **测试** | testify | 1.8+ | 断言和 mock 工具 |

### 5.2 核心依赖

| 依赖 | 用途 |
|------|------|
| **github.com/spf13/cobra** | CLI 框架 |
| **github.com/spf13/viper** | 配置管理 |
| **go.uber.org/zap** | 结构化日志 |
| **github.com/gin-gonic/gin** | HTTP 服务 |
| **google.golang.org/grpc** | gRPC 服务 |
| **github.com/docker/docker/client** | Docker 客户端 |
| **github.com/sashabaranov/go-openai** | OpenAI API |
| **github.com/stretchr/testify** | 测试框架 |
| **github.com/prometheus/client_golang** | Prometheus 指标 |
| **go.opentelemetry.io/otel** | OpenTelemetry 追踪 |

---

## 6. 项目结构

```
vectahub/
├── cmd/
│   ├── vectahub/              # CLI 入口
│   │   └── main.go
│   └── daemon/                # Daemon 入口
│       └── main.go
├── internal/
│   ├── cli/                   # CLI 命令
│   │   ├── root.go
│   │   ├── run.go
│   │   ├── serve.go
│   │   └── debug.go
│   ├── nl/                    # 自然语言处理
│   │   ├── matcher.go
│   │   ├── extractor.go
│   │   ├── coordinator.go
│   │   └── synthesizer.go
│   ├── workflow/              # 工作流引擎
│   │   ├── engine.go
│   │   ├── executor.go
│   │   ├── parser.go
│   │   └── scheduler.go
│   ├── sandbox/               # 容器沙箱
│   │   ├── manager.go
│   │   ├── container.go
│   │   ├── detector.go
│   │   └── limits.go
│   ├── debugger/              # 调试器
│   │   ├── debugger.go
│   │   ├── breakpoint.go
│   │   └── watcher.go
│   ├── plugin/                # 插件系统
│   │   ├── manager.go
│   │   ├── loader.go
│   │   └── interface.go
│   ├── monitor/               # 监控
│   │   ├── monitor.go
│   │   ├── metrics.go
│   │   └── alert.go
│   ├── security/              # 安全
│   │   ├── rbac.go
│   │   ├── audit.go
│   │   └── permission.go
│   └── daemon/                # Daemon 服务
│       ├── server.go
│       ├── session.go
│       └── task.go
├── pkg/
│   ├── config/                # 配置
│   │   └── config.go
│   ├── logger/                # 日志
│   │   └── logger.go
│   └── utils/                 # 工具函数
│       ├── string.go
│       └── file.go
├── api/
│   ├── proto/                 # gRPC proto 文件
│   │   └── vectahub.proto
│   └── openapi/               # OpenAPI 规范
│       └── openapi.yaml
├── config/
│   ├── vectahub.yaml          # 配置文件
│   ├── intents.yaml           # 意图定义
│   └── templates.yaml         # 模板定义
├── deployments/
│   ├── docker/
│   │   └── Dockerfile
│   └── kubernetes/
│       ├── deployment.yaml
│       └── service.yaml
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

---

## 7. 交互流程

### 7.1 命令执行流程

```
用户 → CLI → NL处理 → 意图匹配 → 工作流生成 → 沙箱检测 → 容器执行 → 返回结果
          │                                    │
          └─────────── 审计日志 ←───────────────┘
```

### 7.2 服务启动流程

```
启动命令 → 加载配置 → 初始化模块 → 创建gRPC服务 → 监听连接 → 处理请求
              │              │
              ↓              ↓
           审计日志        监控启动
```

---

## 8. 数据模型

### 8.1 核心实体

| 实体 | 说明 | 关键字段 |
|------|------|---------|
| **Task** | 任务记录 | ID, Input, Status, Result |
| **Workflow** | 工作流定义 | ID, Version, Steps |
| **ExecutionRecord** | 执行记录 | ExecutionID, Status, Steps |
| **Plugin** | 插件实例 | Manifest, Status, Hooks |
| **Alert** | 告警记录 | Type, Severity, Message |

---

## 9. 安全架构

### 9.1 安全边界

```
┌─────────────────────────────────────────────────────┐
│                   外部边界                          │
│  用户输入验证 → 输入过滤 → 危险检测 → 权限检查      │
├─────────────────────────────────────────────────────┤
│                   内部边界                          │
│  容器隔离 → 资源限制 → 操作审计 → 日志脱敏          │
└─────────────────────────────────────────────────────┘
```

### 9.2 安全措施

| 措施 | 实现方式 |
|------|---------|
| **输入验证** | 正则匹配、类型检查 |
| **危险检测** | 规则引擎、模式匹配 |
| **容器隔离** | Docker 容器、seccomp |
| **操作审计** | 完整审计日志 |
| **权限控制** | RBAC 角色权限 |

---

## 10. 监控与可观测性

### 10.1 指标类型

| 指标 | 描述 | 采集频率 |
|------|------|---------|
| **CPU使用率** | 系统CPU占用 | 10s |
| **内存使用率** | 内存占用 | 10s |
| **响应时间** | 请求响应时长 | 每次请求 |
| **错误计数** | 错误发生次数 | 每次错误 |
| **成功率** | 操作成功比例 | 每分钟 |

### 10.2 日志结构

```go
package audit

type AuditLog struct {
    ID        string                 `json:"id"`
    Event     AuditEventType         `json:"event"`
    Timestamp string                 `json:"timestamp"`
    SessionID string                 `json:"session_id"`
    UserID    string                 `json:"user_id,omitempty"`
    Module    string                 `json:"module"`
    Action    string                 `json:"action"`
    Input     map[string]interface{} `json:"input,omitempty"`
    Output    map[string]interface{} `json:"output,omitempty"`
    Success   bool                   `json:"success"`
    Error     string                 `json:"error,omitempty"`
    IPAddress string                 `json:"ip_address,omitempty"`
}

type AuditEventType string

const (
    EventCommandExecute   AuditEventType = "COMMAND_EXECUTE"
    EventWorkflowStart    AuditEventType = "WORKFLOW_START"
    EventWorkflowComplete AuditEventType = "WORKFLOW_COMPLETE"
    EventPluginInstall    AuditEventType = "PLUGIN_INSTALL"
    EventConfigChange     AuditEventType = "CONFIG_CHANGE"
    EventAuthLogin        AuditEventType = "AUTH_LOGIN"
    EventAuthLogout       AuditEventType = "AUTH_LOGOUT"
)
```

---

## 11. 扩展性设计

### 11.1 插件机制

插件可扩展的能力：
- 意图匹配扩展
- 命令模板扩展
- 通知渠道扩展
- 存储后端扩展

### 11.2 配置扩展

支持通过配置文件扩展：
- 命令规则
- 意图模板
- 安全策略
- 监控阈值

---

## 12. 部署与集成

### 12.1 部署方式

| 方式 | 适用场景 |
|------|---------|
| **单机模式** | 个人开发、测试 |
| **Daemon模式** | 团队共享服务 |
| **容器部署** | 生产环境 |
| **Kubernetes** | 云原生部署 |

### 12.2 集成接口

| 接口 | 协议 | 用途 |
|------|------|------|
| **CLI** | 命令行 | 交互式操作 |
| **gRPC** | gRPC | 高性能 RPC |
| **REST API** | HTTP | 外部系统集成 |

---

## 附录：版本历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|---------|------|
| v2.0 | 2026-05-06 | Go 语言版本 | Architecture Team |
