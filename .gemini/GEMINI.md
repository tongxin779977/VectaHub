# GEMINI.md — CACP 2.0 通信协议全局规则

> 此文件定义了 Antigravity 与 Gemini CLI 之间的工业级协作标准。

## 🌐 跨 Agent 通信协议 (CACP 2.0)

### 1. 职责分工 (Responsibility)

- **[Antigravity 专有]**: 负责代码构建、逻辑重构、低权限文件操作 (ls, cat, grep, mkdir) 以及 **发信人** 角色。
- **[Gemini CLI 专有]**: 负责 CI/CD 管道执行、高权限审计、二进制命令运行 以及 **执行者** 角色。

### 2. 通信协议 (Mailbox SOP 2.0)

- **发信**: Antigravity 将指令（不带 `gemini` 关键字）覆写至 `.gemini/tasks/{{TID}}.task`。
- **监听**: Gemini CLI 通过 `gemini_watcher.sh` (5s 心跳) 在原生终端执行。
- **回执**: 执行结果写入 `.gemini/responses/{{TID}}.response`。
- **握手 (ACK)**: Antigravity 读取回执后，**必须手动删除响应回执文件**以清除占位锁。
- **归权 (Permissions)**: 监听器在执行完任务后，**必须**自动将所有权归还给当前 IDE 用户，确保跨环境编辑流畅。

### 3. 错误自愈 (Self-Healing)

- 若发现回执中出现 `EXITCODE: 1` 或 `EPERM`，Agent 必须分析日志并自动修复逻辑后重试。
- 禁止在未读取回执的情况下投递同名新任务。

---

```yaml
version: 2.3.0
lastUpdated: 2026-04-03
```
