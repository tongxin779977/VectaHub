# VectaHub 2.0 API 接口设计文档

---

## 1. 文档信息

| 属性 | 值 |
|------|-----|
| **文档版本** | v2.0 |
| **创建日期** | 2026-05-06 |
| **最后更新** | 2026-05-08 |
| **状态** | Go 重构接口基线 |
| **作者** | API Team |
| **技术栈** | Go 1.21+ |

---

## 2. API 总览

VectaHub 2.0 API 必须覆盖当前 1.x 已有 CLI 能力，同时为 VS Code 插件、自动化脚本和未来 SDK 提供稳定结构化接口。所有面向机器调用的命令必须支持 `--json`，不得要求调用方解析人类日志。

### 2.1 接口分类

| 分类 | 接口数 | 协议 | 状态 |
|------|--------|------|------|
| **CLI 命令** | 20+ | 命令行 + JSON | 🔄 迁移 1.x |
| **gRPC 服务** | 12+ | gRPC | 🆕 2.0 新增 |
| **REST API** | 10+ | HTTP/REST | 🔄 迁移并扩展 |
| **插件 API** | 6+ | Go 接口 | 🔄 迁移并稳定 |
| **内部模块** | 15+ | Go 接口 | 🔄 Go core |

### 2.2 通用 JSON 响应

所有 `--json` 命令统一返回:

```go
type CLIResponse[T any] struct {
    OK          bool                `json:"ok"`
    Data        T                   `json:"data,omitempty"`
    Error       *APIError           `json:"error,omitempty"`
    Diagnostics []DiagnosticMessage `json:"diagnostics,omitempty"`
    Metadata    ResponseMetadata    `json:"metadata"`
}

type APIError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Details any    `json:"details,omitempty"`
}

type ResponseMetadata struct {
    Version     string `json:"version"`
    Command     string `json:"command"`
    CWD         string `json:"cwd"`
    VectaHubHome string `json:"vectahub_home,omitempty"`
    DurationMS  int64  `json:"duration_ms"`
}
```

---

## 3. CLI 命令接口

### 3.1 命令列表

| 命令 | 描述 | 2.0 要求 |
|------|------|---------|
| `vectahub --version` | 输出版本 | 支持稳定文本输出 |
| `vectahub version --json` | 输出结构化版本 | 🆕 JSON |
| `vectahub run [input]` | 执行自然语言命令 | 保持 1.x 行为 |
| `vectahub run --dry-run [input]` | 零副作用预览 | 必须不安装、不扫描、不执行、不写记录 |
| `vectahub run --json [input]` | 结构化执行结果 | 🆕 JSON |
| `vectahub run -f [file]` | 执行 YAML workflow | 兼容现有 YAML |
| `vectahub doctor` | 环境诊断 | 保持人类输出 |
| `vectahub doctor --json` | 结构化环境诊断 | 🆕 JSON |
| `vectahub tools list/info/search/commands` | 工具管理 | 迁移 git/npm/docker/curl |
| `vectahub tools list --json` | 结构化工具列表 | 🆕 JSON |
| `vectahub security test/list` | 安全检测和规则查看 | 迁移风险等级 |
| `vectahub security test --json [command]` | 结构化安全检测 | 🆕 JSON |
| `vectahub mode [mode]` | 查看/切换执行模式 | strict/relaxed/consensus |
| `vectahub list` | 列出工作流 | 兼容 workflow 存储 |
| `vectahub history` | 查看执行历史 | 兼容 execution record |
| `vectahub history --json` | 结构化执行历史 | 🆕 JSON |
| `vectahub detail [execution]` | 查看执行详情 | 兼容 output refs |
| `vectahub rerun [execution]` | 重跑历史执行 | 保持 1.x 行为 |
| `vectahub resume [execution]` | 从失败点恢复 | 保持 1.x 行为 |
| `vectahub archive` | 归档执行记录 | 保持 1.x 行为 |
| `vectahub templates list/use/save` | 模板管理 | 兼容模板目录 |
| `vectahub schedule` | 调度工作流 | 兼容 schedules 数据 |
| `vectahub serve` | 启动 HTTP/gRPC 服务 | Gin + gRPC |
| `vectahub daemon` | 后台服务管理 | 显式启用 |
| `vectahub debug [workflow]` | 调试工作流 | 迁移断点/单步 |
| `vectahub monitor` | 监控状态 | 迁移 metrics/alerts |
| `vectahub plugins` | 插件管理 | 迁移插件清单 |
| `vectahub export/import` | 数据导入导出 | 保持数据包兼容 |

### 3.2 命令示例

