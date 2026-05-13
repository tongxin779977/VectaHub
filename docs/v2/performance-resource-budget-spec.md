# Performance & Resource Budget Spec (P5)

## 1. 用户目标和禁止事项

目标：确保执行系统在处理大规模文档（>1MB）和高频批量任务（>100 tasks）时，响应时间、内存占用和磁盘 IO 保持在严格的预算范围内。

禁止事项：
- 不允许在 UI 线程进行同步的大规模计算（如解析大文档）。
- **静态定义红线 (Static Definition Only)**：禁止在模块顶级作用域执行任何具备副作用的函数调用（如 `setupGlobalSignals()`、`getVersion()`、`initAuditLogger()`）。顶级作用域仅允许 `import` 语句、简单常量定义（不含函数返回值赋值）和类/函数的声明。所有初始化逻辑必须移入命令 Action 或异步初始化钩子内。
- **禁止在 ESM 环境下使用 `require`**。
- 不允许为每个子任务重复全量扫描同一份大文档。
- 不允许在内存中常驻未截断的完整输出或日志。
- 不允许高频重复重写同一个状态文件导致 IO 瓶颈。

## 2. 当前链路事实

当前性能痛点（基于 P2/P3 观测）：
- **重复 IO**：插件批量预检和 CLI `run-task` 执行时，会对同一份文档进行多次读取和片段提取。
- **写入竞争**：并发任务同时更新 `latest.json`，虽有临时文件重命名，但频繁 IO 依然存在。
- **内存压力**：批量任务执行时，插件端维护的任务状态对象包含了一些不必要的冗余信息。
- **冷启动开销**：CLI 加载了过多非必要的模块，导致简单命令的冷启动时间接近 500ms。

## 3. 根因分析
- 缺乏**文档索引复用**机制：文档解析结果没有在任务间有效共享。
- 缺乏**批量写入合并 (Batch Flush)**：每个状态变更都立即触发磁盘写。
- 缺乏**按需加载 (Lazy Load)**：CLI 命令和插件模块的导入路径过重。

## 4. In Scope / Out of Scope

In Scope:
- 实现插件端 `DocTaskDocIndex`：一次扫描文档，生成 Heading 和 TaskID 偏移索引，供批量任务复用。
- 实现 `DocTaskRunStore` 的写入合并机制：在批量执行期间，`latest.json` 的更新改为定时或计数合并写入。
- 优化 CLI 启动链路：通过动态 `import()` 延迟加载厚重模块（如安全规则库、LLM 客户端）。
- 实现大输出流式截断：在进入 JSON 序列化前，严格检查并截断 `stdout/stderr` 摘要。

Out of Scope:
- 不对现有的 `parse-doc` 算法进行重大的复杂度重写。
- 不引入分布式缓存或 Redis。

## 5. 数据合同

### 5.1 文档索引结构
```ts
export interface DocHeadingIndex {
  id: string;
  label: string;
  level: number;
  startIndex: number;
  endIndex: number;
}
```

### 5.2 性能预算 (Hard Gates)
| 测量项 | 目标预算 (Budget) |
|--------|-----------------|
| CLI 冷启动 (version/doctor) | < 250ms |
| 100 个任务的索引提取 | < 50ms |
| 10MB 文档片段截取 | < 100ms |
| 插件内存增量 (100 任务) | < 20MB |
| 状态落盘 IO 频率 | < 2次/秒 (批量期间) |

## 6. 生命周期合同
- **索引生命周期**：仅在一次批量任务运行期间有效，文档变动后立即失效并重新构建。
- **写入合并**：批量任务开始时启用缓存，结束时执行强制 Flush。

## 7. 并发和共享状态设计
- `DocTaskRunStore` 引入单例写锁与合并缓冲区。
- 索引在多任务子进程间通过缓存目录下的临时索引文件共享（可选，P5 第一版优先做插件内复用）。

## 8. 性能与内存预算
- 严格限制 `DocTaskRunRecord` 序列化后的大小 <= 16KB。
- 严格限制 `latest.json` 总大小 <= 2MB（超过则对旧任务进行归档）。
- **Token 消耗审计必须覆盖全生命周期**：无论 Agent 执行成功、失败、超时还是被取消，只要产生了输出（stdout/stderr），系统必须尝试解析并记录已产生的 Token 消耗数据。

## 9. 安全与隐私边界
- 索引文件不包含文档内容，仅记录偏移量。
- 临时索引文件需遵循 `VECTAHUB_HOME` 权限设置。

## 10. 兼容和降级策略
- 若索引构建失败，自动降级为传统的“单任务重复扫描”模式，确保执行不中断。

## 11. 文件修改清单

CLI 侧：
- `src/cli.ts` (延迟加载优化)
- `src/commands/run-task.ts` (片段提取优化)

插件侧：
- `packages/vectahub-vscode-extension/src/project/docIndex.ts` (新)
- `packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts` (合并写入实现)

## 12. 实施步骤

1. **CLI 瘦身**：识别 `src/cli.ts` 中的厚重 import，改为 lazy load。
2. **文档索引化**：在插件端实现 `DocIndex` 类，支持 Heading 深度解析。
3. **批量预检复用**：让 `runAllDocTasks` 在启动前先构建索引。
4. **状态写入合并**：重构 `DocTaskRunStore`，增加 `batchUpdate` 和 `flush` 方法。
5. **内存审计**：使用 `heapdump` 或类似工具验证 100 个任务运行后的内存占用。

## 13. 测试计划
- 基准测试：处理 5MB Markdown 文档的时间损耗。
- 并发测试：模拟 100 个任务同时更新状态，确认磁盘写入次数。
- 启动测试：使用 `time vectahub --version` 测量冷启动。

## 14. 验收标准
- 批量任务启动时的“解析中”状态耗时降低 50% 以上。
- 磁盘 IO 写入频率明显下降。
- CLI 简单命令响应体感无延迟。

## 15. Hardening backlog
- 引入 Web Worker 处理插件端的文档索引构建，彻底避免阻塞 UI。
- 实现 `latest.json` 的增量加载。
