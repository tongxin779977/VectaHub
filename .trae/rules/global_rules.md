# VectaHub 全局规则

> 优先级：global_rules.md > project-rules.md > 其他规则文件 > AGENTS.md

## 项目

TypeScript CLI 工作流引擎。NL 或 YAML 输入 → 工作流编排 → 委托执行。

## 决策矩阵

| 场景 | 动作 |
|------|------|
| 单文件改动、用户说"直接改"、跑测试/构建 | ✅ 直接做 |
| 2+ 方案、3+ 文件改动、删文件/改接口/改架构、引入新依赖 | ❌ 先问 `[A] vs [B]，选哪个？` |
| 不确定 | 💡 说"需要确认 X" |

## 输出

- 表格 + diff 级代码，不贴整个文件
- 不重复 AI 已知的项目事实
- 实现任务：遵循 `docs/design/04_agent_tasks.md`

## 开发：TDD 强制

Red → Green → Refactor。禁止先写实现再补测试。

## 代码风格

- 2 空格缩进、分号、单引号、100 字符换行
- 导入：内置 → 第三方 → 内部 → 类型（本地 `.js` 后缀）
- 新组件用 `createXxx()` 工厂函数

## 安全红线

❌ 硬编码密钥 / 直接执行用户输入 / 绕过沙盒 / 日志输出敏感信息

## 错误处理

- 类型错误 → `npm run typecheck`
- 测试失败 → `npm test -- --run`
- 修复失败 → 说"尝试了 X 失败，需要确认"
- 不确定 API → 查 `src/types/index.ts`

## 测试覆盖

| 模块 | 覆盖率 |
|------|--------|
| Workflow Engine | ≥80% |
| Executor | ≥75% |
| 其他 | ≥70% |

## Git

`[模块] 简短描述` / `feature/xxx` / `fix/xxx`

---

```yaml
version: 9.0.0
lastUpdated: 2026-05-03
```
