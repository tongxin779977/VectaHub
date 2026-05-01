# VectaHub 全局规则

## AI 助手核心原则

### 1. 真实性
- ❌ 严禁过度意淫、编造不存在的功能
- ✅ 基于实际代码和文档提供建议
- ✅ 不确定时直接说明需要更多信息

### 2. 语言规范
- ✅ 所有沟通使用中文
- ✅ 表达简洁、专业、准确

### 3. 工作方式
- ✅ 先查看相关代码和文档再给出建议
- ✅ 遵循项目已有的代码风格和模式
- ✅ 小步迭代，便于测试和审查

---

## 项目简介

VectaHub 是一个自然语言工作流引擎，用自然语言描述任务，自动生成并执行工作流。

| 模块 | 目录 |
|------|------|
| CLI 入口 | `src/cli.ts` |
| 自然语言解析 | `src/nl/` |
| 工作流引擎 | `src/workflow/` |
| 沙盒隔离 | `src/sandbox/` |
| CLI 工具集成 | `src/cli-tools/` |

技术栈：TypeScript + Node.js + npm + Vitest + Commander.js

---

## 代码规范

### 命名
- 文件/变量: `camelCase` / `kebab-case`
- 类/接口: `PascalCase`
- 常量: `UPPER_SNAKE_CASE`

### 代码风格
- 缩进: 2 空格
- 分号: 必须
- 引号: 单引号
- 换行: 100 字符

### 导入顺序
```
内置 → 第三方 → 内部 → 类型
```

---

## 安全红线

- ❌ 禁止硬编码密钥
- ❌ 禁止直接执行用户输入
- ❌ 禁止绕过沙盒
- ❌ 禁止日志输出敏感信息

---

## CLI 命令

```bash
# 核心
vectahub run <intent>       # 自然语言运行
vectahub list                # 列出工作流
vectahub history             # 查看历史

# AI 环境
vectahub ai status           # 查看状态
vectahub ai rescan           # 重新扫描
vectahub ai list             # 列出提供者
vectahub ai test <provider>  # 测试

# 其他
vectahub mode                # 查看/切换模式
vectahub doctor              # 诊断
```

---

## 设计文档索引

详细文档见 `docs/design/` 目录：

| 文档 | 内容 |
|------|------|
| [01_system_architecture.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/01_system_architecture.md) | 系统架构 |
| [02_sandbox_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/02_sandbox_design.md) | 沙盒设计 |
| [03_ai_cli_framework_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/03_ai_cli_framework_design.md) | AI CLI 框架 |
| [04_nl_parser_skill_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/04_nl_parser_skill_design.md) | NL Parser |
| [06_workflow_engine_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/06_workflow_engine_design.md) | 工作流引擎 |
| [07_module_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/07_module_design.md) | 模块化开发 |
| [AI_CLI_环境发现与智能降级设计文档.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/.trae/documents/AI_CLI_环境发现与智能降级设计文档.md) | AI 环境发现 |

---

## Git 提交

```
[模块] 简短描述
```

分支: `feature/cli` / `feature/nl` / `feature/workflow` 等

---

## 测试要求

| 模块 | 覆盖率要求 |
|------|-----------|
| NL Parser | ≥80% |
| Workflow | ≥75% |
| 其他 | ≥70% |

---

```yaml
version: 3.0.0
lastUpdated: 2026-05-02
```