```bash
# 执行自然语言命令
vectahub run "帮我查找所有 .go 文件"

# 零副作用预览
vectahub run --dry-run "查看 git 状态"

# 插件/自动化使用 JSON 输出
vectahub run --dry-run --json "查看 git 状态"
vectahub doctor --json
vectahub tools list --json
vectahub security test --json "git status"

# 启动后台服务
vectahub serve --port 8080 --daemon

# 调试工作流
vectahub debug workflows/my-workflow.yaml

# 列出工作流
vectahub list

# 列出插件
vectahub plugins list --status=active
```

### 3.3 CLI JSON 数据类型

```go
type PreviewResult struct {
    OriginalInput string        `json:"original_input"`
    Intent        string        `json:"intent"`
    Confidence    float64       `json:"confidence"`
    Commands      []CommandPlan `json:"commands"`
    Risk          RiskSummary   `json:"risk"`
    Executed      bool          `json:"executed"` // dry-run 必须为 false
}

type CommandPlan struct {
    StepID string   `json:"step_id"`
    CLI    string   `json:"cli"`
    Args   []string `json:"args"`
}

type DoctorResult struct {
    Checks   []DoctorCheck `json:"checks"`
    Passed   int           `json:"passed"`
    Warnings int           `json:"warnings"`
    Failed   int           `json:"failed"`
}
```

---

## 4. gRPC 服务接口

### 4.1 Proto 定义

```protobuf
syntax = "proto3";

package vectahub.v1;

option go_package = "github.com/vectahub/api/proto/v1;vectahubv1";

// VectaHub 服务
service VectaHubService {
  // 工作流相关
  rpc CreateWorkflow(CreateWorkflowRequest) returns (CreateWorkflowResponse);
  rpc GetWorkflow(GetWorkflowRequest) returns (GetWorkflowResponse);
  rpc ListWorkflows(ListWorkflowsRequest) returns (ListWorkflowsResponse);
  rpc DeleteWorkflow(DeleteWorkflowRequest) returns (DeleteWorkflowResponse);
  rpc ExecuteWorkflow(ExecuteWorkflowRequest) returns (ExecuteWorkflowResponse);
  
  // 任务相关
  rpc GetTask(GetTaskRequest) returns (GetTaskResponse);
  rpc ListTasks(ListTasksRequest) returns (ListTasksResponse);
  rpc CancelTask(CancelTaskRequest) returns (CancelTaskResponse);
  
  // NL 处理相关
  rpc ProcessNL(ProcessNLRequest) returns (ProcessNLResponse);
  
  // 监控相关
  rpc GetMetrics(GetMetricsRequest) returns (GetMetricsResponse);
  rpc StreamMetrics(StreamMetricsRequest) returns (stream Metric);
}

// 工作流相关消息
message Workflow {
  string id = 1;
  string version = 2;
  string name = 3;
  string description = 4;
  repeated Step steps = 5;
  map<string, string> context = 6;
  int64 created_at = 7;
  int64 updated_at = 8;
}

message Step {
  string id = 1;
  string type = 2;
  string cli = 3;
  repeated string args = 4;
  string condition = 5;
  repeated Step body = 6;
  repeated string depends_on = 7;
  int32 timeout = 8;
  int32 retries = 9;
}

message CreateWorkflowRequest {
  Workflow workflow = 1;
}

message CreateWorkflowResponse {
  string workflow_id = 1;
}

message GetWorkflowRequest {
  string workflow_id = 1;
}

message GetWorkflowResponse {
  Workflow workflow = 1;
}

message ListWorkflowsRequest {
  string filter = 1;
  int32 page_size = 2;
  string page_token = 3;
}

message ListWorkflowsResponse {
  repeated Workflow workflows = 1;
  string next_page_token = 2;
}

message DeleteWorkflowRequest {
  string workflow_id = 1;
}

message DeleteWorkflowResponse {
  bool success = 1;
}

message ExecuteWorkflowRequest {
  string workflow_id = 1;
  map<string, string> context = 2;
}

message ExecuteWorkflowResponse {
  string execution_id = 1;
  string status = 2;
  map<string, string> outputs = 3;
}

// 任务相关消息
message Task {
  string id = 1;
  string type = 2;
  string status = 3;
  map<string, string> input = 4;
  map<string, string> output = 5;
  int64 created_at = 6;
  int64 updated_at = 7;
}

message GetTaskRequest {
  string task_id = 1;
}

message GetTaskResponse {
  Task task = 1;
}

message ListTasksRequest {
  string workflow_id = 1;
  string status = 2;
  int32 page_size = 3;
  string page_token = 4;
}

message ListTasksResponse {
  repeated Task tasks = 1;
  string next_page_token = 2;
}

message CancelTaskRequest {
  string task_id = 1;
}

message CancelTaskResponse {
  bool success = 1;
}

// NL 处理相关消息
message ProcessNLRequest {
  string input = 1;
}

message ProcessNLResponse {
  string intent = 1;
  double confidence = 2;
  map<string, string> params = 3;
  string workflow = 4;
}

// 监控相关消息
message Metric {
  string name = 1;
  double value = 2;
  int64 timestamp = 3;
  map<string, string> labels = 4;
}

message GetMetricsRequest {
  string name = 1;
  int64 start_time = 2;
  int64 end_time = 3;
  map<string, string> labels = 4;
}

message GetMetricsResponse {
  repeated Metric metrics = 1;
}

message StreamMetricsRequest {
  string name = 1;
  map<string, string> labels = 2;
}
```

