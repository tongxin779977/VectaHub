# VectaHub 架构加固与修复实施手册 (Agent Action Guide)

本指南汇总了最新的系统规格（Spec）要求，请在修复 P1-P5 的遗留缺陷时**严格遵守以下技术契约**。任何偏离以下契约的实现将被视为严重违规。

---

## 1. 全链路流式脱敏 (Security Mandate)
**规格来源**：`docs/v2/security-permission-loop-spec.md`

### 技术要求
*   **禁止明文落盘**：Agent 子进程产生的原始 `stdout` 和 `stderr` 在写入本地磁盘 `.stdout` 记录文件**之前**，必须被脱敏。
*   **实现方案**：
    *   必须实现一个 Node.js `Transform` 流（例如 `RedactionTransform`）。
    *   将子进程的输出 `pipe` 到该转换流，再 `pipe` 到 `fs.createWriteStream`。
    *   脱敏逻辑应复用现有的 `Redactor` 规则。

---

## 2. 内存保护型文档读取 (Memory Mandate)
**规格来源**：`docs/v2/agent-worker-contract-spec.md`

### 技术要求
*   **禁止全量读取**：在 `deriveDocExcerpt` 及任何提取任务片段的场景中，**严禁**使用 `fsp.readFile(..., 'utf8')` 将整个文件读入内存。
*   **实现方案**：
    *   必须使用 `fs.createReadStream` 结合 `readline` 模块（或流式正则匹配）逐行或按块扫描大文档。
    *   在找到目标片段（通过 `taskId` 或 `label` 定位）后，仅在内存中保留该片段及其上下文窗口，然后立即销毁流。

---

## 3. 稳健的验证命令解析 (Execution Mandate)
**规格来源**：`docs/v2/task-verification-loop-spec.md`

### 技术要求
*   **废弃手写解析**：目前的 `splitCommandArgs` 无法安全处理嵌套引号和复杂转义，必须废弃。
*   **实现方案**：
    *   优先考虑引入 npm 库 `shell-quote` 进行参数拆分。
    *   如果为了保持单二进制零依赖，必须实现一个严格符合 POSIX shell 拆分规范的词法分析器，并补充详尽的测试用例（覆盖 `grep "a \"b\" c"` 等场景）。

---

## 4. 顶级作用域零副作用 (Performance Mandate)
**规格来源**：`docs/v2/performance-resource-budget-spec.md` & `docs/v2/system-architecture.md`

### 技术要求
*   **静态定义红线**：`src/cli.ts` 的顶级作用域**只允许** `import`、简单常量赋值和类/函数声明。
*   **实现方案**：
    *   `getVersion()` 同步读取 `package.json` 的行为，必须移入 `program.version()` 的延迟回调中。
    *   `setupGlobalSignals()` 等事件绑定或初始化行为，必须移入 `program.hook('preAction', ...)` 钩子中。
    *   使用原生的 Node.js ESM `import`，**彻底移除所有 `require` 语句**。

---

## 5. 任务指纹的完全对称 (Identity Mandate)
**规格来源**：`docs/v2/agent-worker-contract-spec.md`

### 技术要求
*   **因子完备**：`instructionHash` 的计算必须包含 `taskId`, `label`, `docExcerpt`, `toolName`, `allowedFiles`, `forbiddenFiles`, `globalConfigDigest`。
*   **实现方案**：
    *   修复插件侧比对逻辑，在生成比对用的新 Hash 前，必须从环境中预先推导或提取完整的 `allowedFiles` 和 `forbiddenFiles`。
    *   如果参数在函数调用时确实为 `undefined`，必须有安全的默认回退（如空数组），以防计算崩溃。

---

## 执行建议
请按上述顺序逐一修复并提交。每修复一项，请自行运行相关的单元测试并确保没有引入新的类型错误。这不仅是修 Bug，这是一次**架构级的主动防御升级**。
