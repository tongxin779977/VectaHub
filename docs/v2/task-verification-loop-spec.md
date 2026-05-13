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
- `run-task` 已返回合同摘要，但不会自动执行验证命令。
- 插件状态机已有 `verifying` 和 `failed_test` 状态。
- 插件 task run record 只保存摘要，不保存完整大输出。

## 3. 根因分析

未做验证闭环会导致：

- Agent 输出说“完成”但测试未跑，系统仍可能标为 success/changed。
- 验证失败无法稳定进入 `failed_test`。
- trace 无法定位失败发生在 Agent 阶段还是验证阶段。

## 4. In Scope / Out of Scope

In Scope：

- CLI `run-task` 在 Agent 成功后顺序执行合同里的验证命令。
- JSON 增加可选 `verification` 摘要。
- 插件根据 `verification.ok === false` 标记 `failed_test`。
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
-> verifying
-> run validationCommands sequentially
-> verification ok: success/changed
-> verification failed: failed_test
```

Agent 失败时不运行验证命令。

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
- 验证执行异常视为验证失败，进入 `failed_test`。

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
5. 插件识别验证失败并写入 `failed_test`。
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
- 插件将验证失败任务标记为 `failed_test`。
- JSON 和 task run record 不包含完整验证输出。
- trace 能看到验证阶段耗时和失败命令。

## 15. Hardening backlog

- 支持验证输出落盘引用。
- 支持 diff baseline 后按文件范围验证。
- 支持验证命令风险策略白名单。
- 支持验证命令去重跨任务复用。
