# VectaHub 2.0 数据模型设计文档

---

## 1. 文档信息

| 属性 | 值 |
|------|-----|
| **文档版本** | v2.0 |
| **创建日期** | 2026-05-06 |
| **最后更新** | 2026-05-08 |
| **状态** | Go 重构数据迁移基线 |
| **作者** | Data Team |
| **技术栈** | Go 1.21+ |

---

## 2. 数据模型总览

VectaHub 2.0 数据模型必须兼容当前 1.x 文件数据，并允许后续引入 SQLite / PostgreSQL 作为索引或服务化存储。默认 CLI 模式仍以本地文件为事实来源，避免破坏现有用户数据。

### 2.1 模型分类

| 分类 | 模型数 | 存储方式 |
|------|--------|---------|
| **核心模型** | 5 | 文件/数据库 |
| **工作流模型** | 4 | YAML/数据库 |
| **执行模型** | 3 | 数据库 |
| **插件模型** | 3 | 文件/数据库 |
| **监控模型** | 3 | 时序数据库 |
| **安全模型** | 3 | 数据库 |

---

### 2.2 1.x 数据目录兼容

2.0 继续支持以下解析优先级:

```text
VECTAHUB_HOME > $HOME/.vectahub
```

兼容目录布局:

```text
.vectahub/
  config.yaml
  workflows/
    <workflow-id>.yaml
    <workflow-id>.json
  executions/
    <execution-id>.json
  outputs/
    <execution-id>/<step-id>.stdout
    <execution-id>/<step-id>.stderr
  logs/
    audit/
      YYYY-MM-DD.jsonl
    traces/
  schedules.json
  command-rules/
    blocklist.json
    allowlist.json
  security-config.json
  security-database.json
  plugins/
  plugins.json
  templates/
  archives/
```

迁移要求:

- 2.0 首次启动不得自动破坏或重写 1.x 数据。
- 2.0 读取旧数据失败时必须返回结构化诊断。
- 2.0 写入新字段时必须保持旧字段可忽略。
- 测试和插件调用必须能通过 `VECTAHUB_HOME` 隔离数据目录。

### 2.3 必须迁移的 1.x 模型

| 模型 | 1.x 来源 | 2.0 说明 |
|------|----------|----------|
| Config | `config.yaml` | 保留 LLM、external_cli、priority、模板目录 |
| Workflow | `workflows/*.yaml/json` | 兼容 steps、mode、createdAt |
| Step | workflow steps | 支持 exec、if、for_each、parallel、opencli 等类型 |
| ExecutionRecord | `executions/*.json` | 保存状态、步骤、警告、metadata |
| StepRecord | execution steps | 保存 output/error/iterations/outputRef |
| OutputReference | `outputs/` | 大输出分离存储 |
| AuditEvent | `logs/audit/*.jsonl` | 保持 JSONL |
| ScheduleEntry | `schedules.json` | cron、workflowFile、command、args、lastStatus |
| CommandRule | `command-rules` | blocklist/allowlist/default policy |
| SecurityConfig | `security-config.json` | 安全策略配置 |
| SecurityDatabase | `security-database.json` | 规则库和检测结果 |
| ToolDefinition | 内置 registry | git/npm/docker/curl |
| PluginManifest | `plugins/` | 插件元信息、状态、配置 |
| Trace / Alert | trace-audit / monitor | trace span、告警和指标 |

---

## 3. 核心数据模型

### 3.1 配置模型

