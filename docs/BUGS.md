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
| 9 | VS Code 插件点击预览意图/执行意图报错"意图预览失败: 未知错误" | **待修复** | `src/commands/run.ts`、`packages/vectahub-vscode-extension/src/cli/adapter.ts` | - |

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

**状态**: ⏳ **待修复**

**根本原因分析**:

1. **CLI 命令错误时未输出 JSON 格式**:
   - 在 `src/commands/run.ts` 中，当意图解析失败（如 `steps.length === 0`）或其他错误发生时，代码直接调用 `process.exit(1)` 退出
   - 此时没有输出任何 JSON 内容，导致插件端的 `adapter.ts` 无法解析到有效的 JSON
   
2. **错误信息传递机制缺失**:
   - CLI 端使用 `getLogger().error()` 输出错误信息到 stderr
   - 但插件端的 `previewIntent.ts` 在处理错误时，依赖 `result.error?.message` 或 `result.stderr` 获取错误信息
   - 当 CLI 异常退出且没有输出 JSON 时，`result.data` 为 `undefined`，`result.error` 也为 `undefined`
   - 最终只能显示兜底的 "未知错误"

3. **JSON 输出协议不完整**:
   - CLI 的 `--json` 模式只在成功路径（dry-run 和正常执行）输出 JSON
   - 错误路径（参数验证失败、意图解析失败、文件加载失败等）没有遵循相同的 JSON 输出协议

**修复方案**:

1. 修改 `src/commands/run.ts`:
   - 在所有 `process.exit(1)` 调用前，检查 `options.json` 是否为 true
   - 如果是 JSON 模式，先输出标准错误格式的 JSON（包含 `ok: false` 和 `error` 字段），再退出
   
2. 统一错误输出格式:
   - 定义标准的错误 JSON 结构: `{ ok: false, error: { code: string, message: string } }`
   - 确保所有错误路径都遵循此格式

---

**当前状态**: 存在待处理的 bug（编号 9）。