---
name: Gemini CLI Auto-Runner (信箱架构版 2.0)
description: 专门负责通过信箱监听器，安全触发外部原生环境中的 Gemini CLI 指令。已集成 2.0 自愈逻辑。
---

# 🤖 Gemini CLI [并发引擎] 自动化流水线 2.0

// turbo-all
// retry: 3

## 📋 执行标准作业程序 (SOP)

### 1. 生成 TaskID 并准备环境

// capture: TID (gen_uuid)
**[自愈增强]**：Agent 在开始前必须先检查并清理可能的残留回执：
`rm -f .gemini/responses/{{TID}}.response`

### 2. 投递并发任务

// run: echo "{{args}}" > .gemini/tasks/{{TID}}.task
确指令是否符合 2.0 监听器规范。

### 3. 指定轮询与开盲盒

// timeout: 30s
使用 `view_file` 监控：`.gemini/responses/{{TID}}.response`
*由于监听器已升级至 2s 心跳，预计响应时间将大幅缩短 80%。*

### 4. 日志捕获、自愈与 ACK

- **分析**: 读取回执中的 `Exit Code`。
- **自愈**: 若非 `0`，Agent **必须**分析报错堆栈并自动修复业务代码，随后触发工作流重试。
- **ACK (握手确认)**: 任务完成后，**必须立即执行** `rm .gemini/responses/{{TID}}.response` 以清理通讯占位。
