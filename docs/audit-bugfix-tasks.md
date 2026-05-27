# 审计日志模块 Bug 修复任务文档

## Task audit-bug-1: AsyncLogWriter 队列溢出时 Promise 永久悬挂

- **严重程度**: P0
- **文件**: `src/infrastructure/trace-audit/async-writer.ts`, `src/infrastructure/trace-audit/async-writer.test.ts`
- **位置**: L102-117
- **问题**: 当队列满时，`shift()` 移除了队列头部的 `{ data, resolve, reject }` 对象，但对应的 Promise 既没有 resolve 也没有 reject，导致调用方的 `await writer.write(data)` 永久挂起
- **修复要求**: 在 `shift()` 前先调用被丢弃项的 `reject` 方法

---

## Task audit-bug-2: destroy() 在 flush 失败时状态不一致

- **严重程度**: P0
- **文件**: `src/infrastructure/trace-audit/async-writer.ts`, `src/infrastructure/trace-audit/async-writer.test.ts`
- **位置**: L183-194
- **问题**: 当 `flush()` 因 EPERM 等错误抛出异常时，`isDestroyed` 不会被设为 true，writer 也不会从 activeWriters 静态集合中移除
- **修复要求**: 用 `try/finally` 包裹 `flush()` 调用，确保 `isDestroyed` 和 `activeWriters.delete` 在 finally 块中执行

---

## Task audit-bug-3: 日志轮转与异步写入之间的 TOCTOU 竞态

- **严重程度**: P0
- **文件**: `src/infrastructure/trace-audit/log-rotation.ts`
- **位置**: L113-127
- **问题**: LogRotationManager 和 AsyncLogWriter 之间没有协调机制，轮转时 rename + create 操作可能截断 Writer 刚写入的数据
- **修复要求**: 在轮转前先暂停 AsyncLogWriter 写入并 flush，轮转完成后恢复写入

---

## Task audit-bug-4: classifyError 未处理 EPERM 错误码

- **严重程度**: P1
- **文件**: `src/infrastructure/errors/index.ts`
- **位置**: L43
- **问题**: Node.js 中 EPERM 和 EACCES 是两个不同的错误码，当前代码只检查 eacces，遗漏了 eperm
- **修复要求**: 在条件中添加 `|| msg.includes('eperm')`

---

## Task audit-bug-5: AsyncLogWriter 无熔断机制

- **严重程度**: P1
- **文件**: `src/infrastructure/trace-audit/async-writer.ts`, `src/infrastructure/trace-audit/async-writer.test.ts`
- **位置**: L85-89
- **问题**: 当目录权限为 EPERM 时，每次定时器触发都会执行 flush() 失败，没有任何退避或熔断机制
- **修复要求**: 添加 `consecutiveFailures` 计数器，超过阈值时停止重试，实现指数退避

---

## Task audit-bug-6: AuditLogger.filePath 跨午夜 UTC 后失效

- **严重程度**: P1
- **文件**: `src/infrastructure/audit/index.ts`
- **位置**: L84
- **问题**: filePath 在构造时基于当天 UTC 日期计算并缓存，跨午夜后会写入错误的文件
- **修复要求**: 在 `write()` 方法中动态调用 `getAuditFilePath()` 替代构造时缓存

---

## Task audit-bug-7: flush() 并发调用时静默跳过

- **严重程度**: P1
- **文件**: `src/infrastructure/trace-audit/async-writer.ts`, `src/infrastructure/trace-audit/async-writer.test.ts`
- **位置**: L127-130
- **问题**: 当 flush() 正在进行时，后续调用直接返回 void，但队列中的 Promise 仍处于 pending 状态
- **修复要求**: 在 `isFlushing` 为 true 时等待当前 flush 完成后再检查队列

---

## Task audit-bug-8: AuditLogger.write() 每次写入都重复调用 ensureDir

- **严重程度**: P2
- **文件**: `src/infrastructure/audit/index.ts`
- **位置**: L103
- **问题**: 构造函数中已经调用过 ensureDir，每次 write() 再次调用造成不必要的 existsSync 系统调用
- **修复要求**: 移除 write() 中的 ensureDir，改为 ENOENT 时重试一次

---

## Task audit-bug-9: AuditLogger 使用已废弃的 getVectaHubPath

- **严重程度**: P2
- **文件**: `src/infrastructure/audit/index.ts`
- **位置**: L83
- **问题**: getVectaHubPath 是 compat-bridge 中标记为 @deprecated 的函数
- **修复要求**: 改为 `getVectaHubPathWithDeps`

---

## Task audit-bug-10: flush() 失败后重试不会 reject 已失败的项

- **严重程度**: P2
- **文件**: `src/infrastructure/trace-audit/async-writer.ts`, `src/infrastructure/trace-audit/async-writer.test.ts`
- **位置**: L149-158
- **问题**: 失败的项被放回队列等待重试，但如果失败原因是持久性的（如 EPERM），这些项会一直被重试，Promise 永远 pending
- **修复要求**: 为 WriteQueueItem 添加 retryCount 字段，超过最大重试次数后 reject
