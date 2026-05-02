# VectaHub 后续产品开发路线图

> 版本: 1.0.0 | 最后更新: 2026-05-02

---

## 一、当前基线（已完成的功能）

### 核心能力

| 能力 | 完成度 | 说明 |
|------|--------|------|
| 关键词意图匹配 | ✅ 100% | 13 种意图，覆盖 3-5 个高频场景 |
| LLM 客户端 | ✅ 100% | OpenAI/Anthropic/Ollama 三端 |
| LLM 生成 YAML | ✅ 100% | generate 命令已接入 LLM |
| 工作流引擎 | ✅ 95% | exec/if/for_each/parallel 全实现 |
| 沙盒安全 | ✅ 100% | macOS/Linux 沙盒 + 危险命令检测 |
| 工具集成 | ✅ 100% | git/npm/docker/curl 全实现 |
| CLI 命令 | ✅ 100% | 15+ 命令全实现 |
| 安全协议 | ✅ 100% | 17 条规则引擎 |
| 审计系统 | ✅ 100% | 全链路审计日志 |
| 基础设施 | ✅ 100% | 配置/日志/错误处理/首次向导 |

### 主要缺口

| 缺口 | 影响 | 优先级 |
|------|------|--------|
| LLM 未接入 run 命令 | 核心功能"自然语言理解"是假的 | P0 |
| OpenCLI 未真正集成 | 90+ 适配器不可用 | P1 |
| ContextManager 未集成到引擎 | 上下文传递是空壳 | P2 |
| 意图模板覆盖度低 | 关键词匹配效果差 | P2 |

---

## 二、Phase 1：LLM 接入核心路径（最紧迫）

**目标**：让 `vectahub run` 真正理解自然语言

### 改动范围

- `src/utils/run.ts` — 核心改动（约 60 行）
- `src/nl/parser.ts` — 接口调整
- `src/nl/llm.ts` — 无需改动（已可用）

### 实现逻辑

```
用户输入
  ↓
LLM 可用？（通过环境变量判断）
  ├─ 是 → LLM 解析（真正的意图理解）
  │        ↓
  │      返回 LLMResponse
  │        ↓
  │      转换为 Task[] 格式
  │        ↓
  │      置信度 < 0.7？→ 降级为关键词匹配
  │        ↓
  │      执行工作流
  │
  └─ 否 → 关键词匹配降级（现有逻辑）
           ↓
         返回匹配结果
```

### 验收标准

| 测试场景 | 预期行为 |
|----------|----------|
| "查找昨天修改的所有 .ts 文件并压缩" | LLM 生成 find + zip 命令 |
| "跑测试，通过了就部署" | LLM 生成 test + if + deploy 工作流 |
| 无 LLM 配置时 | 自动降级为关键词匹配，不报错 |
| LLM 返回置信度低 | 降级为关键词匹配 |

### 预估工作量

- 改动 1 个文件（run.ts），新增 1 个测试文件
- 约 60 行新代码

---

## 三、Phase 2：OpenCLI 编排层

**目标**：工作流可以调用 OpenCLI 的 90+ 适配器

### 改动范围

- `src/workflow/executor.ts` — 扩展 opencli 步骤执行
- `src/cli-tools/` — 增加 opencli 工具发现
- `src/nl/templates/` — 扩展意图模板

### 核心设计

**opencli 步骤类型**：

```yaml
steps:
  - id: step1
    type: opencli
    site: hackernews
    command: top
    args: ["--limit", "5"]
  - id: step2
    type: exec
    cli: node
    args: ["process step1 output..."]
```

**Executor 扩展**：

```typescript
// executor.ts 新增
case 'opencli': {
  const opencliPath = await detectOpenCLI();
  if (!opencliPath) throw new Error('OpenCLI not found');
  return spawn(opencliPath, [step.site, step.command, ...step.args]);
}
```

### 验收标准

- `detectOpenCLI()` 自动检测系统是否安装 opencli
- opencli 步骤可执行并返回结果
- 工作流输出可在步骤间传递

### 预估工作量

- 改动 2-3 个文件
- 约 150 行新代码

---

## 四、Phase 3：上下文传递集成

**目标**：让 ContextManager 在引擎中真正可用

### 改动范围

- `src/workflow/engine.ts` — 集成 ContextManager
- `src/workflow/executor.ts` — 步骤输出自动存入上下文

### 核心设计

```typescript
// engine.ts execute 方法中
const context = createContextManager();

for (const step of workflow.steps) {
  const result = await this.executeStep(step, context);
  context.setStepOutput(step.id, result);
}
```

**上下文变量传递**：

```yaml
steps:
  - id: find-files
    type: exec
    cli: find
    args: [".", "-name", "*.ts"]
    outputVar: files

  - id: compress
    type: for_each
    items: "${find-files.output}"
    body:
      - type: exec
        cli: zip
        args: ["archive.zip", "${item}"]
```

### 验收标准

- 步骤输出可通过 `${stepId.output}` 语法引用
- for_each 步骤可正确遍历上一步输出
- if 条件可使用上一步输出判断

---

## 五、Phase 4：企业安全场景

**目标**：让 VectaHub 成为 AI Agent 的安全执行引擎

### 4.1 定时任务（cron）

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

### 4.2 增强审计

- 谁（user/role）+ 什么时候 + 执行了什么 + 结果如何
- 审计日志可导出为 JSON/CSV
- 支持按时间范围/用户/工作流筛选

### 4.3 权限管理（RBAC）

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

### 4.4 API 接口

```
POST /api/workflows      # 创建/运行工作流
GET  /api/workflows      # 列出工作流
GET  /api/executions     # 查询执行记录
POST /api/ai-delegate    # 委派给 AI 工具
GET  /api/audit          # 审计日志查询
```

---

## 六、产品差异化分析

### 与 OpenCLI 的差距和定位

| 维度 | OpenCLI | VectaHub |
|------|---------|----------|
| 核心定位 | 网站→CLI 适配器平台 | 本地自然语言工作流引擎 |
| 优势 | 90+ 适配器，生态丰富 | 安全沙盒 + 工作流编排 |
| 劣势 | 无工作流能力，无安全控制 | 生态少，意图模板弱 |

### 差异化定位

**VectaHub = 安全的工作流执行引擎**

```
┌─────────────────────────────────────────────┐
│  OpenCLI:  网站数据 → CLI 命令               │
│  VectaHub: 自然语言 → 安全工作流 → 执行       │
│                                              │
│  关系: VectaHub 编排 OpenCLI 的 90+ 适配器   │
│        OpenCLI 是 VectaHub 的一个"步骤类型"    │
└─────────────────────────────────────────────┘
```

### 三步走完成后的产品形态

| 步骤 | 完成后的能力 | 对标 |
|------|-------------|------|
| 第一步 | 自然语言理解 + 安全执行 | 本地版 OpenClaw |
| 第二步 | 90+ 网站数据适配器 | OpenCLI + 工作流编排 |
| 第三步 | 企业安全 + API + Web UI | 企业级 Agent 执行引擎 |

---

## 七、实施顺序建议

| 阶段 | 内容 | 优先级 | 理由 |
|------|------|--------|------|
| Phase 1 | LLM 接入 run 命令 | P0 | 核心功能"最大的谎言" |
| Phase 2 | OpenCLI 编排层 | P1 | 扩展能力到 90+ 适配器 |
| Phase 3 | 上下文传递集成 | P2 | 完善引擎能力 |
| Phase 4 | 企业安全场景 | P3 | 商业化方向 |