```go
package config

type Config struct {
    Server     ServerConfig     `yaml:"server" json:"server"`
    Database   DatabaseConfig   `yaml:"database" json:"database"`
    Sandbox    SandboxConfig    `yaml:"sandbox" json:"sandbox"`
    Monitoring MonitoringConfig `yaml:"monitoring" json:"monitoring"`
    Logging    LoggingConfig    `yaml:"logging" json:"logging"`
    Security   SecurityConfig   `yaml:"security" json:"security"`
    Paths      PathConfig       `yaml:"paths" json:"paths"`
    AI         AIConfig         `yaml:"ai_providers" json:"ai_providers"`
    ExternalCLI map[string]ExternalCLIConfig `yaml:"external_cli" json:"external_cli"`
    Priority   []string        `yaml:"priority" json:"priority"`
}

type ServerConfig struct {
    Host         string        `yaml:"host" json:"host"`
    Port         int           `yaml:"port" json:"port"`
    GRPCPort     int           `yaml:"grpc_port" json:"grpc_port"`
    ReadTimeout  time.Duration `yaml:"read_timeout" json:"read_timeout"`
    WriteTimeout time.Duration `yaml:"write_timeout" json:"write_timeout"`
}

type DatabaseConfig struct {
    Type     string `yaml:"type" json:"type"`     // sqlite, postgresql, mysql
    Host     string `yaml:"host" json:"host"`
    Port     int    `yaml:"port" json:"port"`
    Database string `yaml:"database" json:"database"`
    Username string `yaml:"username" json:"username"`
    Password string `yaml:"password" json:"password"`
    SSLMode  string `yaml:"ssl_mode" json:"ssl_mode"`
}

type SandboxConfig struct {
    DefaultImage    string         `yaml:"default_image" json:"default_image"`
    DefaultTimeout time.Duration  `yaml:"default_timeout" json:"default_timeout"`
    ResourceLimits ResourceLimits `yaml:"resource_limits" json:"resource_limits"`
}

type MonitoringConfig struct {
    Enabled    bool   `yaml:"enabled" json:"enabled"`
    Prometheus struct {
        Enabled bool   `yaml:"enabled" json:"enabled"`
        Port    int    `yaml:"port" json:"port"`
        Path    string `yaml:"path" json:"path"`
    } `yaml:"prometheus" json:"prometheus"`
    OpenTelemetry struct {
        Enabled  bool   `yaml:"enabled" json:"enabled"`
        Endpoint string `yaml:"endpoint" json:"endpoint"`
    } `yaml:"opentelemetry" json:"opentelemetry"`
}

type LoggingConfig struct {
    Level      string `yaml:"level" json:"level"`
    Format     string `yaml:"format" json:"format"`     // json, text
    Output     string `yaml:"output" json:"output"`     // stdout, file
    FilePath   string `yaml:"file_path" json:"file_path"`
    MaxSize    int    `yaml:"max_size" json:"max_size"`     // MB
    MaxBackups int    `yaml:"max_backups" json:"max_backups"`
    MaxAge     int    `yaml:"max_age" json:"max_age"`         // days
}

type SecurityConfig struct {
    RBACEnabled bool `yaml:"rbac_enabled" json:"rbac_enabled"`
    AuditEnabled bool `yaml:"audit_enabled" json:"audit_enabled"`
    EncryptionEnabled bool `yaml:"encryption_enabled" json:"encryption_enabled"`
}

type PathConfig struct {
    Home         string `yaml:"home" json:"home"`
    WorkflowsDir string `yaml:"workflows_dir" json:"workflows_dir"`
    ExecutionsDir string `yaml:"executions_dir" json:"executions_dir"`
    LogsDir      string `yaml:"logs_dir" json:"logs_dir"`
}

type AIConfig struct {
    VectaHubLLM LLMProviderConfig `yaml:"vectahub_llm" json:"vectahub_llm"`
}

type LLMProviderConfig struct {
    Provider  string `yaml:"provider" json:"provider"`
    APIKey    string `yaml:"api_key,omitempty" json:"-"`
    Model     string `yaml:"model,omitempty" json:"model,omitempty"`
    BaseURL   string `yaml:"base_url,omitempty" json:"base_url,omitempty"`
    TimeoutMS int    `yaml:"timeout_ms,omitempty" json:"timeout_ms,omitempty"`
    Enabled   bool   `yaml:"enabled" json:"enabled"`
}

type ExternalCLIConfig struct {
    Enabled       bool `yaml:"enabled" json:"enabled"`
    HasPermission bool `yaml:"has_permission" json:"has_permission"`
}
```

