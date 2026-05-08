# VectaHub 2.0 功能点开发文档

---

## 1. 文档信息

| 属性 | 值 |
|------|-----|
| **文档版本** | v2.0 |
| **创建日期** | 2026-05-06 |
| **最后更新** | 2026-05-08 |
| **状态** | Go 重构迁移基线 |
| **作者** | Development Team |
| **技术栈** | Go 1.21+ |

---

## 2. 功能点总览

VectaHub 2.0 功能开发不是从零开始。当前 TypeScript 1.x 已具备可运行 CLI、NL pipeline、workflow engine、sandbox、CLI tools、audit、execution lifecycle、doctor、API server、debug、monitor、plugins 等能力。2.0 的核心任务是把这些能力迁移到 Go 语言实现，并补齐结构化 JSON 协议、Core SDK、REST/gRPC 服务和可发布的插件接口。

### 2.0 迁移状态定义

| 状态 | 含义 |
|------|------|
| ✅ 1.x 已实现 | 当前 TypeScript 版本已有稳定实现和测试 |
| 🔄 Go 重构迁移 | 2.0 必须迁移该能力到 Go core |
| 🆕 2.0 新增 | 1.x 不完整或没有，需要 2.0 新建 |
| 📋 后续阶段 | 非 MVP，保留设计但不阻塞 2.0 CLI |

说明: 下文各功能小节中的“开发进度”默认表示 Go 2.0 实现进度，不代表 1.x 是否已有对应能力。1.x 已有能力以本节迁移清单为准。

### 2.1 功能分类

| 分类 | 功能点数 | 当前 1.x 基线 | 2.0 目标 |
|------|---------|------|
| **核心功能** | 8 | ✅ 已实现主要能力 | 🔄 Go 重构迁移 |
| **安全增强** | 4 | ✅ 已实现检测、规则、审计 | 🔄 Go 重构迁移 + 强化 |
| **可靠性** | 3 | ✅ 已实现记录、恢复、归档 | 🔄 Go 重构迁移 |
| **协作功能** | 4 | ✅ 已实现导入导出基础能力 | 🔄 Go 重构迁移 / 📋 后续增强 |
| **监控运维** | 3 | ✅ 已实现 trace、monitor、alert 基础能力 | 🔄 Go 重构迁移 |
| **总计** | 22 | ✅ 1.x 作为迁移基线 | 🔄 Go 2.0 统一实现 |

### 2.2 必须迁移的 1.x 用户可见能力

| 能力 | 1.x 入口 | 2.0 迁移要求 |
|------|----------|--------------|
| 自然语言执行 | `vectahub run <intent>` | 保持行为，新增稳定 `--json` |
| 零副作用预览 | `vectahub run --dry-run <intent>` | 保持不安装、不扫描、不执行、不写记录 |
| YAML 工作流执行 | `vectahub run -f <file>` | 兼容现有 YAML 格式 |
| 环境诊断 | `vectahub doctor` | 输出人类格式和 JSON 格式 |
| 工具注册 | `tools list/info/search/commands` | 迁移 git/npm/docker/curl 工具定义 |
| 安全检测 | `security test/list` | 迁移规则引擎和风险等级 |
| 执行模式 | `mode strict/relaxed/consensus` | 保持模式语义 |
| 工作流列表 | `list` | 兼容 `VECTAHUB_HOME/workflows` |
| 执行历史 | `history/detail/rerun/resume/archive` | 兼容 execution record |
| 模板 | `templates list/use/save` | 兼容模板目录 |
| 调度 | `schedule` | 兼容 `schedules.json` |
| API 服务 | `serve` | 迁移 REST，新增 gRPC |
| Chat | `chat` | MVP 保留轻量任务输入，不先做完整 REPL UI |
| 调试 | `debug` | 迁移断点、单步、变量查看 |
| 监控 | `monitor` | 迁移 metrics、alerts、trace |
| 插件 | `plugins` | 迁移插件清单和生命周期 |
| 导入导出 | `export/import` | 迁移数据包格式 |

### 2.3 Go 2.0 新增能力

| 能力 | 说明 | 优先级 |
|------|------|--------|
| CLI JSON 协议 | 所有插件/自动化调用不解析人类日志 | P0 |
| Core SDK | CLI、REST、gRPC、插件共享同一 Go core | P0 |
| SQLite 索引层 | 文件兼容基础上的可选索引 | P1 |
| gRPC 服务 | 高性能本地/远程调用 | P1 |
| 迁移工具 | 从 1.x 数据目录检查和迁移 | P1 |
| VS Code CLI Adapter 支持 | 插件默认 strict + isolated home | P1 |

