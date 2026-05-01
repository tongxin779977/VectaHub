# VectaHub 全局开发规则

> 精简版，详细规范见对应文档。

---

## 规范索引

| 规范 | 文档 |
|------|------|
| 系统架构 | [01_system_architecture.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/01_system_architecture.md) |
| 沙盒设计 | [02_sandbox_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/02_sandbox_design.md) |
| AI CLI 框架 | [03_ai_cli_framework_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/03_ai_cli_framework_design.md) |
| NL Parser | [04_nl_parser_skill_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/04_nl_parser_skill_design.md) |
| VSCode 插件 | [05_vscode_plugin_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/05_vscode_plugin_design.md) |
| Workflow 引擎 | [06_workflow_engine_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/06_workflow_engine_design.md) |
| 模块设计 | [07_module_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/07_module_design.md) |
| 开发命令 | [08_dev_command_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/08_dev_command_design.md) |

---

## 核心规范

### 命名

- 文件/变量: `camelCase` / `kebab-case`
- 类/接口: `PascalCase`
- 常量: `UPPER_SNAKE_CASE`

### 代码风格

- 缩进: 2 空格 / 分号必须 / 单引号 / 100字符换行

### 导入顺序

```
内置 → 第三方 → 内部 → 类型
```

### 错误码

| 码 | 错误 |
|----|------|
| 1001 | 意图未找到 |
| 1002 | 工作流错误 |
| 1003 | 执行失败 |
| 1004 | 危险命令 |
| 1005 | 超时 |
| 1006 | 存储错误 |

### 日志格式

```
[时间] [级别] [模块] 消息
```

级别: error / warn / info / debug

---

## 安全红线

- ❌ 禁止硬编码密钥
- ❌ 禁止直接执行用户输入
- ❌ 禁止绕过沙盒
- ❌ 禁止日志输出敏感信息

---

## 模块分配

| Agent | 模块 | 文档 |
|-------|------|------|
| A | CLI | [08_dev_command_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/08_dev_command_design.md) |
| B | NL Parser | [04_nl_parser_skill_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/04_nl_parser_skill_design.md) |
| C | Workflow Engine | [06_workflow_engine_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/06_workflow_engine_design.md) |
| D | Executor | [06_workflow_engine_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/06_workflow_engine_design.md) |
| E | Sandbox | [02_sandbox_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/02_sandbox_design.md) |
| F | Storage | [06_workflow_engine_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/06_workflow_engine_design.md) |
| G | Utils | [08_dev_command_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/08_dev_command_design.md) |

---

## Git 提交

```
[模块] 简短描述
```

分支: `feature/cli` / `feature/nl` / `feature/workflow` 等

---

## 测试覆盖率

| 模块 | 要求 |
|------|------|
| NL Parser | ≥80% |
| Workflow | ≥75% |
| 其他 | ≥70% |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
```
