# VectaHub 已知问题与修复方案 (BUGS.md)

> 文档版本: v1.2
> 更新日期: 2026-05-08
> 状态: 可执行

## 概述

本文件记录了 VectaHub 开发过程中发现的关键问题、架构层面的根本原因分析，以及可由 Agent 直接执行的修复方案。

---

## BUG 清单

| 序号 | 标题 | 状态 | 位置 | 修复版本 |
|:---:|------|:----:|------|:--------:|
| 8 | VS Code 插件任务失败后 Recent / Failed 视图不显示记录 | **已修复** | `packages/vectahub-vscode-extension/src/views/tasksView.ts`、`packages/vectahub-vscode-extension/src/commands/runProjectTask.ts` | v1.2 |
| 9 | VS Code 插件点击预览意图/执行意图报错"意图预览失败: 未知错误" | **已修复** | `src/commands/run.ts` | v1.2 |
| 10 | CLI `vectahub run` 执行成功后进程不退出，终端挂起 | **已修复** | `src/commands/run.ts` | v1.2 |
| 11 | VS Code 插件执行意图报"任务执行失败"，`--mode strict` 参数被 engine 忽略 | **待修复** | `packages/vectahub-vscode-extension/src/commands/runIntent.ts`、`src/workflow/engine.ts` | - |
| 12 | VS Code 插件预览意图无效果反馈，CLI JSON 输出协议不完整导致静默失败 | **待修复** | `packages/vectahub-vscode-extension/src/commands/previewIntent.ts`、`src/commands/run.ts` | - |

---

## 详情

### 8. VS Code 插件任务失败后 Recent / Failed 视图不显示记录

**状态**: ✅ **已修复 (2026-05-08)**

**修复内容**:

1. 新增 `packages/vectahub-vscode-extension/src/project/taskHistory.ts`:
   - `TaskRunRecord` 接口定义任务记录模型
   - `createTaskHistory()` 创建独立状态的服务实例
   - `addTaskRecord()` 全局添加记录函数
   - `getRecentTasks()` / `getFailedTasks()` 获取历史记录

2. 修改 `packages/vectahub-vscode-extension/src/views/tasksView.ts`:
   - 引入 `getRecentTasks` / `getFailedTasks`
   - `getChildren()` 现在从任务历史服务读取 Recent/Failed 数据
   - 新增 `vectahubTasks.showOutput` 命令处理点击失败记录

3. 修改 `packages/vectahub-vscode-extension/src/commands/runProjectTask.ts`:
   - 任务执行成功/失败后调用 `addTaskRecord()` 写入历史
   - 记录包含 `id`, `label`, `kind`, `source`, `status`, `errorMessage`, `startedAt`, `endedAt`

4. 新增测试 `packages/vectahub-vscode-extension/test/taskHistory.test.ts`:
   - 10 个测试用例覆盖 TaskRunRecord 模型和 TaskHistoryService

---

### 9. VS Code 插件点击预览意图/执行意图报错"意图预览失败: 未知错误"

**状态**: ✅ **已修复 (2026-05-08)**

**修复内容**:

1. `src/commands/run.ts`:
   - 新增 `exitWithError()` 函数（第 30-43 行），统一处理所有错误路径
   - 函数接收 `jsonMode` 参数，当 `--json` 模式启用时输出标准 JSON 格式 `{ ok: false, error: { code, message } }`
   - 所有错误路径（无效模式、工作流加载失败、意图解析失败、无输入、catch 异常）均已改为调用 `exitWithError()` 并传递 `options.json` 参数

2. 错误输出格式统一为:
   ```json
   {
     "ok": false,
     "error": {
       "code": "ERROR_CODE",
       "message": "错误描述"
     }
   }
   ```

---

### 10. CLI `vectahub run` 执行成功后进程不退出，终端挂起

**状态**: ✅ **已修复 (2026-05-08)**

**修复内容**:

`src/commands/run.ts`（第 334-335 行）:
- 在 while 循环结束后、catch 块之前添加了 `process.exit(0)`
- 同时恢复环境变量 `VECTAHUB_AUDIT_DISABLED` 的原始值