---

### 3.2 用户模型

```go
package model

type User struct {
    ID        string    `yaml:"id" json:"id" db:"id"`
    Username  string    `yaml:"username" json:"username" db:"username"`
    Email     string    `yaml:"email" json:"email" db:"email"`
    Password  string    `yaml:"-" json:"-" db:"password"`
    Role      string    `yaml:"role" json:"role" db:"role"`
    Status    string    `yaml:"status" json:"status" db:"status"`
    CreatedAt time.Time `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt time.Time `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}

type Role struct {
    ID          string   `yaml:"id" json:"id" db:"id"`
    Name        string   `yaml:"name" json:"name" db:"name"`
    Description string   `yaml:"description" json:"description" db:"description"`
    Permissions []string `yaml:"permissions" json:"permissions" db:"permissions"`
    CreatedAt   time.Time `yaml:"created_at" json:"created_at" db:"created_at"`
}

type Permission struct {
    ID          string `yaml:"id" json:"id" db:"id"`
    Name        string `yaml:"name" json:"name" db:"name"`
    Resource    string `yaml:"resource" json:"resource" db:"resource"`
    Action      string `yaml:"action" json:"action" db:"action"`
    Description string `yaml:"description" json:"description" db:"description"`
}
```

---

### 3.3 会话模型

```go
package model

type Session struct {
    ID        string    `yaml:"id" json:"id" db:"id"`
    UserID    string    `yaml:"user_id" json:"user_id" db:"user_id"`
    Token     string    `yaml:"token" json:"token" db:"token"`
    ExpiresAt time.Time `yaml:"expires_at" json:"expires_at" db:"expires_at"`
    CreatedAt time.Time `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt time.Time `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}
```

---

## 4. 工作流相关模型

### 4.1 工作流模型

```go
package workflow

type Workflow struct {
    ID          string                 `yaml:"id" json:"id" db:"id"`
    Version     string                 `yaml:"version" json:"version" db:"version"`
    Name        string                 `yaml:"name" json:"name" db:"name"`
    Description string                 `yaml:"description" json:"description" db:"description"`
    Steps       []*Step                `yaml:"steps" json:"steps" db:"steps"`
    Context     map[string]interface{} `yaml:"context" json:"context" db:"context"`
    Metadata    map[string]interface{} `yaml:"metadata" json:"metadata" db:"metadata"`
    Status      string                 `yaml:"status" json:"status" db:"status"`
    CreatedBy   string                 `yaml:"created_by" json:"created_by" db:"created_by"`
    CreatedAt   time.Time              `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt   time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}

type Step struct {
    ID        string                 `yaml:"id" json:"id" db:"id"`
    Type      StepType               `yaml:"type" json:"type" db:"type"`
    Name      string                 `yaml:"name" json:"name" db:"name"`
    CLI       string                 `yaml:"cli" json:"cli" db:"cli"`
    Args      []string               `yaml:"args" json:"args" db:"args"`
    Condition string                 `yaml:"condition" json:"condition" db:"condition"`
    Body      []*Step                `yaml:"body" json:"body" db:"body"`
    DependsOn []string               `yaml:"depends_on" json:"depends_on" db:"depends_on"`
    Timeout   int                    `yaml:"timeout" json:"timeout" db:"timeout"`
    Retries   int                    `yaml:"retries" json:"retries" db:"retries"`
    OnError   string                 `yaml:"on_error" json:"on_error" db:"on_error"`
    Metadata  map[string]interface{} `yaml:"metadata" json:"metadata" db:"metadata"`
    Items     []string               `yaml:"items,omitempty" json:"items,omitempty" db:"items"`
    OutputVar string                 `yaml:"outputVar,omitempty" json:"outputVar,omitempty" db:"output_var"`
}