---

## 3. 核心功能

### 3.1 CLI 框架

#### 需求描述

提供命令行接口，支持用户通过命令行与 VectaHub 交互。

#### 实现方案

使用 Cobra 框架实现 CLI，支持子命令和参数解析。

#### 接口定义

```go
package cmd

import "github.com/spf13/cobra"

var rootCmd = &cobra.Command{
    Use:   "vectahub",
    Short: "VectaHub - 自然语言工作流引擎",
    Long:  `VectaHub 是一个基于自然语言的工作流引擎，使用 Go 语言实现。`,
}

var runCmd = &cobra.Command{
    Use:   "run [input]",
    Short: "执行自然语言命令",
    Args:  cobra.MinimumNArgs(1),
    Run:   runHandler,
}

var serveCmd = &cobra.Command{
    Use:   "serve",
    Short: "启动后台服务",
    Run:   serveHandler,
}

var debugCmd = &cobra.Command{
    Use:   "debug [workflow]",
    Short: "调试工作流",
    Args:  cobra.MinimumNArgs(1),
    Run:   debugHandler,
}
```

#### 数据模型

```go
type CLIConfig struct {
    LogLevel    string
    ConfigFile  string
    OutputFormat string
    Timeout     time.Duration
}
```

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| CLI 框架搭建 | 🔄 Go 重构迁移 | 0% |
| 子命令实现 | 🔄 迁移 1.x 命令集 | 0% |
| 参数解析 | 🔄 Go 重构迁移 | 0% |
| 帮助文档 | 🔄 迁移并更新 | 0% |
| JSON 输出协议 | 🆕 2.0 新增 | 0% |

---

### 3.2 NL 处理引擎

#### 需求描述

将用户自然语言输入转换为结构化的意图和参数。

#### 实现方案

使用规则引擎 + LLM (go-openai) 实现意图匹配和参数提取。

#### 接口定义

```go
package nl

type IntentMatcher interface {
    Match(input string) (*IntentMatchResult, error)
    RegisterIntent(intent *IntentDefinition) error
    GetIntents() []*IntentDefinition
}

type ParamExtractor interface {
    Extract(input string, intent IntentName) (map[string]interface{}, error)
    RegisterPattern(intent IntentName, pattern string) error
}

type NLProcessor struct {
    matcher    IntentMatcher
    extractor  ParamExtractor
    llmClient  *openai.Client
}
```

#### 数据模型

```go
type IntentMatchResult struct {
    Intent    IntentName
    Confidence float64
    Params    map[string]interface{}
}

type IntentDefinition struct {
    Name        IntentName
    Keywords    []string
    Template    string
    Category    IntentCategory
    Priority    int
}
```

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 意图匹配引擎 | ✅ 1.x 已实现，🔄 Go 迁移 | 0% |
| 参数提取器 | ✅ 1.x 已实现，🔄 Go 迁移 | 0% |
| LLM 集成 | ✅ 1.x 已实现，🔄 Go 迁移 | 0% |
| 规则引擎 | ✅ 1.x 已实现，🔄 Go 迁移 | 0% |
| 多意图 / 分类路由 | ✅ 1.x 已实现，🔄 Go 迁移 | 0% |
| YAML workflow 转 task list | ✅ 1.x 已实现，🔄 Go 迁移 | 0% |

---

### 3.3 工作流引擎

#### 需求描述

负责工作流的解析、调度和执行，支持顺序、并行、条件和循环。

#### 实现方案

使用 DAG 构建执行图，支持并行执行和错误处理。

#### 接口定义

```go
package workflow

type Executor interface {
    Execute(wf *Workflow, context map[string]interface{}) (*ExecutionResult, error)
    Stop(executionID string) error
    GetStatus(executionID string) (*ExecutionStatus, error)
}

type Scheduler interface {
    Schedule(wf *Workflow) error
    Cancel(executionID string) error
    GetQueueStatus() (*QueueStatus, error)
}

type Parser interface {
    Parse(content []byte) (*Workflow, error)
    ParseFile(path string) (*Workflow, error)
}
```

#### 数据模型

