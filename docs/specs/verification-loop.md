# Task Verification Loop Spec

## 1. 用户目标和禁止事项

目标：每个文档任务执行后由 VectaHub 运行验证命令，不再只依赖 Agent 自述。

禁止事项：

- 不从 Agent 输出中提取任意命令执行。
- 不把完整 stdout/stderr 写入 JSON、trace 或 task run record。
- 不在 P3 第一版做 worktree 隔离。
- 不改变 `run-task --json` 既有字段语义。

## 2. 当前链路事实

当前链路：

```text
插件 runDocTask/runAllDocTasks
-> CLI run-task
-> Agent CLI
-> collect git diff
-> JSON 返回 output/gitChanges/agentTaskContract
-> 插件更新 task run record
```

当前事实：

- P2 已能生成 `AgentTaskContract.validationCommands`。
- `run-task` 已在 Agent 成功后执行 `AgentTaskContract.validationCommands`，并返回 `verification` 摘要。
- 插件状态机已有 `verifying`、`failed_test` 和 `failed_system_internal` 状态。
- 插件 task run record 只保存摘要，不保存完整大输出。
- 当前验证闭环的前提不是“Agent 子进程退出码为 0”，而是“Agent 已真正完成执行且未命中系统类软失败短路条件”。

## 3. 根因分析

未做验证闭环会导致：

- Agent 输出说“完成”但测试未跑，系统仍可能标为 success/changed。
- 验证失败无法稳定进入 `failed_test`。
- trace 无法定位失败发生在 Agent 阶段还是验证阶段。

## 4. In Scope / Out of Scope

In Scope：

- CLI `run-task` 在 Agent 成功后顺序执行合同里的验证命令。
- JSON 增加可选 `verification` 摘要。
- 插件根据 `verification` 分类结果标记 `failed_test` 或 `failed_system_internal`。
- task run record 保存验证摘要计数和失败命令摘要。

Out of Scope：

- 不做验证命令并发。
- 不做 worktree 隔离。
- 不做 secret scan。
- 不做完整 stdout/stderr 落盘引用。

## 5. 数据合同

新增 JSON 可选字段：

```ts
verification?: {
  ok: boolean;
  isSystemError?: boolean;
  commands: Array<{
    command: string;
    ok: boolean;
    exitCode: number | null;
    durationMs: number;
    stdoutSummary?: string;
    stderrSummary?: string;
    outputTruncated?: boolean;
  }>;
}
```

限制：

- 单条 stdout/stderr summary 最多 600 字符。
- 最多执行 10 条验证命令。
- `verification` 不包含完整输出。

## 6. 生命周期合同

```text
Agent success
-> collect git diff
-> if Agent output indicates local tool / sandbox / code-read blocker and no real change: failed_system_internal
-> verifying
-> run validationCommands sequentially
-> verification ok: success/changed
-> verification failed (assertion/non-zero exit): failed_test
-> verification system error (ENOENT/EACCES/EPERM/command unavailable): failed_system_internal
```

Agent 失败时不运行验证命令。
Agent 软失败时同样不运行验证命令。

如果 Agent 已经产生 `gitChanges`，但最终以 `failed_timeout` 或其他未完成收口的失败返回，验证命令仍然不得执行；此时 `verification` 必须缺失，由上层结合 `gitChanges` 和失败分类决定后续恢复或人工处理。

这里的 Agent 软失败包括但不限于：

- 输出明确说明“本地命令工具无法启动”
- 输出明确说明“无法读取代码”或“未能执行代码修改”
- 输出明确说明“当前任务被工具层阻断”“当前被环境阻塞”“本地命令/文件访问工具不可用”“未做代码改动”“本次实际修改文件：无”或“无法进入工作区”
- 输出包含 `sandbox-exec: sandbox_apply` 等下游环境阻塞信号
- 且没有可归因的实际 git 改动

## 7. 并发和共享状态设计

P3 第一版验证命令在单个任务内串行执行。

批量任务并发时：

- 每个任务的验证命令跟随该任务的 CLI 子进程执行。
- 不共享 stdout/stderr。
- 插件端仍通过 run store 写队列串行化状态写入。

## 8. 性能与内存预算

- 验证命令最多 10 条。
- 每条命令默认超时 120 秒，可通过环境变量覆盖。
- stdout/stderr 只保留摘要，避免大输出进入 JSON。
- 验证串行执行，优先保证结果可解释和低资源峰值。

## 9. 安全与隐私边界
- 只执行系统根据 allowedFiles 推导出的命令。
- **稳健命令解析 (Robust Parsing)**：严禁使用脆弱的手写 `split(' ')` 或自定义解析逻辑。必须使用工业级库（如 `shell-quote`）或严格遵循 POSIX shell 拆分协议，以正确处理嵌套引号、转义和空格。
- 命令通过简单 argv 解析后使用 `execFile`，不走 shell。
- 不执行 Agent 自述中的命令。

- trace 只记录命令、exitCode、耗时、输出长度。

## 10. 兼容和降级策略

- `verification` 是新增可选字段。
- 老插件忽略该字段仍可工作。
- 新插件看到缺失 `verification` 时按旧逻辑处理。
- 验证命令正常执行但断言失败/退出非零：进入 `failed_test`。
- 验证命令无法执行、权限错误、`ENOENT`/`EACCES`/`EPERM`：进入 `failed_system_internal`。

## 11. 文件修改清单

修改：

```text
src/commands/run-task.ts
src/commands/run-task.test.ts
packages/vectahub-vscode-extension/src/commands/runDocTasks.ts
packages/vectahub-vscode-extension/src/project/docTaskRunStore.ts
packages/vectahub-vscode-extension/src/project/docTaskState.ts
```

## 12. 实施步骤

1. 定义验证结果摘要类型。
2. 在 `run-task` 中实现验证命令执行函数。
3. Agent 成功后执行验证命令。
4. JSON 返回 `verification`。
5. 插件识别验证结果并按失败类型写入 `failed_test` 或 `failed_system_internal`。
6. task run record 保存验证摘要。

## 13. 测试计划

必须运行：

```text
npm test -- src/commands/run-task.test.ts --run
npm test -- src/commands/agent-task-contract.test.ts --run
npm test --workspace packages/vectahub-vscode-extension
npm run typecheck
npm run compile -w packages/vectahub-vscode-extension
```

## 14. 验收标准

- Agent 成功但验证失败时，CLI JSON `ok=false`。
- 插件将普通验证失败任务标记为 `failed_test`，将验证系统错误标记为 `failed_system_internal`。
- JSON 和 task run record 不包含完整验证输出。
- trace 能看到验证阶段耗时和失败命令。

## 15. Hardening backlog

- 支持验证输出落盘引用。
- 支持 diff baseline 后按文件范围验证。
- 支持验证命令风险策略白名单。
- 支持验证命令去重跨任务复用。