### 4.2 接口实现

```go
package daemon

import (
    "context"
    "google.golang.org/grpc"
    pb "github.com/vectahub/api/proto/v1"
)

type VectaHubServer struct {
    pb.UnimplementedVectaHubServiceServer
    workflowManager *WorkflowManager
    taskManager     *TaskManager
    nlProcessor     *nl.Processor
    monitor         *monitor.Monitor
}

func (s *VectaHubServer) CreateWorkflow(ctx context.Context, req *pb.CreateWorkflowRequest) (*pb.CreateWorkflowResponse, error) {
    workflowID, err := s.workflowManager.Create(req.Workflow)
    if err != nil {
        return nil, err
    }
    return &pb.CreateWorkflowResponse{WorkflowId: workflowID}, nil
}

func (s *VectaHubServer) GetWorkflow(ctx context.Context, req *pb.GetWorkflowRequest) (*pb.GetWorkflowResponse, error) {
    workflow, err := s.workflowManager.Get(req.WorkflowId)
    if err != nil {
        return nil, err
    }
    return &pb.GetWorkflowResponse{Workflow: workflow}, nil
}

func (s *VectaHubServer) ListWorkflows(ctx context.Context, req *pb.ListWorkflowsRequest) (*pb.ListWorkflowsResponse, error) {
    workflows, err := s.workflowManager.List(req.Filter, req.PageSize, req.PageToken)
    if err != nil {
        return nil, err
    }
    return &pb.ListWorkflowsResponse{Workflows: workflows}, nil
}

func (s *VectaHubServer) ExecuteWorkflow(ctx context.Context, req *pb.ExecuteWorkflowRequest) (*pb.ExecuteWorkflowResponse, error) {
    executionID, err := s.workflowManager.Execute(req.WorkflowId, req.Context)
    if err != nil {
        return nil, err
    }
    return &pb.ExecuteWorkflowResponse{ExecutionId: executionID}, nil
}

func (s *VectaHubServer) ProcessNL(ctx context.Context, req *pb.ProcessNLRequest) (*pb.ProcessNLResponse, error) {
    result, err := s.nlProcessor.Process(req.Input)
    if err != nil {
        return nil, err
    }
    return &pb.ProcessNLResponse{
        Intent:     string(result.Intent),
        Confidence: result.Confidence,
        Params:     result.Params,
        Workflow:   result.Workflow,
    }, nil
}
```

---

## 5. REST API 接口

### 5.1 接口列表

| 方法 | 路径 | 描述 |
|------|------|------|
| `POST` | `/api/v1/workflows` | 创建工作流 |
| `GET` | `/api/v1/workflows/{id}` | 获取工作流详情 |
| `GET` | `/api/v1/workflows` | 列出工作流 |
| `DELETE` | `/api/v1/workflows/{id}` | 删除工作流 |
| `POST` | `/api/v1/workflows/{id}/execute` | 执行工作流 |
| `GET` | `/api/v1/tasks/{id}` | 获取任务详情 |
| `GET` | `/api/v1/tasks` | 列出任务 |
| `POST` | `/api/v1/nl/process` | 处理自然语言 |
| `GET` | `/api/v1/metrics` | 获取指标 |
| `GET` | `/health` | 健康检查 |

### 5.2 接口定义

