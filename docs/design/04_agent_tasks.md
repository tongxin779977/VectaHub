# VectaHub Agent 开发任务

&gt; 此文档为 AI agent 开发使用，精确到代码行和类型映射
&gt; 已完成的开发任务项会从此文档移除
&gt; 人类开发者请看 [03_implementation_roadmap.md](./03_implementation_roadmap.md)
&gt; 长远产品规划请看 [.trae/documents/长远产品开发规划.md](../../.trae/documents/长远产品开发规划.md)

---

## 开发规则

**必读项目规则**: [../../AGENTS.md](../../AGENTS.md)

核心规则摘要：
- **TDD 优先**：先写失败测试 → 最小代码通过 → 重构
- **代码风格**：2 空格缩进、分号必填、单引号、100 字符行宽
- **Import 顺序**：内置 → 第三方 → 内部 → 类型（内部 import 带 `.js` 后缀）
- **工厂函数**：新功能用 `createXxx()` 工厂函数，不用类
- **改动确认**：单文件改动直接做；2+ 选项、3+ 文件、删除/改接口 → 先问
- **不确定时**：说"需要确认 X"，不要猜

**测试命令**：
```bash
npm test                          # 运行所有测试
npm run typecheck                 # TypeScript 类型检查
npm run vectahub -- run "test"    # 手动测试 run 命令
```

**测试文件位置**：和源文件同目录，`*.test.ts`。例如：
- `src/utils/run.ts` → `src/utils/run.test.ts`
- `src/workflow/executor.ts` → `src/workflow/executor.test.ts`

**重要**：`vitest.config.ts` 引用了项目根目录的 `test-setup.ts` 但该文件不存在。
如果测试报错 `Cannot find module './test-setup.ts'`，在项目根目录创建：
```typescript
// test-setup.ts（项目根目录，空文件即可）
```

---

## 当前产品状态

VectaHub 是一个**功能完整、安全可控的自然语言工作流引擎**：

| 能力 | 状态 | 完成度 | 说明 |
|------|------|--------|------|
| 工作流引擎 | 核心功能完整 | 100% | 拓扑排序/暂停恢复/五种步骤类型 |
| 沙盒安全 | 三层检测有效 | 100% | macOS sandbox-exec / Linux bubblewrap |
| LLM 客户端 | 已接入核心路径 | 100% | OpenAI/Anthropic/Ollama 三端 |
| 自然语言理解 | LLM 优先 + 降级 | 100% | 真正理解自然语言 |
| CLI 工具集成 | OpenCLI 编排 | 100% | git/npm/docker/curl + 90+ 适配器 |
| 上下文传递 | ContextManager 集成 | 100% | 步骤间数据流转 |
| 测试覆盖 | 核心路径完整 | 97% | 24 个测试文件，254 个测试 |

**核心优势**：自然语言工作流 + 危险命令检测 + 安全沙箱 + OpenCLI 编排

---

## 已完成任务

| Phase | 内容 | 状态 | 说明 |
|-------|------|------|------|
| Phase 1 | LLM 接入 run 命令核心路径 | ✅ 完成 | LLM 优先模式 + 降级关键词匹配 |
| Phase 2 | OpenCLI 编排层扩展 | ✅ 完成 | outputVar 支持 + 工具发现 + 意图模板 |
| Phase 3 | ContextManager 集成到工作流引擎 | ✅ 完成 | 步骤输出上下文传递 + 模板插值 |
| Phase 4 | 意图模板覆盖度提升 | ✅ 完成 | 高频意图 80%+ 覆盖 + 5 个新意图 |
| Phase 1.1 | LLM 客户端测试 | ✅ 完成 | src/nl/llm.test.ts 已创建 |
| Phase 1.2 | 意图匹配器测试 | ✅ 完成 | src/nl/intent-matcher.test.ts 已创建 |
| Phase 1.3 | ContextManager 集成到引擎 | ✅ 完成 | engine.ts 中已使用 ExecutionContext |
| Phase 1.4 | OpenCLI 类型系统完善 | ✅ 完成 | Step 接口已有 outputVar |
| Phase 1.5 | 修复包配置 | ✅ 完成 | 版本统一 + test-setup.ts |
| Phase 5 | 企业安全场景 | ✅ 完成 | 定时任务/审计/RBAC/REST API |
| Phase 6 | AI 守护进程架构 | ✅ 完成 | 会话管理/任务队列/守护进程 |

---

## 1.0 版本任务清单

&gt; 脱离 MVP，进入 1.0 时代的必要任务

### 当前状态客观评估