**修复代码**:
```typescript
restoreEnvValue('VECTAHUB_AUDIT_DISABLED', previousAuditDisabled);
process.exit(0);
```

**验证**:
- dry-run 路径（文件模式）: 第 170 行 `process.exit(0)` ✅
- dry-run 路径（意图模式）: 第 242 行 `process.exit(0)` ✅
- 失败路径: 第 329 行 `process.exit(1)` ✅
- **成功路径**: 第 335 行 `process.exit(0)` ✅（新增）

---

### 11. VS Code 插件执行意图报"任务执行失败"，`--mode strict` 参数被 engine 忽略

**状态**: ⏳ **待修复**

**根本原因分析**:

1. **`runIntent.ts` 硬编码 `--mode strict`，但 engine 忽略该参数**:
   - `runIntent.ts` 第 26 行调用 `runCli(['run', '--json', '--mode', 'strict', preview.intent])`
   - `run.ts` 第 255 行将 `mode: options.mode` 传给 `execute()`
   - 但 `engine.ts` 的 `buildExecutorOptions()`（第 274-283 行）使用的是 `workflow.mode`，而不是 `options.mode`
   - `workflow.mode` 在 `createWorkflow()`（第 302 行）中硬编码为 `'relaxed'`
   - 导致 `--mode strict` 参数被完全忽略，始终以 `RELAXED` 模式执行

2. **`runIntent.ts` 缺少错误处理的 try-catch**:
   - `registerRunIntentCommand` 中的 async 回调没有 try-catch
   - 如果 `previewIntent` 或 `runCli` 抛出异常，VS Code 会静默吞掉错误
   - 用户只看到"任务执行失败"，没有具体错误信息

3. **`runIntent.ts` 第 26 行 `preview.intent` 可能为 `undefined`**:
   - 预览阶段返回的 `intent` 字段来自 `nlResult.intent || nlResult.taskList?.intent`
   - 如果两者都为 `undefined`，则 `preview.intent` 为 `undefined`
   - 传给 CLI 时 Commander 解析异常，导致执行失败

**修复方案**:

1. 修改 `engine.ts` 的 `buildExecutorOptions()`，使其优先使用 `options.mode`，再回退到 `workflow.mode`
2. 修改 `runIntent.ts`，添加 try-catch 并输出具体错误信息
3. 修改 `runIntent.ts`，在调用 CLI 前校验 `preview.intent` 不为空

---

### 12. VS Code 插件预览意图无效果反馈，CLI JSON 输出协议不完整导致静默失败

**状态**: ⏳ **待修复**

**根本原因分析**:

1. **`previewIntent.ts` 缺少 try-catch，异常被 VS Code 静默吞掉**:
   - `registerPreviewIntentCommand` 中的 async 回调（第 44-46 行）没有 try-catch
   - 如果 `runCli` 抛出异常（如 CLI 路径不存在、超时等），VS Code 不会显示任何错误
   - 用户点击"预览意图"后感觉"没效果"

2. **CLI JSON 输出协议不完整（同 BUG #9）**:
   - 当 CLI 执行 `run --dry-run --json` 失败时，错误信息输出到 stderr 而非 stdout JSON
   - `adapter.ts` 第 83 行尝试解析 stdout 为 JSON，但 stdout 为空
   - `result.data` 为 `undefined`，`result.ok` 为 `false`
   - `previewIntent.ts` 第 36 行显示"意图预览失败: 未知错误"

3. **InputBox 取消后无反馈**:
   - `previewIntent.ts` 第 12-15 行：如果用户取消 InputBox，`input` 为 `undefined`，函数返回 `undefined`
   - 调用方 `registerPreviewIntentCommand` 没有检查返回值，也没有给出任何反馈
   - 用户感觉点击后"没反应"

**修复方案**:

1. 修改 `registerPreviewIntentCommand`，添加 try-catch 并显示错误信息
2. 修改 `previewIntent.ts`，在用户取消 InputBox 时给出提示
3. 修复 CLI JSON 输出协议（同 BUG #9 修复方案）

---

**当前状态**: 存在待处理的 bug（编号 11、12）。