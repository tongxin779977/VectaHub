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

当前代码已落地的 P5 第一版能力：
- 插件端已实现 `DocTaskDocIndex`，批量任务可复用一次文档读取结果。
- `DocTaskRunStore` 已引入实例内写队列，降低并发写 `latest.json` 的覆盖风险。
- `run-task` 已具备输出截断、摘要限制和实时 Token 使用量捕获。
- `trace list/show` 已采用流式读取，并支持 `--limit` 控制返回规模。
- CLI 已拆分为 `cli.ts -> cli-bootstrap.ts -> cli-main.ts` 启动链路，轻量命令可绕过主命令装载。

当前剩余性能痛点：
- **重复 IO**：插件预检与 CLI 执行阶段之间仍未共享合同推导结果，跨进程场景下仍会重复读取文档。
- **写入竞争**：当前是串行写队列，不是批量 flush；高频状态更新时磁盘写入次数仍可能偏高。
- **内存压力**：`DocTaskDocIndex` 仍保留完整 `content`，大文档场景下插件内存峰值仍偏高。
- **冷启动开销**：CLI 虽已拆分入口，但尚未达到“顶级作用域零副作用”的最严格要求，也缺少正式冷启动基准。

## 3. 根因分析
- 缺乏**单一事实源复用**机制：插件预检和 CLI 执行仍各自推导合同，导致部分重复 IO 无法消除。
- 缺乏**批量写入合并 (Batch Flush)**：当前只解决并发覆盖，没有真正降低批量期间的写频。
- 缺乏**预算实测基线**：部分性能优化已实现，但缺少正式测量和回归门禁，无法确认是否达成预算。
- 缺乏**严格启动约束收口**：CLI 入口已瘦身，但尚未完全满足性能文档的静态定义红线。

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
- **Token 消耗审计必须作用于原始流 (Raw Stream)**：Token 解析必须直接作用于全量生成的 `.stdout` 文件流或原始子进程输出。**严禁**仅从 JSON 摘要或 `outputSummary` 中尝试提取 Token 信息，以防止因 2000 字符截断导致的审计遗漏。

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