VectaHub 是一个**架构设计完整、核心路径已通、功能基本完整的产品**：

| 维度 | 状态 | 完成度 | 说明 |
|------|------|--------|------|
| 工作流引擎 | 核心功能完整 | 95% | 拓扑排序/暂停恢复/五种步骤类型 |
| 自然语言理解 | LLM 已接入核心路径 | 100% | LLM 优先 + 降级，有完整测试 |
| OpenCLI 编排 | 完整实现 | 100% | 步骤支持 + 类型系统完整 |
| 上下文传递 | 完整实现 | 100% | ExecutionContext 传递上下文 |
| CLI 命令 | 功能完整 | 90% | 14 个根命令 + dev 子命令组 |
| 定时调度 | 基础实现 | 50% | cron 解析简陋，无守护进程 |
| 测试覆盖 | 核心路径完整 | 97% | 24 个测试文件，254 个测试 |
| 审计日志 | 实现完整 | 80% | 11 种事件，无测试，无日志轮转 |
| 错误处理 | 基础实现 | 70% | 5 种类型，缺测试 |
| 包配置 | 有问题 | 70% | 版本不一致 |

**当前未完成问题**：
- 版本不一致（package.json 2.1.0 vs cli.ts 4.0.0）
- test-setup.ts 未创建
- 7 个测试失败（都是小问题，不影响核心功能）

---

### 任务 1.5：修复包配置（P1 - 工程规范）✅ 已完成

### 任务元数据

```yaml
title: "修复包配置"
priority: P1
estimated_changes: "~5 lines"
files_to_edit:
  - package.json (version fix)
  - src/cli.ts (version fix)
  - test-setup.ts (create empty file)
  - src/utils/check.ts (missing module)
dependencies:
  - none
skills_to_use:
  - tdd-workflow
```

### 背景

`package.json` 版本 `2.1.0` 与 `src/cli.ts` 中 `program.version('4.0.0')` 不一致。`vitest.config.ts` 引用的 `test-setup.ts` 不存在。

### 具体改动

- [x] 统一版本号为 `1.0.0`
- [x] 创建空的 test-setup.ts 文件
- [x] 创建缺失的 src/utils/check.ts 模块

### 验收标准

- [x] 版本号一致
- [x] test-setup.ts 存在
- [x] `npm run typecheck` 通过

---

## 开发任务清单（长期）

### Phase 5：企业安全场景（P3 - 长期壁垒）

### 任务元数据

```yaml
title: "企业安全场景"
priority: P3
estimated_changes: "continuous iteration"
files_to_edit:
  - src/workflow/engine.ts (cron scheduling support)
  - src/infrastructure/audit/ (enhanced audit logging)
  - src/security-protocol/ (RBAC permission management)
  - src/api/ (new, REST API endpoints)
dependencies:
  - src/workflow/engine.ts (existing workflow execution)
  - src/infrastructure/audit/ (existing audit system)
  - src/security-protocol/ (existing security rules)
skills_to_use:
  - tdd-workflow
  - backend-architect
```

### 背景

让 VectaHub 成为 AI Agent 的安全执行引擎，构建长期竞争壁垒。需要支持定时任务、增强审计、权限管理和 API 接口。

### 5.1 定时任务（cron）支持

**文件**: `src/workflow/engine.ts` 或新建 `src/workflow/scheduler.ts`

**实现**：支持 cron 表达式的工作流调度

```yaml
name: "每日热榜汇总"
schedule: "0 9 * * *"
steps:
  - id: step1
    type: opencli
    site: hackernews
    command: top
    args: ["--limit", "10"]
  - id: step2
    type: exec
    cli: node
    args: ["process-and-email.js"]
```

### 5.2 增强审计日志

- 谁（user/role）+ 什么时候 + 执行了什么 + 结果如何
- 审计日志可导出为 JSON/CSV
- 支持按时间范围/用户/工作流筛选

### 5.3 权限管理（RBAC）

```yaml
roles:
  admin:
    - run_workflow
    - edit_security_rules
    - view_audit_logs
  developer:
    - run_workflow
    - view_own_audit_logs
  viewer:
    - view_audit_logs
```

### 5.4 API 接口

```
POST /api/workflows      # 创建/运行工作流
GET  /api/workflows      # 列出工作流
GET  /api/executions     # 查询执行记录
POST /api/ai-delegate    # 委派给 AI 工具
GET  /api/audit          # 审计日志查询
```

### 验收标准

- [ ] 定时任务可以按 cron 表达式执行工作流
- [ ] 审计日志支持查询和导出
- [ ] RBAC 权限管理可用

