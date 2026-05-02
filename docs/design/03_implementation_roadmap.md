# VectaHub 三步实施路线图

> 版本: 6.0.0 | 最后更新: 2026-05-02
> 核心原则：效率优先，用最少代码撬动最大价值差异

---

## 现状总结

VectaHub 是一个**架构设计优秀的半成品**：

| 能力 | 真实状态 |
|------|----------|
| 工作流引擎 | 核心功能完整（拓扑排序/暂停恢复/五种步骤类型） |
| 沙箱安全 | 三层检测有效，macOS sandbox-exec 可用 |
| LLM 客户端 | 完整实现（OpenAI/Anthropic/Ollama），但只在 `generate` 命令中使用 |
| 自然语言理解 | **目前是关键词匹配**，LLM 增强解析器存在但从未调用 |
| CLI 工具 | 4 个工具元数据注册（git/npm/docker/curl） |

**最大的谎言**：宣称"自然语言工作流"，实际是关键词匹配。

**最大的机会**：LLM 客户端已写好，只需接入核心路径，就能从假变真。

---

## 三步实施路径

```
第1步：LLM 接入核心路径
  ↓ 解决"最大的谎言"
  ↓ 改动量：~50 行代码
  ↓
第2步：OpenCLI 编排层
  ↓ 建立差异化定位
  ↓ 改动量：~200 行代码
  ↓
第3步：企业安全场景
  ↓ 构建长期壁垒
  ↓ 改动量：持续迭代
```

---

## 第一步：LLM 接入核心路径

### 目标

让 `vectahub run` 命令真正理解自然语言，而非关键词匹配。

### 需要改动的文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/utils/run.ts` | **核心改动** | 接入 LLM 解析器 |
| `src/nl/parser.ts` | 调整接口 | 支持 LLM 降级逻辑 |
| `src/nl/llm.ts` | 可能微调 | 适配新的调用方式 |
| 测试文件 | 新增 | Mock LLM 响应的测试 |

### 实现逻辑

```
用户输入自然语言
  ↓
检查 LLM 是否可用（API Key 配置）
  ├─ 可用 → 调用 LLM 解析
  │          ↓
  │        LLM 返回结构化任务列表
  │        {
  │          intent: "FIND_FILES",
  │          confidence: 0.95,
  │          params: {...},
  │          workflow: { name: "...", steps: [{ type: "exec", cli: "find", args: [...] }] }
  │        }
  │          ↓
  │        转换为 TaskList 格式
  │          ↓
  │        命令编辑器审查
  │          ↓
  │        生成工作流 → 执行
  │
  └─ 不可用 → 降级为关键词匹配
               ↓
             返回匹配结果（当前逻辑）
```

### 具体改动

核心逻辑在 [run.ts#L49-L69](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/utils/run.ts#L49-L69)，将 `createNLParser()` 替换为 LLM 优先模式：

```typescript
// 当前（假的）
const parser = createNLParser();
const taskListResult = parser.parseToTaskList(text);

// 改完后（真的）
const llmConfig = createLLMConfig();
let taskListResult: ParseResult;

if (llmConfig) {
  const llmParser = createLLMEnhancedParser(llmConfig);
  const llmResult = await llmParser.parse(text);
  if (llmResult.confidence >= 0.7) {
    taskListResult = convertLLMResultToTaskList(llmResult);
  } else {
    taskListResult = createNLParser().parseToTaskList(text);
  }
} else {
  taskListResult = createNLParser().parseToTaskList(text);
}
```

### 预期效果

| 用户输入 | 当前（关键词匹配） | 改完后（LLM 解析） |
|----------|-------------------|-------------------|
| "查找昨天修改的所有 .ts 文件并压缩" | 匹配失败或错误匹配 | 生成 `find . -name "*.ts" -mtime -1` + `zip` |
| "跑测试，通过了就部署" | 匹配 CI_PIPELINE 但命令是 echo | 生成 `npm test` + `if (exitCode == 0) npm run deploy` |

### 风险

| 风险 | 缓解措施 |
|------|----------|
| LLM 返回格式不正确 | LLM 客户端已有 JSON response_format + 重试机制 |
| API 调用慢 | 设置超时，超时降级为关键词匹配 |
| API 费用 | 支持 Ollama 本地模型，零费用 |

---

## 第二步：OpenCLI 编排层

### 目标

让 VectaHub 的工作流可以灵活调用 OpenCLI 的 90+ 网站适配器，建立"VectaHub = 编排，OpenCLI = 执行"的清晰定位。

### 需要做的

1. 扩展 executor.ts 中 opencli 步骤的实现
2. 增加 opencli 工具发现（自动检测安装的 opencli）
3. 扩展意图模板，覆盖更多 opencli 场景
4. 优化 opencli 输出的解析和传递

详见 [AGENT_TASKS.md](./04_agent_tasks.md) 第二步。

---

## 第三步：企业安全场景

### 目标

让 VectaHub 成为 AI Agent 的安全执行引擎，构建长期竞争壁垒。

### 需要做的

1. 定时任务（cron）支持
2. 增强审计日志
3. 权限管理（RBAC）
4. API 接口
5. Web UI 管理面板

详见 [AGENT_TASKS.md](./04_agent_tasks.md) 第三步。

---

## 验收标准

### 第一步完成标志

- [ ] `vectahub run "查找昨天修改的 .ts 文件"` 返回真实 find 命令（不是 echo）
- [ ] 无 LLM 配置时自动降级为关键词匹配，不报错
- [ ] 有相关测试覆盖
- [ ] README 更新，诚实描述能力

### 第二步完成标志

- [ ] 工作流可以调用 opencli 的 3+ 个不同站点
- [ ] opencli 输出可以传递到后续步骤
- [ ] 至少 5 个包含 opencli 的意图模板

### 第三步完成标志

- [ ] 定时任务可以按 cron 表达式执行工作流
- [ ] 审计日志支持查询和导出
- [ ] RBAC 权限管理可用

---

```yaml
version: 6.0.0
lastUpdated: 2026-05-02
status: active_roadmap
mindset: 诚实、务实、不杜撰
```