```go
package api

import (
    "github.com/gin-gonic/gin"
)

func SetupRoutes(router *gin.Engine, server *daemon.VectaHubServer) {
    v1 := router.Group("/api/v1")
    {
        // 工作流相关
        v1.POST("/workflows", server.CreateWorkflowHandler)
        v1.GET("/workflows/:id", server.GetWorkflowHandler)
        v1.GET("/workflows", server.ListWorkflowsHandler)
        v1.DELETE("/workflows/:id", server.DeleteWorkflowHandler)
        v1.POST("/workflows/:id/execute", server.ExecuteWorkflowHandler)
        
        // 任务相关
        v1.GET("/tasks/:id", server.GetTaskHandler)
        v1.GET("/tasks", server.ListTasksHandler)
        
        // NL 处理相关
        v1.POST("/nl/process", server.ProcessNLHandler)
        
        // 监控相关
        v1.GET("/metrics", server.GetMetricsHandler)
    }
    
    // 健康检查
    router.GET("/health", server.HealthCheckHandler)
}

// CreateWorkflowHandler 创建工作流
func (s *VectaHubServer) CreateWorkflowHandler(c *gin.Context) {
    var req pb.CreateWorkflowRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    resp, err := s.CreateWorkflow(c, &req)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(200, resp)
}

// GetWorkflowHandler 获取工作流详情
func (s *VectaHubServer) GetWorkflowHandler(c *gin.Context) {
    req := &pb.GetWorkflowRequest{
        WorkflowId: c.Param("id"),
    }
    
    resp, err := s.GetWorkflow(c, req)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(200, resp)
}

// ExecuteWorkflowHandler 执行工作流
func (s *VectaHubServer) ExecuteWorkflowHandler(c *gin.Context) {
    req := &pb.ExecuteWorkflowRequest{
        WorkflowId: c.Param("id"),
    }
    
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    resp, err := s.ExecuteWorkflow(c, req)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(200, resp)
}

// ProcessNLHandler 处理自然语言
func (s *VectaHubServer) ProcessNLHandler(c *gin.Context) {
    var req pb.ProcessNLRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    resp, err := s.ProcessNL(c, &req)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(200, resp)
}

// HealthCheckHandler 健康检查
func (s *VectaHubServer) HealthCheckHandler(c *gin.Context) {
    c.JSON(200, gin.H{
        "status": "healthy",
        "version": "2.0.0",
    })
}
```

---

## 6. 插件 API

### 6.1 插件接口定义

```go
package plugin

import (
    "context"
    "go.uber.org/zap"
)

// Plugin 插件接口
type Plugin interface {
    // ID 返回插件唯一标识
    ID() string
    
    // Name 返回插件名称
    Name() string
    
    // Version 返回插件版本
    Version() string
    
    // Init 初始化插件
    Init(ctx *PluginContext) error
    
    // Activate 激活插件
    Activate() error
    
    // Deactivate 停用插件
    Deactivate() error
}

// PluginContext 插件上下文
type PluginContext struct {
    Config   map[string]interface{}
    Logger   *zap.Logger
    Sandbox  SandboxManager
    Workflow Executor
    Monitor  Monitor
}

// PluginHook 插件钩子
type PluginHook interface {
    // BeforeExecute 执行前钩子
    BeforeExecute(ctx context.Context, step *Step) error
    
    // AfterExecute 执行后钩子
    AfterExecute(ctx context.Context, step *Step, result *ExecuteResult) error
    
    // OnError 错误钩子
    OnError(ctx context.Context, step *Step, err error) error
}

// PluginCommand 插件命令
type PluginCommand interface {
    // Name 返回命令名称
    Name() string
    
    // Description 返回命令描述
    Description() string
    
    // Execute 执行命令
    Execute(ctx context.Context, args []string) (string, error)
}

// PluginManifest 插件清单
type PluginManifest struct {
    ID          string            `yaml:"id"`
    Name        string            `yaml:"name"`
    Version     string            `yaml:"version"`
    Description string            `yaml:"description"`
    Author      string            `yaml:"author"`
    Permissions []string          `yaml:"permissions"`
    Config      map[string]interface{} `yaml:"config"`
    Hooks       []string          `yaml:"hooks"`
    Commands    []string          `yaml:"commands"`
}
```

### 6.2 插件管理器接口

```go
package plugin

import (
    "context"
)

// PluginManager 插件管理器接口
type PluginManager interface {
    // Load 加载插件
    Load(path string) (Plugin, error)
    
    // Unload 卸载插件
    Unload(pluginID string) error
    
    // GetPlugin 获取插件
    GetPlugin(pluginID string) (Plugin, error)
    
    // ListPlugins 列出所有插件
    ListPlugins() []Plugin
    
    // ActivatePlugin 激活插件
    ActivatePlugin(pluginID string) error
    
    // DeactivatePlugin 停用插件
    DeactivatePlugin(pluginID string) error
    
    // RegisterHook 注册钩子
    RegisterHook(hook PluginHook) error
    
    // UnregisterHook 注销钩子
    UnregisterHook(hookID string) error
    
    // RegisterCommand 注册命令
    RegisterCommand(cmd PluginCommand) error
    
    // UnregisterCommand 注销命令
    UnregisterCommand(cmdName string) error
}

// PluginLoader 插件加载器接口
type PluginLoader interface {
    // LoadFromFile 从文件加载插件
    LoadFromFile(path string) (Plugin, error)
    
    // LoadFromDir 从目录加载插件
    LoadFromDir(dir string) ([]Plugin, error)
    
    // Validate 验证插件
    Validate(plugin Plugin) error
}
```