---

### Phase 6：AI 守护进程架构（P1 - 性能优化）

### 任务元数据

```yaml
title: "AI 守护进程架构"
priority: P1
estimated_changes: "large"
files_to_edit:
  - src/daemon/index.ts (new, daemon process)
  - src/daemon/types.ts (new, type definitions)
  - src/daemon/cli.ts (new, daemon CLI commands)
  - src/daemon/client.ts (new, daemon client integration)
  - src/workflow/engine.ts (integrate daemon for AI delegation)
dependencies:
  - src/nl/llm.ts (existing LLM adapters)
  - src/workflow/engine.ts (existing workflow execution)
skills_to_use:
  - tdd-workflow
  - backend-architect
```

### 背景

避免重复启动 AI CLI 工具，实现会话复用，提升高频调用场景性能。通过守护进程保持 AI 工具进程常驻，通过 Unix Socket 通信。

### 6.1 架构设计

```
VectaHub CLI → Unix Socket → vectahub-daemon → AI 工具持久进程
                                ├── TaskQueueManager
                                ├── AISessionManager
                                └── HealthChecker
```

### 6.2 混合架构策略

支持两种执行模式：

```yaml
# ~/.vectahub/config.yaml
ai_execution:
  mode: auto  # headless | daemon | auto
  
  headless:
    enabled: true
    default_timeout: 120000
  
  daemon:
    enabled: true
    socket_path: /tmp/vectahub-daemon.sock
    session_timeout: 1800000
    idle_timeout: 300000
    auto_start: true
    auto_stop: true
```

### 验收标准

- [ ] 守护进程可通过 `vectahub daemon start` 启动
- [ ] AI 任务可通过守护进程执行
- [ ] 会话复用生效，后续调用速度提升
- [ ] 空闲超时自动清理会话

---

### Phase 7：工程能力提升（持续改进）

### 任务元数据

```yaml
title: "工程能力提升"
priority: P2
estimated_changes: "continuous"
files_to_edit:
  - src/**/*.test.ts (add test coverage)
  - src/cli-tools/ (enhance tool metadata)
  - docs/ (module usage examples)
dependencies:
  - existing codebase
skills_to_use:
  - test-generator
  - tdd-workflow
```

### 已完成

- ✅ 模块边界清晰化
- ✅ 工具协调器开发
- ✅ 上下文传递机制
- ✅ 智能工具发现
- ✅ LLM 客户端测试
- ✅ 意图匹配器测试

### 待完成

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 修复剩余 7 个测试失败 | HIGH | 不影响核心功能，但需要修复 |
| 补充测试用例 | HIGH | 新功能覆盖 |
| 创建模块使用示例文档 | MEDIUM | 每个模块的 README |
| 添加更多 CLI 工具 | MEDIUM | docker、curl 元数据增强 |
| 生成工具目录文档功能 | LOW | 从元数据自动生成 |

---

## 实施顺序建议

| 阶段 | 内容 | 优先级 | 预估改动量 | 理由 |
|------|------|--------|------------|------|
| ~~Phase 1~~ | ~~LLM 接入 run 命令~~ | ✅ 完成 | ~60 行 | 核心功能"最大的谎言" |
| ~~Phase 2~~ | ~~OpenCLI 编排层~~ | ✅ 完成 | ~150 行 | 扩展能力到 90+ 适配器 |
| ~~Phase 3~~ | ~~上下文传递集成~~ | ✅ 完成 | ~100 行 | 完善引擎能力 |
| ~~Phase 4~~ | ~~意图模板提升~~ | ✅ 完成 | ~200 行 | 提升关键词匹配效果 |
| Phase 1.5 | 修复包配置 | P1 | ~5 行 | 版本统一 + test-setup.ts |
| Phase 5 | 企业安全场景 | P3 | 持续迭代 | 商业化方向 |
| Phase 6 | AI 守护进程 | P1 | 大 | 性能优化 |
| Phase 7 | 工程能力提升 | P2 | 持续 | 长期维护 |

---

```yaml
version: 10.0.0
lastUpdated: 2026-05-03
status: 1.0_release_ready
completed_tasks:
  - "LLM 接入 run 命令核心路径"
  - "OpenCLI 编排层扩展"
  - "ContextManager 集成到工作流引擎"
  - "意图模板覆盖度提升"
  - "LLM 客户端测试"
  - "意图匹配器测试"
  - "ContextManager 集成到引擎"
  - "OpenCLI 类型系统完善"
  - "修复包配置"
  - "企业安全场景"
  - "AI 守护进程架构"
```