```go
type Workflow struct {
    ID          string                 `yaml:"id" json:"id"`
    Version     string                 `yaml:"version" json:"version"`
    Name        string                 `yaml:"name" json:"name"`
    Steps       []*Step                `yaml:"steps" json:"steps"`
    Context     map[string]interface{} `yaml:"context,omitempty" json:"context,omitempty"`
}

type Step struct {
    ID        string   `yaml:"id" json:"id"`
    Type      StepType `yaml:"type" json:"type"`
    CLI       string   `yaml:"cli,omitempty" json:"cli,omitempty"`
    Args      []string `yaml:"args,omitempty" json:"args,omitempty"`
    Condition string   `yaml:"condition,omitempty" json:"condition,omitempty"`
    Body      []*Step  `yaml:"body,omitempty" json:"body,omitempty"`
    DependsOn []string `yaml:"depends_on,omitempty" json:"depends_on,omitempty"`
    Timeout   int      `yaml:"timeout,omitempty" json:"timeout,omitempty"`
    Retries   int      `yaml:"retries,omitempty" json:"retries,omitempty"`
}
```

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 工作流解析器 | 📋 计划中 | 0% |
| DAG 构建器 | 📋 计划中 | 0% |
| 执行器 | 📋 计划中 | 0% |
| 调度器 | 📋 计划中 | 0% |

---

### 3.4 容器沙箱

#### 需求描述

提供 Docker 容器级别的安全隔离执行环境。

#### 实现方案

使用 Docker SDK 实现容器创建和管理，支持资源限制。

#### 接口定义

```go
package sandbox

type SandboxManager interface {
    Execute(command string, options *ExecuteOptions) (*ExecuteResult, error)
    Analyze(command string) (*DangerAnalysis, error)
    SetLimits(limits *ResourceLimits) error
}

type ContainerManager interface {
    CreateContainer(config *ContainerConfig) (string, error)
    StartContainer(containerID string) error
    StopContainer(containerID string) error
    RemoveContainer(containerID string) error
}
```

#### 数据模型

```go
type ResourceLimits struct {
    CPUQuota      int64   `yaml:"cpu_quota"`
    CPUPeriod     int64   `yaml:"cpu_period"`
    MemoryLimit   int64   `yaml:"memory_limit"`
    MemorySwap    int64   `yaml:"memory_swap"`
    NetworkAccess bool    `yaml:"network_access"`
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

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| Docker 集成 | 📋 计划中 | 0% |
| 容器管理 | 📋 计划中 | 0% |
| 资源限制 | 📋 计划中 | 0% |
| 危险检测 | 📋 计划中 | 0% |

---

### 3.5 调试器

#### 需求描述

提供工作流调试和状态检查能力。

#### 实现方案

实现断点设置、单步执行、变量监视等功能。

#### 接口定义

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
```

#### 数据模型

```go
type ExecutionState struct {
    CurrentStepID string
    Status        ExecutionStatus
    Variables     map[string]interface{}
    WatchExpressions map[string]*WatchExpression
}

type Breakpoint struct {
    StepID    string
    Condition string
    HitCount  int
}
```

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 断点管理 | 📋 计划中 | 0% |
| 单步执行 | 📋 计划中 | 0% |
| 变量监视 | 📋 计划中 | 0% |
| 状态查看 | 📋 计划中 | 0% |

---

### 3.6 插件系统

#### 需求描述

提供基于接口的灵活插件机制，支持功能扩展。

#### 实现方案

使用 Go 接口定义插件契约，支持动态加载。

#### 接口定义

```go
package plugin

type Plugin interface {
    ID() string
    Name() string
    Version() string
    Init(ctx *PluginContext) error
    Activate() error
    Deactivate() error
}

type PluginManager interface {
    Load(path string) (Plugin, error)
    Unload(pluginID string) error
    GetPlugin(pluginID string) (Plugin, error)
    ListPlugins() []Plugin
}

type PluginContext struct {
    Config     map[string]interface{}
    Logger     *zap.Logger
    Sandbox    SandboxManager
    Workflow   Executor
}
```

#### 数据模型

```go
type PluginManifest struct {
    ID          string            `yaml:"id"`
    Name        string            `yaml:"name"`
    Version     string            `yaml:"version"`
    Description string            `yaml:"description"`
    Author      string            `yaml:"author"`
    Permissions []string          `yaml:"permissions"`
    Config      map[string]interface{} `yaml:"config"`
}
```

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 插件接口定义 | 📋 计划中 | 0% |
| 插件加载器 | 📋 计划中 | 0% |
| 插件管理器 | 📋 计划中 | 0% |
| 插件钩子 | 📋 计划中 | 0% |

---

### 3.7 监控系统

#### 需求描述

提供系统监控和指标采集能力。

#### 实现方案

使用 Prometheus + OpenTelemetry 实现监控。