---

## 7. 内部模块接口

### 7.1 NL 处理接口

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

type CommandSynthesizer interface {
    Synthesize(intent IntentName, params map[string]interface{}) (string, error)
    RegisterTemplate(intent IntentName, template string) error
}
```

### 7.2 工作流接口

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

type Validator interface {
    Validate(wf *Workflow) error
    ValidateStep(step *Step) error
}
```

### 7.3 沙箱接口

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
    GetContainerStatus(containerID string) (*ContainerStatus, error)
}

type DangerDetector interface {
    Detect(command string) (*DangerAnalysis, error)
    RegisterRule(rule *DangerRule) error
    GetRules() []*DangerRule
}
```

### 7.4 调试器接口

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

type WatchManager interface {
    AddWatch(expression string) (string, error)
    RemoveWatch(watchID string) error
    GetWatches() []*WatchExpression
    EvaluateWatches(variables map[string]interface{}) error
}

type StateManager interface {
    GetState() (*ExecutionState, error)
    SetState(state *ExecutionState) error
    GetHistory() ([]*ExecutionState, error)
}
```

### 7.5 监控接口

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
    GetAlerts() []*Alert
}

type Tracer interface {
    StartSpan(name string) Span
    InjectContext(ctx context.Context, carrier interface{}) error
    ExtractContext(ctx context.Context, carrier interface{}) (context.Context, error)
}
```

---

## 8. 错误处理

### 8.1 错误码定义

```go
package errors

const (
    // 通用错误码 (1000-1999)
    ErrCodeUnknown          = 1000
    ErrCodeInvalidRequest   = 1001
    ErrCodeUnauthorized     = 1002
    ErrCodeForbidden        = 1003
    ErrCodeNotFound        = 1004
    ErrCodeConflict        = 1005
    ErrCodeInternalError    = 1006
    
    // 工作流错误码 (2000-2999)
    ErrCodeWorkflowNotFound    = 2000
    ErrCodeWorkflowInvalid     = 2001
    ErrCodeWorkflowExecution   = 2002
    
    // 任务错误码 (3000-3999)
    ErrCodeTaskNotFound        = 3000
    ErrCodeTaskExecution       = 3001
    
    // NL 处理错误码 (4000-4999)
    ErrCodeNLProcessing        = 4000
    ErrCodeIntentNotFound      = 4001
    ErrCodeParamExtraction     = 4002
    
    // 沙箱错误码 (5000-5999)
    ErrCodeSandboxExecution    = 5000
    ErrCodeContainerCreation   = 5001
    ErrCodeResourceLimit       = 5002
    
    // 插件错误码 (6000-6999)
    ErrCodePluginNotFound      = 6000
    ErrCodePluginLoad          = 6001
    ErrCodePluginExecution     = 6002
)

// VectaHubError VectaHub 错误
type VectaHubError struct {
    Code    int
    Message string
    Details map[string]interface{}
}

func (e *VectaHubError) Error() string {
    return e.Message
}

// NewError 创建错误
func NewError(code int, message string, details map[string]interface{}) *VectaHubError {
    return &VectaHubError{
        Code:    code,
        Message: message,
        Details: details,
    }
}
```

---

## 9. 版本控制

### 9.1 API 版本策略

| 版本 | 状态 | 说明 |
|------|------|------|
| **v1** | 兼容基线 | TypeScript 1.x 已实现能力和数据格式 |
| **v2** | 设计中 | Go 版本，兼容 v1 核心行为并新增 JSON/gRPC 协议 |

### 9.2 版本兼容性

- gRPC 服务通过包名区分版本：`vectahub.v2`
- REST API 通过路径区分版本：`/api/v2/`
- 向后兼容：v2 API 兼容 v1 的核心 CLI 行为、workflow 文件、execution record 和 audit log。
- CLI JSON 协议从 v2 开始稳定，v1 人类日志不作为机器接口。

---

## 附录：版本历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|---------|------|
| v2.0 | 2026-05-06 | Go 语言版本 | API Team |
| v2.1 | 2026-05-08 | 补充 1.x CLI 能力迁移、通用 JSON 响应和接口兼容策略 | API Team |
