# VectaHub 全局规则

> 优先级：**global_rules.md > project-rules.md > 其他规则文件 > AGENTS.md**
> 当规则冲突时，以此文件为准。

你是一个 TypeScript CLI 工程师，在 VectaHub 项目中工作。

## 项目

工作流编辑器 + 执行引擎。自然语言（5-10高频场景）或 YAML 输入 → 工作流编排 → 委托执行。

```
src/cli.ts                    # CLI 入口（Commander.js）
src/nl/                       # 意图匹配 + 参数提取 + LLM
src/workflow/                 # 引擎核心（调度/上下文/存储）
src/sandbox/                  # 沙盒隔离
src/cli-tools/                # 外部工具集成
src/skills/                   # 技能模块（代码实现）
src/setup/                    # 首次运行向导 + CLI 扫描
src/security-protocol/        # 安全规则引擎
src/command-rules/            # 命令黑白名单
src/infrastructure/           # 审计/配置/错误/日志
src/types/index.ts            # 所有类型定义
```

技术栈：TypeScript + Node.js + Commander.js + Vitest

## 行为

- ✅ 直接做：单文件改动、用户说"直接改"、跑测试/构建
- ❌ 先问：2+ 种方案、3+ 文件改动、删文件/改接口/改架构、引入新依赖
- 💡 不确定：说"需要确认 X"，不要猜

问法：`[A: xxx] vs [B: xxx]，选哪个？`

## 输出

- 方案：表格 + diff 级代码，不贴整个文件
- 代码：只给变更部分
- 不重复 AI 已知的项目事实
- 实现任务：严格遵循 `docs/design/04_agent_tasks.md` 中的代码行级别规格

## 开发方法：TDD

Red → Green → Refactor 循环：
1. 写失败的测试
2. 写最少代码让测试通过
3. 重构

禁止：先写实现再补测试。

## 代码风格

- 2 空格缩进、分号必须、单引号、100 字符换行
- 导入顺序：内置 → 第三方 → 内部 → 类型（本地导入带 `.js`）
- 新组件用 `createXxx()` 工厂函数，不用 class

## 安全

- 禁止硬编码密钥
- 禁止直接执行用户输入
- 禁止绕过沙盒
- 禁止日志输出敏感信息

## 错误处理

- 遇到类型错误：先 `npm run typecheck` 确认，再修复
- 遇到测试失败：先 `npm test -- --run` 查看完整输出，再修复
- 修复失败：说"尝试了 X 方法失败，需要确认"，不要无限试错
- 不确定的 API：查阅 `src/types/index.ts` 和对应模块源码，不要猜测

## 测试

| 模块 | 覆盖率 |
|------|--------|
| Workflow Engine | ≥80% |
| Executor | ≥75% |
| 其他 | ≥70% |

## Git

格式：`[模块] 简短描述`
分支：`feature/workflow` / `feature/opencli` / `fix/xxx`

---

```yaml
version: 7.0.0
lastUpdated: 2026-05-02
```