#### 接口定义

```go
package monitor

type Monitor interface {
    RecordMetric(metric *Metric) error
    GetMetrics(filter *MetricFilter) ([]*Metric, error)
    Start() error
    Stop() error
}

type Alerter interface {
    AddAlert(rule *AlertRule) error
    RemoveAlert(ruleID string) error
    CheckAlerts() ([]*Alert, error)
}
```

#### 数据模型

```go
type Metric struct {
    Name      string
    Value     float64
    Timestamp time.Time
    Labels    map[string]string
}

type AlertRule struct {
    ID          string
    Name        string
    Condition   string
    Threshold   float64
    Severity    AlertSeverity
    Actions     []AlertAction
}
```

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 指标采集 | 📋 计划中 | 0% |
| Prometheus 集成 | 📋 计划中 | 0% |
| 告警规则 | 📋 计划中 | 0% |
| 仪表板 | 📋 计划中 | 0% |

---

### 3.8 后台服务

#### 需求描述

提供后台服务，支持远程调用和任务队列。

#### 实现方案

使用 gRPC 实现高性能 RPC 服务。

#### 接口定义

```go
package daemon

type DaemonServer interface {
    Start() error
    Stop() error
    AddTask(task *Task) error
    GetTask(taskID string) (*Task, error)
    CancelTask(taskID string) error
}

type SessionManager interface {
    CreateSession(userID string) (*Session, error)
    GetSession(sessionID string) (*Session, error)
    CloseSession(sessionID string) error
}
```

#### 数据模型

```go
type Task struct {
    ID        string
    Type      TaskType
    Status    TaskStatus
    Input     map[string]interface{}
    Output    map[string]interface{}
    CreatedAt time.Time
    UpdatedAt time.Time
}

type Session struct {
    ID        string
    UserID    string
    Tasks     []string
    CreatedAt time.Time
    ExpiresAt time.Time
}
```

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| gRPC 服务 | 📋 计划中 | 0% |
| 任务队列 | 📋 计划中 | 0% |
| 会话管理 | 📋 计划中 | 0% |
| 心跳检测 | 📋 计划中 | 0% |

---

## 4. 安全增强功能

### 4.1 容器化隔离

#### 需求描述

使用 Docker 容器实现命令执行的隔离。

#### 实现方案

集成 Docker SDK，为每个命令创建独立容器。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 容器创建 | 📋 计划中 | 0% |
| 容器销毁 | 📋 计划中 | 0% |
| 资源限制 | 📋 计划中 | 0% |
| 网络隔离 | 📋 计划中 | 0% |

---

### 4.2 资源限制

#### 需求描述

限制命令执行的 CPU、内存等资源使用。

#### 实现方案

使用 Docker cgroups 实现资源限制。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| CPU 限制 | 📋 计划中 | 0% |
| 内存限制 | 📋 计划中 | 0% |
| 磁盘限制 | 📋 计划中 | 0% |
| 网络限制 | 📋 计划中 | 0% |

---

### 4.3 RBAC 权限控制

#### 需求描述

实现基于角色的访问控制。

#### 实现方案

定义角色和权限，实现权限检查。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 角色定义 | 📋 计划中 | 0% |
| 权限检查 | 📋 计划中 | 0% |
| 用户管理 | 📋 计划中 | 0% |
| 策略配置 | 📋 计划中 | 0% |

---

### 4.4 审计日志

#### 需求描述

记录所有操作日志，支持审计。

#### 实现方案

使用结构化日志，记录所有关键操作。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 日志记录 | 📋 计划中 | 0% |
| 日志查询 | 📋 计划中 | 0% |
| 日志导出 | 📋 计划中 | 0% |
| 日志分析 | 📋 计划中 | 0% |

---

## 5. 可靠性功能

### 5.1 工作流持久化

#### 需求描述

支持工作流的持久化存储。

#### 实现方案

使用文件系统或数据库存储工作流。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 存储接口 | 📋 计划中 | 0% |
| 文件存储 | 📋 计划中 | 0% |
| 数据库存储 | 📋 计划中 | 0% |
| 版本管理 | 📋 计划中 | 0% |

---

### 5.2 故障恢复

#### 需求描述

支持工作流执行失败后的恢复。

#### 实现方案

记录执行状态，支持断点续传。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 状态记录 | 📋 计划中 | 0% |
| 断点续传 | 📋 计划中 | 0% |
| 自动重试 | 📋 计划中 | 0% |
| 错误处理 | 📋 计划中 | 0% |

---

### 5.3 高可用