type StepType string

const (
    StepTypeExec      StepType = "exec"
    StepTypeCLI       StepType = "cli"
    StepTypeIf        StepType = "if"
    StepTypeForEach   StepType = "for_each"
    StepTypeParallel  StepType = "parallel"
    StepTypeOpenCLI   StepType = "opencli"
)
```

---

### 4.2 工作流模板模型

```go
package workflow

type WorkflowTemplate struct {
    ID          string                 `yaml:"id" json:"id" db:"id"`
    Name        string                 `yaml:"name" json:"name" db:"name"`
    Description string                 `yaml:"description" json:"description" db:"description"`
    Category    string                 `yaml:"category" json:"category" db:"category"`
    Parameters  []TemplateParameter    `yaml:"parameters" json:"parameters" db:"parameters"`
    Steps       []*Step                `yaml:"steps" json:"steps" db:"steps"`
    CreatedBy   string                 `yaml:"created_by" json:"created_by" db:"created_by"`
    CreatedAt   time.Time              `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt   time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}

type TemplateParameter struct {
    Name        string      `yaml:"name" json:"name" db:"name"`
    Type        string      `yaml:"type" json:"type" db:"type"`
    Description string      `yaml:"description" json:"description" db:"description"`
    Required    bool        `yaml:"required" json:"required" db:"required"`
    Default     interface{} `yaml:"default" json:"default" db:"default"`
}
```

---

### 4.3 工作流版本模型

```go
package workflow

type WorkflowVersion struct {
    ID          string    `yaml:"id" json:"id" db:"id"`
    WorkflowID  string    `yaml:"workflow_id" json:"workflow_id" db:"workflow_id"`
    Version     string    `yaml:"version" json:"version" db:"version"`
    Content     string    `yaml:"content" json:"content" db:"content"`
    ChangeLog   string    `yaml:"change_log" json:"change_log" db:"change_log"`
    CreatedBy   string    `yaml:"created_by" json:"created_by" db:"created_by"`
    CreatedAt   time.Time `yaml:"created_at" json:"created_at" db:"created_at"`
}
```

---

### 4.4 工作流分享模型

```go
package workflow

type WorkflowShare struct {
    ID          string    `yaml:"id" json:"id" db:"id"`
    WorkflowID  string    `yaml:"workflow_id" json:"workflow_id" db:"workflow_id"`
    SharedBy    string    `yaml:"shared_by" json:"shared_by" db:"shared_by"`
    SharedWith  string    `yaml:"shared_with" json:"shared_with" db:"shared_with"`
    Permission  string    `yaml:"permission" json:"permission" db:"permission"`
    ExpiresAt   *time.Time `yaml:"expires_at" json:"expires_at" db:"expires_at"`
    CreatedAt   time.Time `yaml:"created_at" json:"created_at" db:"created_at"`
}
```

---

## 5. 执行相关模型

### 5.1 执行记录模型

```go
package execution

type ExecutionRecord struct {
    ID          string                 `yaml:"id" json:"id" db:"id"`
    WorkflowID  string                 `yaml:"workflow_id" json:"workflow_id" db:"workflow_id"`
    Version     string                 `yaml:"version" json:"version" db:"version"`
    Status      ExecutionStatus        `yaml:"status" json:"status" db:"status"`
    Context     map[string]interface{} `yaml:"context" json:"context" db:"context"`
    Outputs     map[string]interface{} `yaml:"outputs" json:"outputs" db:"outputs"`
    Error       string                 `yaml:"error" json:"error" db:"error"`
    StartedBy   string                 `yaml:"started_by" json:"started_by" db:"started_by"`
    StartedAt   time.Time              `yaml:"started_at" json:"started_at" db:"started_at"`
    CompletedAt *time.Time             `yaml:"completed_at" json:"completed_at" db:"completed_at"`
    Duration    time.Duration          `yaml:"duration" json:"duration" db:"duration"`
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

### 5.2 步骤执行记录模型

```go
package execution

type StepExecution struct {
    ID           string                 `yaml:"id" json:"id" db:"id"`
    ExecutionID  string                 `yaml:"execution_id" json:"execution_id" db:"execution_id"`
    StepID       string                 `yaml:"step_id" json:"step_id" db:"step_id"`
    Status       ExecutionStatus        `yaml:"status" json:"status" db:"status"`
    Input        map[string]interface{} `yaml:"input" json:"input" db:"input"`
    Output       map[string]interface{} `yaml:"output" json:"output" db:"output"`
    Error        string                 `yaml:"error" json:"error" db:"error"`
    RetryCount   int                    `yaml:"retry_count" json:"retry_count" db:"retry_count"`
    StartedAt    time.Time              `yaml:"started_at" json:"started_at" db:"started_at"`
    CompletedAt  *time.Time             `yaml:"completed_at" json:"completed_at" db:"completed_at"`
    Duration     time.Duration          `yaml:"duration" json:"duration" db:"duration"`
}
```

---

### 5.3 任务模型

```go
package task

type Task struct {
    ID        string                 `yaml:"id" json:"id" db:"id"`
    Type      TaskType               `yaml:"type" json:"type" db:"type"`
    Status    TaskStatus             `yaml:"status" json:"status" db:"status"`
    Priority  int                    `yaml:"priority" json:"priority" db:"priority"`
    Input     map[string]interface{} `yaml:"input" json:"input" db:"input"`
    Output    map[string]interface{} `yaml:"output" json:"output" db:"output"`
    Error     string                 `yaml:"error" json:"error" db:"error"`
    CreatedBy string                 `yaml:"created_by" json:"created_by" db:"created_by"`
    CreatedAt time.Time              `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}

type TaskType string

const (
    TaskTypeWorkflow TaskType = "workflow"
    TaskTypeCommand  TaskType = "command"
    TaskTypeNL       TaskType = "nl"
)

type TaskStatus string

const (
    TaskStatusPending   TaskStatus = "pending"
    TaskStatusQueued    TaskStatus = "queued"
    TaskStatusRunning   TaskStatus = "running"
    TaskStatusSuccess   TaskStatus = "success"
    TaskStatusFailed    TaskStatus = "failed"
    TaskStatusCancelled TaskStatus = "cancelled"
)
```

---

## 6. 插件相关模型

### 6.1 插件清单模型

```go
package plugin

type PluginManifest struct {
    ID          string                 `yaml:"id" json:"id" db:"id"`
    Name        string                 `yaml:"name" json:"name" db:"name"`
    Version     string                 `yaml:"version" json:"version" db:"version"`
    Description string                 `yaml:"description" json:"description" db:"description"`
    Author      string                 `yaml:"author" json:"author" db:"author"`
    License     string                 `yaml:"license" json:"license" db:"license"`
    Homepage    string                 `yaml:"homepage" json:"homepage" db:"homepage"`
    Permissions []string               `yaml:"permissions" json:"permissions" db:"permissions"`
    Config      map[string]interface{} `yaml:"config" json:"config" db:"config"`
    Hooks       []string               `yaml:"hooks" json:"hooks" db:"hooks"`
    Commands    []string               `yaml:"commands" json:"commands" db:"commands"`
    CreatedAt   time.Time              `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt   time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}
```

---

### 6.2 插件实例模型

```go
package plugin

type PluginInstance struct {
    ID        string                 `yaml:"id" json:"id" db:"id"`
    Manifest  *PluginManifest        `yaml:"manifest" json:"manifest" db:"manifest"`
    Status    PluginStatus           `yaml:"status" json:"status" db:"status"`
    Config    map[string]interface{} `yaml:"config" json:"config" db:"config"`
    Error     string                 `yaml:"error" json:"error" db:"error"`
    LoadedAt  time.Time              `yaml:"loaded_at" json:"loaded_at" db:"loaded_at"`
    UpdatedAt time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}

type PluginStatus string

const (
    PluginStatusLoaded   PluginStatus = "loaded"
    PluginStatusActive   PluginStatus = "active"
    PluginStatusInactive PluginStatus = "inactive"
    PluginStatusError    PluginStatus = "error"
)
```

---

### 6.3 插件配置模型

```go
package plugin

type PluginConfig struct {
    ID        string                 `yaml:"id" json:"id" db:"id"`
    PluginID  string                 `yaml:"plugin_id" json:"plugin_id" db:"plugin_id"`
    Config    map[string]interface{} `yaml:"config" json:"config" db:"config"`
    UpdatedBy string                 `yaml:"updated_by" json:"updated_by" db:"updated_by"`
    UpdatedAt time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}
```

---

## 7. 监控相关模型

### 7.1 指标模型

```go
package monitor

type Metric struct {
    ID        string                 `yaml:"id" json:"id" db:"id"`
    Name      string                 `yaml:"name" json:"name" db:"name"`
    Value     float64                `yaml:"value" json:"value" db:"value"`
    Unit      string                 `yaml:"unit" json:"unit" db:"unit"`
    Timestamp time.Time              `yaml:"timestamp" json:"timestamp" db:"timestamp"`
    Labels    map[string]string      `yaml:"labels" json:"labels" db:"labels"`
    Metadata  map[string]interface{} `yaml:"metadata" json:"metadata" db:"metadata"`
}

type MetricType string

const (
    MetricTypeCounter   MetricType = "counter"
    MetricTypeGauge     MetricType = "gauge"
    MetricTypeHistogram MetricType = "histogram"
    MetricTypeSummary   MetricType = "summary"
)
```

---

### 7.2 告警规则模型

```go
package monitor

type AlertRule struct {
    ID          string                 `yaml:"id" json:"id" db:"id"`
    Name        string                 `yaml:"name" json:"name" db:"name"`
    Description string                 `yaml:"description" json:"description" db:"description"`
    Condition   string                 `yaml:"condition" json:"condition" db:"condition"`
    Threshold   float64                `yaml:"threshold" json:"threshold" db:"threshold"`
    Severity    AlertSeverity          `yaml:"severity" json:"severity" db:"severity"`
    Duration    time.Duration          `yaml:"duration" json:"duration" db:"duration"`
    Enabled     bool                   `yaml:"enabled" json:"enabled" db:"enabled"`
    Actions     []AlertAction          `yaml:"actions" json:"actions" db:"actions"`
    CreatedBy   string                 `yaml:"created_by" json:"created_by" db:"created_by"`
    CreatedAt   time.Time              `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt   time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}

type AlertSeverity string

const (
    AlertSeverityInfo     AlertSeverity = "info"
    AlertSeverityWarning  AlertSeverity = "warning"
    AlertSeverityCritical AlertSeverity = "critical"
)

type AlertAction struct {
    Type   string                 `yaml:"type" json:"type" db:"type"`
    Config map[string]interface{} `yaml:"config" json:"config" db:"config"`
}
```

---

### 7.3 告警记录模型

```go
package monitor

type Alert struct {
    ID          string                 `yaml:"id" json:"id" db:"id"`
    RuleID      string                 `yaml:"rule_id" json:"rule_id" db:"rule_id"`
    RuleName    string                 `yaml:"rule_name" json:"rule_name" db:"rule_name"`
    Severity    AlertSeverity          `yaml:"severity" json:"severity" db:"severity"`
    Message     string                 `yaml:"message" json:"message" db:"message"`
    Value       float64                `yaml:"value" json:"value" db:"value"`
    Threshold   float64                `yaml:"threshold" json:"threshold" db:"threshold"`
    Resolved    bool                   `yaml:"resolved" json:"resolved" db:"resolved"`
    ResolvedAt  *time.Time             `yaml:"resolved_at" json:"resolved_at" db:"resolved_at"`
    CreatedAt   time.Time              `yaml:"created_at" json:"created_at" db:"created_at"`
    UpdatedAt   time.Time              `yaml:"updated_at" json:"updated_at" db:"updated_at"`
}
```

---

## 8. 安全相关模型

### 8.1 审计日志模型

```go
package audit

type AuditLog struct {
    ID        string                 `yaml:"id" json:"id" db:"id"`
    Event     AuditEventType         `yaml:"event" json:"event" db:"event"`
    Timestamp time.Time              `yaml:"timestamp" json:"timestamp" db:"timestamp"`
    SessionID string                 `yaml:"session_id" json:"session_id" db:"session_id"`
    UserID    string                 `yaml:"user_id" json:"user_id" db:"user_id"`
    IPAddress string                 `yaml:"ip_address" json:"ip_address" db:"ip_address"`
    Module    string                 `yaml:"module" json:"module" db:"module"`
    Action    string                 `yaml:"action" json:"action" db:"action"`
    Input     map[string]interface{} `yaml:"input" json:"input" db:"input"`
    Output    map[string]interface{} `yaml:"output" json:"output" db:"output"`
    Success   bool                   `yaml:"success" json:"success" db:"success"`
    Error     string                 `yaml:"error" json:"error" db:"error"`
    Duration  time.Duration          `yaml:"duration" json:"duration" db:"duration"`
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

### 8.2 权限模型

```go
package security

type Permission struct {
    ID          string `yaml:"id" json:"id" db:"id"`
    Name        string `yaml:"name" json:"name" db:"name"`
    Resource    string `yaml:"resource" json:"resource" db:"resource"`
    Action      string `yaml:"action" json:"action" db:"action"`
    Description string `yaml:"description" json:"description" db:"description"`
}

type Role struct {
    ID          string   `yaml:"id" json:"id" db:"id"`
    Name        string   `yaml:"name" json:"name" db:"name"`
    Description string   `yaml:"description" json:"description" db:"description"`
    Permissions []string `yaml:"permissions" json:"permissions" db:"permissions"`
}

type ACL struct {
    ID         string `yaml:"id" json:"id" db:"id"`
    ResourceID string `yaml:"resource_id" json:"resource_id" db:"resource_id"`
    UserID     string `yaml:"user_id" json:"user_id" db:"user_id"`
    RoleID     string `yaml:"role_id" json:"role_id" db:"role_id"`
    Permission string `yaml:"permission" json:"permission" db:"permission"`
    Granted    bool   `yaml:"granted" json:"granted" db:"granted"`
}
```

---

### 8.3 危险检测模型

```go
package sandbox

type DangerRule struct {
    ID          string       `yaml:"id" json:"id" db:"id"`
    Name        string       `yaml:"name" json:"name" db:"name"`
    Category    DangerCategory `yaml:"category" json:"category" db:"category"`
    Pattern     string       `yaml:"pattern" json:"pattern" db:"pattern"`
    RiskLevel   RiskLevel    `yaml:"risk_level" json:"risk_level" db:"risk_level"`
    Description string       `yaml:"description" json:"description" db:"description"`
    Suggestion  string       `yaml:"suggestion" json:"suggestion" db:"suggestion"`
    Enabled     bool         `yaml:"enabled" json:"enabled" db:"enabled"`
}

type DangerCategory string

const (
    DangerCategorySystem   DangerCategory = "system"
    DangerCategoryFS       DangerCategory = "filesystem"
    DangerCategoryNetwork  DangerCategory = "network"
    DangerCategoryResource DangerCategory = "resource"
)

type RiskLevel string

const (
    RiskSafe     RiskLevel = "safe"
    RiskLow      RiskLevel = "low"
    RiskMedium   RiskLevel = "medium"
    RiskHigh     RiskLevel = "high"
    RiskCritical RiskLevel = "critical"
)

type DangerAnalysis struct {
    RiskLevel   RiskLevel       `yaml:"risk_level" json:"risk_level" db:"risk_level"`
    Category    DangerCategory  `yaml:"category" json:"category" db:"category"`
    Description string           `yaml:"description" json:"description" db:"description"`
    Suggestion  string           `yaml:"suggestion" json:"suggestion" db:"suggestion"`
    MatchedRules []*DangerRule   `yaml:"matched_rules" json:"matched_rules" db:"matched_rules"`
}
```

---

## 9. 数据库设计

### 9.1 表结构

#### users 表

```sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    INDEX idx_username (username),
    INDEX idx_email (email)
);
```

#### workflows 表

```sql
CREATE TABLE workflows (
    id VARCHAR(36) PRIMARY KEY,
    version VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSON NOT NULL,
    context JSON,
    metadata JSON,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_status (status),
    INDEX idx_created_by (created_by)
);
```

#### executions 表

```sql
CREATE TABLE executions (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    version VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    context JSON,
    outputs JSON,
    error TEXT,
    started_by VARCHAR(36) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration BIGINT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id),
    FOREIGN KEY (started_by) REFERENCES users(id),
    INDEX idx_workflow_id (workflow_id),
    INDEX idx_status (status),
    INDEX idx_started_at (started_at)
);
```

#### tasks 表

```sql
CREATE TABLE tasks (
    id VARCHAR(36) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    priority INT NOT NULL,
    input JSON,
    output JSON,
    error TEXT,
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_created_at (created_at)
);
```

#### plugins 表

```sql
CREATE TABLE plugins (
    id VARCHAR(36) PRIMARY KEY,
    manifest JSON NOT NULL,
    status VARCHAR(20) NOT NULL,
    config JSON,
    error TEXT,
    loaded_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    INDEX idx_status (status)
);
```

#### audit_logs 表

```sql
CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    event VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    session_id VARCHAR(36),
    user_id VARCHAR(36),
    ip_address VARCHAR(45),
    module VARCHAR(50),
    action VARCHAR(100),
    input JSON,
    output JSON,
    success BOOLEAN NOT NULL,
    error TEXT,
    duration BIGINT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_event (event),
    INDEX idx_user_id (user_id)
);
```

---

## 10. 存储策略

### 10.1 存储分层

| 数据类型 | 存储方式 | 说明 |
|---------|---------|------|
| **配置数据** | YAML 文件 | 本地配置文件，兼容 `config.yaml` |
| **工作流定义** | YAML/JSON 文件 | 兼容 `workflows/`，可版本控制 |
| **执行记录** | JSON 文件 + 可选 SQLite 索引 | 兼容 `executions/`，服务模式可索引查询 |
| **指标数据** | 时序数据库 | Prometheus |
| **日志数据** | JSONL / 日志系统 | CLI 默认本地文件，服务模式可接 Loki/ELK |
| **审计日志** | JSONL + 可选数据库索引 | 兼容 `logs/audit/*.jsonl`，合规场景可入库 |

### 10.2 备份策略

| 数据类型 | 备份频率 | 保留时间 |
|---------|---------|---------|
| **数据库** | 每日 | 30 天 |
| **配置文件** | 每次变更 | 永久 |
| **工作流文件** | 每次变更 | 永久 |
| **日志数据** | 实时 | 7 天 |
| **审计日志** | 每日 | 365 天 |

---

## 附录：版本历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|---------|------|
| v2.0 | 2026-05-06 | Go 语言版本 | Data Team |
| v2.1 | 2026-05-08 | 补充 1.x 数据目录、模型兼容和 VECTAHUB_HOME 策略 | Data Team |
