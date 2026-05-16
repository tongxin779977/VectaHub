# 排障手册

本文面向 CLI 用户和维护者，按症状给出最短排查路径。底层失败分类见 [Run-Task 执行合同](./specs/run-task-execution-contract.md)、[恢复闭环规格](./specs/recovery-loop.md) 和 [Trace 执行规格](./specs/trace-execution.md)。

## 先运行诊断

```bash
vectahub doctor
vectahub doctor --json
```

如果问题和 Agent CLI 有关，再运行：

```bash
vectahub tools agents --json
```

如果问题和某次执行有关，查询 history、detail 或 trace：

```bash
vectahub history --status FAILED
vectahub detail <executionId>
vectahub trace list --json
vectahub trace show <traceId> --json
```

## `--json` 输出无法解析

预期行为：使用 `--json` 的命令 stdout 必须是纯 JSON。

排查步骤：

1. 确认调用的命令是否声明支持 `--json`。
2. 确认脚本没有把 stderr 合并进 stdout。
3. 使用 `--debug` 时确认人类日志没有污染 stdout。
4. 查看 [CLI 命令面规格](./specs/cli-command-surface.md) 中该命令的 JSON 支持状态。

如果命令支持 `--json` 但 stdout 混入人类日志，应视为协议问题。

## `run-task` 卡住或超时

`run-task` 可能经历合同构建、安全检查、Agent preflight、Agent 执行、git 变更收集和验证阶段。

排查步骤：

```bash
vectahub run-task --task-id T1 --task-label "补测试" --doc ./docs/task.md --contract-preview --json
vectahub tools agents --json
vectahub trace list --json
```

重点判断：

| 信号 | 含义 |
|------|------|
| `contract-preview` 失败 | 文档路径、任务 id、任务标签或合同构建有问题。 |
| Agent 不 ready | 外部 Agent CLI 配置、权限或安装问题。 |
| 有 git changes 但 timeout | Agent 可能已落地部分改动，但 CLI 未正常收口。 |
| verification 缺失 | 不应宣称任务成功，应按失败或未收口执行处理。 |

## Agent CLI 配置失败

先查看 Agent 探测结果：

```bash
vectahub tools agents --json
```

再确认：

- 外部 Agent CLI 是否能在终端直接运行。
- 插件环境和终端环境是否一致。
- `VECTAHUB_HOME` 是否误当成第三方 Agent 的长期配置目录。
- 已知 Agent 是否需要可写运行态目录和最小必要配置同步。

配置边界见 [配置手册](./configuration.md)。

## 审计日志写入失败

如果看到类似 `Failed to write audit log` 的告警，当前语义是告警降级，不应改变主流程返回结构。

优先检查：

```bash
echo "$VECTAHUB_HOME"
vectahub config show
```

然后确认 `VECTAHUB_HOME` 及其日志目录是否可写。

## 验证命令不存在或失败

Agent 执行成功不等于任务成功。`run-task` 正常执行后仍需要运行合同中的验证命令。

常见原因：

- 项目未安装依赖。
- `package.json` 中没有对应脚本。
- 插件或 CLI 工作目录不正确。
- 验证命令依赖外部二进制，但当前环境没有安装。

维护者应查看 [任务验证闭环规格](./specs/verification-loop.md) 判断失败是否属于 `failed_test`、`failed_system_internal` 或其他分类。

## 权限或安全拦截

高风险命令可能需要确认，critical 风险默认应阻断。

测试命令风险：

```bash
vectahub security test "rm -rf /" --json
```

查看安全规则：

```bash
vectahub security status
vectahub security list
```

工具和安全规则说明见 [工具与安全规则规格](./specs/tools-security-management.md)。

## 找不到历史、trace 或队列

优先检查 `VECTAHUB_HOME`：

```bash
echo "$VECTAHUB_HOME"
vectahub history
vectahub trace list --json
vectahub queue list --json
```

如果终端和插件看到的数据不同，通常是环境变量或项目路径不同。

