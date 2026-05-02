# VectaHub 全局规则（方案C）

## AI 助手核心原则

### 1. 真实性
- ❌ 严禁过度意淫、编造不存在的功能
- ✅ 基于实际代码和文档提供建议
- ✅ 不确定时直接说明需要更多信息
- ✅ 遵循方案C的定位：工作流编辑器 + 工作流执行引擎

### 2. 语言规范
- ✅ 所有沟通使用中文
- ✅ 表达简洁、专业、准确

### 3. 工作方式
- ✅ 先查看相关代码和文档再给出建议
- ✅ 遵循项目已有的代码风格和模式
- ✅ 小步迭代，便于测试和审查

---

## 项目简介（方案C）

**一句话**：VectaHub 是一个工作流编辑器 + 工作流执行引擎。

- **输入**：自然语言（5-10个高频场景）→ 生成工作流；或直接编辑 YAML/JSON
- **核心**：工作流编排（步骤、条件、循环、并行）
- **执行**：委托给 OpenCLI 或本地命令
- **保障**：审计日志 + 危险命令检查

| 模块 | 目录 |
|------|------|
| CLI 入口 | `src/cli.ts` |
| 简化的 NL | `src/nl/`（只保留 5-10 个高频场景） |
| 工作流引擎 | `src/workflow/`（核心） |
| 沙盒隔离 | `src/sandbox/` |
| CLI 工具集成 | `src/cli-tools/`（简化） |

技术栈：TypeScript + Node.js + npm + Vitest + Commander.js


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

## CLI 命令（方案C）

```bash
# 工作流
vectahub run <intent>            # 简单自然语言（5-10个高频场景）
vectahub run -f <workflow.yaml>  # 从文件运行
vectahub save <name>             # 保存工作流
vectahub list                    # 列出保存的工作流
vectahub history                 # 查看执行历史

# OpenCLI 辅助
vectahub opencli list            # 列出 OpenCLI 可用的网站
vectahub opencli help <site>     # 查看某个网站的帮助

# 执行模式
vectahub mode                    # 查看当前模式
vectahub mode strict/relaxed/consensus

# 其他
vectahub doctor                  # 诊断
vectahub version                 # 版本
```

---

## 设计文档索引

详细文档见 `docs/design/` 目录（只保留核心文档）：

| 文档 | 内容 |
|------|------|
| [01_system_architecture.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/01_system_architecture.md) | 系统架构 |
| [02_sandbox_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/02_sandbox_design.md) | 沙盒设计 |
| [06_workflow_engine_design.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/docs/design/06_workflow_engine_design.md) | 工作流引擎 |

方案文档见 `.trae/documents/`：

| 文档 | 内容 |
|------|------|
| [INTEGRATION_PLAN_C.md](file:///Users/xin.tong/apps/project/test_trae/VectaHub/.trae/documents/INTEGRATION_PLAN_C.md) | 方案C：极简产品业务方案 |

---

## Git 提交

```
[模块] 简短描述
```

分支: `feature/workflow` / `feature/opencli` / `fix/xxx` 等

---

## 测试要求

| 模块 | 覆盖率要求 |
|------|-----------|
| Workflow Engine | ≥80% |
| Executor | ≥75% |
| 其他 | ≥70% |

---

```yaml
version: 4.0.0
lastUpdated: 2026-05-02
mindset: 极简、真实、可预测、不杜撰
```