#### 需求描述

支持多实例部署，实现高可用。

#### 实现方案

使用分布式锁和任务队列。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 分布式锁 | 📋 计划中 | 0% |
| 任务队列 | 📋 计划中 | 0% |
| 负载均衡 | 📋 计划中 | 0% |
| 健康检查 | 📋 计划中 | 0% |

---

## 6. 协作功能

### 6.1 工作流共享

#### 需求描述

支持工作流的共享和导入导出。

#### 实现方案

支持 YAML 格式的工作流文件。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 导出功能 | 📋 计划中 | 0% |
| 导入功能 | 📋 计划中 | 0% |
| 格式验证 | 📋 计划中 | 0% |
| 版本兼容 | 📋 计划中 | 0% |

---

### 6.2 权限管理

#### 需求描述

管理用户对工作流的访问权限。

#### 实现方案

实现基于 ACL 的权限控制。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 权限定义 | 📋 计划中 | 0% |
| 权限检查 | 📋 计划中 | 0% |
| 权限继承 | 📋 计划中 | 0% |
| 权限审计 | 📋 计划中 | 0% |

---

### 6.3 通知系统

#### 需求描述

支持工作流执行状态的通知。

#### 实现方案

支持邮件、Webhook 等通知方式。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 邮件通知 | 📋 计划中 | 0% |
| Webhook | 📋 计划中 | 0% |
| 消息队列 | 📋 计划中 | 0% |
| 通知模板 | 📋 计划中 | 0% |

---

### 6.4 执行历史

#### 需求描述

记录工作流执行历史，支持查询。

#### 实现方案

使用数据库存储执行记录。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 记录存储 | 📋 计划中 | 0% |
| 查询接口 | 📋 计划中 | 0% |
| 统计分析 | 📋 计划中 | 0% |
| 历史清理 | 📋 计划中 | 0% |

---

## 7. 监控运维功能

### 7.1 性能监控

#### 需求描述

监控系统性能指标。

#### 实现方案

集成 Prometheus 采集指标。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 指标采集 | 📋 计划中 | 0% |
| 指标存储 | 📋 计划中 | 0% |
| 指标查询 | 📋 计划中 | 0% |
| 指标可视化 | 📋 计划中 | 0% |

---

### 7.2 日志聚合

#### 需求描述

聚合和分析系统日志。

#### 实现方案

使用 ELK 或 Loki 日志系统。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 日志采集 | 📋 计划中 | 0% |
| 日志存储 | 📋 计划中 | 0% |
| 日志查询 | 📋 计划中 | 0% |
| 日志分析 | 📋 计划中 | 0% |

---

### 7.3 告警系统

#### 需求描述

支持自定义告警规则和通知。

#### 实现方案

实现告警规则引擎和通知渠道。

#### 开发进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 规则引擎 | 📋 计划中 | 0% |
| 告警触发 | 📋 计划中 | 0% |
| 通知渠道 | 📋 计划中 | 0% |
| 告警历史 | 📋 计划中 | 0% |

---

## 8. 开发计划

### 8.1 阶段划分

| 阶段 | 时间 | 主要任务 |
|------|------|---------|
| **Phase 0** | 第 0 周 | 冻结 1.x 行为契约，补 CLI JSON 协议 |
| **Phase 1** | 第 1 周 | Go 基础设施 + Cobra/Viper CLI |
| **Phase 2** | 第 2-3 周 | 核心模块迁移（NL、工作流、沙箱、存储） |
| **Phase 3** | 第 4 周 | REST/gRPC、调试器、插件系统 |
| **Phase 4** | 第 5 周 | 监控、后台服务、VS Code 插件适配 |
| **Phase 5** | 第 6 周 | 安全增强、迁移工具、兼容测试 |

### 8.2 里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| **M0** | 第 0 周 | 1.x 行为契约、JSON 协议、迁移测试清单 |
| **M1** | 第 1 周 | Go CLI 框架和配置路径完成 |
| **M2** | 第 3 周 | 核心模块迁移完成 |
| **M3** | 第 4 周 | REST/gRPC、调试器、插件接口完成 |
| **M4** | 第 5 周 | 监控系统和后台服务完成 |
| **M5** | 第 6 周 | 兼容测试通过，可发布候选版本 |

---

## 附录：版本历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|---------|------|
| v2.0 | 2026-05-06 | Go 语言版本 | Development Team |
| v2.1 | 2026-05-08 | 补充 1.x 功能迁移基线、JSON 协议和 Go 重构阶段 | Development Team |
