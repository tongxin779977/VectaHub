# VectaHub 1.1 快速开始

> 适用版本: 1.1.1
> 运行要求: Node.js 21+

VectaHub 是一个用于生成和执行开发任务的本地命令行工具。它支持通过自然语言或 YAML 文件定义任务流程。

## 基础功能
- 自然语言转换为本地执行指令。
- 执行 YAML/JSON 格式的工作流。
- 命令安全扫描与执行预览。
- 执行记录与审计日志管理。
- 环境变量隔离（支持 `VECTAHUB_HOME`）。

## 安装与环境检查

若已安装 CLI 工具：

```bash
vectahub version
vectahub doctor
```

若在源码仓库内：

```bash
npm install
npm run build
node dist/cli.js version
node dist/cli.js doctor
```

## 执行第一个任务

建议先使用 `--dry-run` 预览生成的命令：

```bash
vectahub run --dry-run "查看 Git 状态"
```

确认无误后实际执行：

```bash
vectahub run "查看 Git 状态"
```

若需直接运行命令而无需确认，可使用：

```bash
vectahub run -y --no-edit "查看 Git 状态"
```

## 使用 YAML 定义流程

创建 `tasks.yaml`：

```yaml
name: my-tasks
mode: relaxed
steps:
  - id: step_1
    type: exec
    cli: git
    args: ["status"]
  - id: step_2
    type: exec
    cli: npm
    args: ["test"]
```

运行文件：

```bash
vectahub run -f tasks.yaml
```

## 执行模式 (Execution Modes)

| 模式 | 说明 |
|------|------|
| `strict` | 严格模式，拦截所有潜在风险操作。 |
| `relaxed` | 宽松模式，允许常规开发操作，仅拦截已知高危指令。 |
| `consensus` | 协商模式，对关键操作要求用户手动确认。 |

切换全局模式：

```bash
vectahub mode strict
```

## 初始化与配置

初次使用或需重新扫描环境时：

```bash
vectahub setup
```

查看当前配置：

```bash
vectahub config show
```

## 核心架构

VectaHub 采用分层架构：

| 层级 | 职责 |
|------|------|
| **交互层** | 处理自然语言/YAML 输入，提供命令编辑与预览 |
| **引擎层** | 步骤编排、上下文管理、DryRun 预览、执行记录持久化 |
| **执行层** | 安全协议检查、正则检测、沙箱隔离、审计日志 |

核心组件：NL Parser、Workflow Engine、Executor、Sandbox、LLM Client、Storage。

## 安全机制

1. **规则引擎**: 检查黑白名单配置
2. **安全协议**: 匹配预定义的安全性规则
3. **危险检测**: ShellTokenizer 分解复合命令并正则扫描

执行模式：
- `strict`: 阻断所有潜在风险命令
- `relaxed`: 允许常规操作，阻断已知高危操作
- `consensus`: 关键操作需人工确认

---
**相关链接**:
- [CLI 命令参考](./cli-commands.md)
