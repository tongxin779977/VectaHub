# Sandbox 健康度评估报告

## 基本信息

| 项目 | 值 |
|------|-----|
| 模块名称 | Sandbox |
| 目录路径 | `src/sandbox/` |
| 入口文件 | `index.ts` |
| 源文件数量 | 8 |
| 测试文件数量 | 5 |
| 总代码行数 | 1,686（源）/ 662（测试） |
| 评估日期 | 2026-05-27 |
| 评估人 | Architecture Agent |

## 总分与等级

| 指标 | 值 |
|------|-----|
| 总分 | 73/100 |
| 等级 | 🟡 C |
| 含义 | 基本合格，存在明显的架构债务和代码重复问题，需要系统性改进 |

## 维度评分明细

### 第一组：架构设计 (9/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D01 - 模块职责单一性 | 2/5 | `sandbox.ts` 达 984 行，严重超过 300 行阈值（-1），是典型的"上帝文件"；该文件同时承担配置管理、目录初始化、能力检测、sudo 状态检查、命令签名/验证、可执行文件哈希验证、4 种隔离策略执行、环境变量过滤、文件写入、清理等 10+ 种职责（-1）；其他文件尺寸合理（interfaces.ts 103 行、detector.ts 149 行、semantic-detector.ts 253 行） |
| D02 - 依赖方向合理性 | 4/5 | 使用依赖注入（`SandboxManagerDeps` 接口，`sandbox.ts`:L98-L107），可测试性好；依赖方向正确，sandbox 依赖 infrastructure、command-rules、security-protocol 等下层模块；`index.ts` 重导出 `security-protocol` 的类型和函数（L7-L9），模糊了模块边界，sandbox 不应成为 security-protocol 的门面（-0.5） |
| D03 - 抽象层次一致性 | 3/5 | `sandbox.ts` 的 `exec` 方法（L793-L871）混合了高层策略（模式判断、规则引擎评估）和底层实现（进程 spawn、stdout 收集）；`signCommand`/`validateCommandSignature`（L420-L466）是密码学操作，与沙箱执行处于不同抽象层次（-1）；`verifyCommandExecutable`/`resolveCommandPath`/`computeFileHash`（L468-L534）是文件系统操作，也混杂在同一类中（-1） |

### 第二组：类型安全 (13/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D04 - 类型完整性 | 5/5 | 全模块无 `any` 类型使用；无 `as any` 类型断言；无 `@ts-ignore` 或 `@ts-expect-error`；所有函数参数和返回值均有显式类型标注 |
| D05 - 类型导出规范 | 5/5 | 全部使用 named exports；无 `export default`；无 `export let`；`index.ts` 使用 `export type` 重导出类型（L1, L4, L11, L14, L16），符合规范 |
| D06 - 泛型与工具类型 | 3/5 | `execWithSandboxExec`（L536-L607）、`execWithUnshare`（L609-L670）、`execWithBubblewrap`（L672-L736）、`execInDirectory`（L738-L783）四个方法结构高度相似（spawn → 收集 stdout/stderr → 处理 close/error），可通过泛型或策略模式消除（-1）；`testSudo`（L285-L299）、`testBwrapSudo`（L301-L322）、`testUnshareSudo`（L324-L345）三个方法共享相同模式，可提取为通用函数（-0.5）；使用了 `Partial<SandboxConfig>` 工具类型（L125），加分 |

### 第三组：代码风格 (12/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D07 - 命名规范一致性 | 5/5 | 变量/函数使用 camelCase（`detectCapabilities`、`filterEnv`）；类使用 PascalCase（`SandboxManager`、`MemoryMonitor`）；常量使用 UPPER_SNAKE_CASE（`SANDBOX_EXEC_PATH`、`DEFAULT_PROTECTED_DIRS`）；文件名使用 kebab-case；布尔变量有 `has`/`is` 前缀（`hasBwrap`、`isFallback`） |
| D08 - 导入组织规范 | 3/5 | `sandbox.ts`:L1-L4 标准库导入未使用 `node:` 前缀（`child_process`、`fs`、`path`、`os`），而 `worktree-manager.ts`:L1-L4 使用了 `node:` 前缀，风格不一致（-0.5）；`sandbox.ts` 导入未按标准库/第三方/内部分组，`crypto`（L6）出现在内部模块导入（L5）之后（-0.5）；`index.ts` 重导出其他模块（security-protocol）的内容，增加了导入耦合（-0.5） |
| D09 - 代码格式一致性 | 4/5 | 缩进一致（2 空格）；大括号风格一致；项目有 ESLint 配置（`eslint.config.js`）；`sandbox.ts` 导入分组不规范（-0.5） |

### 第四组：错误处理 (12/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D10 - 异常捕获完备性 | 4/5 | `testExecutable`（L215-L227）正确处理 `accessSync` 异常和 child process 错误；`execWith*` 系列方法均处理 `child.on('error')`；`verifyCommandExecutable`（L468-L491）有 try/catch；`signCommand`（L420-L430）和 `validateCommandSignature`（L432-L461）使用 crypto 模块但未包裹 try/catch，若输入异常可能导致未捕获异常（-0.5）；`computeFileHash`（L515-L534）通过 stream error 事件处理，正确 |
| D11 - 错误信息质量 | 4/5 | 错误信息包含上下文：`'Sandbox detector failed to initialize security manager'`（`detector.ts`:L69）使用 `{ cause: error }` 保留错误链；`'Dangerous command blocked (${detection.level}): ${detection.reason}'`（`sandbox.ts`:L829）包含级别和原因；中文用户提示清晰：`'签名已过期或时间戳无效'`（L439）、`'无法找到命令: ${cmd}'`（L474）；部分错误信息缺少命令原文，如 `'签名无效或已过期'`（L460）未包含具体命令（-0.5） |
| D12 - 优雅降级 | 3/5 | 隔离策略有完善的降级链：sandbox-exec → bubblewrap → unshare → directory（`computeStrategy` L229-L237）；`worktree-manager.ts`:L44-L57 在非 git 环境下降级到 `fs.cp`；但 `createSandbox`（`sandbox.ts`:L950-L984）通过 `manager['detector']` 访问私有字段，破坏封装，且无降级处理（-1）；`checkSudoStatus` 在未知平台时返回目录隔离模式，但未记录告警日志（-0.5） |

### 第五组：测试质量 (11/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D13 - 测试覆盖率 | 3/5 | `SandboxManager` 类是模块核心（934 行），但无直接测试文件；`sandbox.test.ts` 仅测试 `createSandbox` 门面函数（81 行），未覆盖 `SandboxManager` 的 `exec`、`executeInSandbox`、`checkSudoStatus`、`signCommand`、`validateCommandSignature`、`verifyCommandExecutable` 等核心方法（-1）；`constants.ts` 无测试（-0.5，常量文件酌情）；`detector.test.ts`、`semantic-detector.test.ts`、`memory-monitor.test.ts`、`worktree-manager.test.ts` 覆盖良好 |
| D14 - 测试设计质量 | 4/5 | `detector.test.ts` 覆盖 critical/high/medium/low/none 全级别，断言明确；`semantic-detector.test.ts` 覆盖中英文注入模式、命令检测、组合检测，场景全面（313 行）；`worktree-manager.test.ts` 使用 vi.mock 正确模拟 fs 和 child_process；`sandbox.test.ts` 覆盖 STRICT/RELAXED/CONSENSUS 三种模式；但 `sandbox.test.ts` 未测试错误路径（如危险命令被阻止时的返回值细节）（-0.5） |
| D15 - 测试可维护性 | 4/5 | 测试命名描述意图清晰（`'should detect Chinese instruction override'`）；`worktree-manager.test.ts` 有良好的 mock 设置（`beforeEach` 清理）；`semantic-detector.test.ts` 使用 `beforeEach` 重建实例保证独立性；缺少共享测试工厂函数（-0.5） |

### 第六组：第三方依赖 (8/10)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D16 - 封装层完整性 | 3/5 | `index.ts` 重导出 `security-protocol` 的 5 个符号（L7-L9），使 sandbox 模块成为 security-protocol 的代理门面，模糊了模块边界（-1）；`detector.ts`:L2 直接 import `getSecurityManager`，`sandbox.ts`:L19 直接 import `createSecurityGuard`，未通过 sandbox 内部封装层（-0.5）；sandbox 自身功能的封装通过工厂函数（`createDetector`、`createSandboxManager`）实现，这部分良好 |
| D17 - 依赖必要性与版本 | 5/5 | 模块仅使用 Node.js 内置模块（`child_process`、`fs`、`path`、`os`、`crypto`），无外部第三方依赖；无版本管理问题 |

### 第七组：可维护性 (8/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D18 - 文档与注释质量 | 3/5 | `interfaces.ts` 有完整的 JSDoc（每个接口均有注释）；`sandbox.ts`:L94-L97 `SandboxManagerDeps` 有 JSDoc；但以下顶层导出缺少 JSDoc：`createDetector`（`detector.ts`:L61）、`createSemanticDetector`（`semantic-detector.ts`:L212）、`createSandboxManager`（`sandbox.ts`:L936）、`createSandbox`（`sandbox.ts`:L950）、`createSandbox`（`worktree-manager.ts`:L33）、`teardownSandbox`（`worktree-manager.ts`:L81）、`MemoryMonitor`（`memory-monitor.ts`:L1）（-1.5，7 个顶层导出 × -0.5 取上限）；`sandbox.ts`:L91 有解释"为什么"的注释（`'保持向后兼容性，使用原有行为'`），加分 |
| D19 - 代码重复度 | 2/5 | `interfaces.ts` 定义了 `SandboxConfig`、`ExecOptions`、`ExecResult`、`ThreatType`、`SemanticDetectionResult`，但这些类型在 `sandbox.ts`（L22-L59）和 `semantic-detector.ts`（L3-L11）中被重新定义，`interfaces.ts` 完全未被 import，是死代码（-1）；`execWithSandboxExec`、`execWithUnshare`、`execWithBubblewrap`、`execInDirectory` 四个方法共享约 80% 结构（spawn → 收集输出 → 处理结果），可提取为通用执行器（-1）；`testSudo`、`testBwrapSudo`、`testUnshareSudo` 三个方法模式相同（-0.5） |
| D20 - 技术债务标记 | 3/5 | 全模块无 TODO/FIXME/HACK 标记；但存在未标记的技术债务：`interfaces.ts` 是死代码但未标记 `@deprecated`（-0.5）；`createSandbox`（`sandbox.ts`:L959, L977）通过 `manager['detector']` 访问私有字段，是已知的封装破坏但未标记（-0.5）；4 个 exec 方法的重复未标记为待重构（-0.5） |

## 关键发现

### P0 阻断问题

无

### P1 严重问题

| 序号 | 文件 | 行号 | 问题描述 | 对应条例 |
|------|------|------|----------|----------|
| 1 | `sandbox.ts` | L1-L984 | "上帝文件"：984 行代码承担 10+ 种职责（配置、目录、能力检测、sudo、签名、哈希、4 种隔离策略、环境过滤、文件操作、清理），严重违反单一职责原则 | G-03, G-01 |
| 2 | `sandbox.ts` | - | `SandboxManager` 类无直接测试：核心类 934 行，但无专门测试文件，`sandbox.test.ts` 仅测试门面函数 | G-04 |
| 3 | `interfaces.ts` | L1-L103 | 完全死代码：定义了 8 个接口/类型，但全模块无任何文件 import 此文件，接口在 `sandbox.ts` 和 `semantic-detector.ts` 中被重复定义 | G-03, G-08 |
| 4 | `sandbox.ts` | L536-L783 | 4 个 exec 方法（`execWithSandboxExec`、`execWithUnshare`、`execWithBubblewrap`、`execInDirectory`）结构高度重复，违反 DRY 原则 | G-03 |

### P2 一般问题

| 序号 | 文件 | 行号 | 问题描述 | 对应条例 |
|------|------|------|----------|----------|
| 1 | `sandbox.ts` | L950-L984 | `createSandbox` 通过 `manager['detector']` 访问私有字段，破坏封装性 | G-01 |
| 2 | `index.ts` | L7-L9 | 重导出 `security-protocol` 的 5 个符号，sandbox 模块不应成为其他模块的代理 | 3P-05 |
| 3 | `sandbox.ts` | L1-L6 | 标准库导入未使用 `node:` 前缀，与 `worktree-manager.ts` 不一致 | TS-08, TS-09 |
| 4 | `sandbox.ts` | L1-L6 | 导入未按标准库/第三方/内部分组，`crypto` 出现在内部模块之后 | TS-09 |
| 5 | `sandbox.ts` | L420-L461 | `signCommand`/`validateCommandSignature` 使用 crypto 模块但未包裹 try/catch | G-02 |
| 6 | `detector.ts` | L2 | 直接 import 第三方模块 `getSecurityManager`，未通过封装层 | 3P-01 |
| 7 | `sandbox.ts` | L19 | 直接 import `createSecurityGuard`，未通过封装层 | 3P-01 |

### P3 建议改进

| 序号 | 文件 | 行号 | 问题描述 | 对应条例 |
|------|------|------|----------|----------|
| 1 | `detector.ts` | L61 | `createDetector` 缺少 JSDoc | TS-11 |
| 2 | `semantic-detector.ts` | L212 | `createSemanticDetector` 缺少 JSDoc | TS-11 |
| 3 | `sandbox.ts` | L936, L950 | `createSandboxManager`、`createSandbox` 缺少 JSDoc | TS-11 |
| 4 | `worktree-manager.ts` | L33, L81 | `createSandbox`、`teardownSandbox` 缺少 JSDoc | TS-11 |
| 5 | `memory-monitor.ts` | L1 | `MemoryMonitor` 类缺少 JSDoc | TS-11 |
| 6 | `sandbox.ts` | L285-L345 | `testSudo`、`testBwrapSudo`、`testUnshareSudo` 模式重复，可提取通用函数 | G-03 |
| 7 | `memory-monitor.test.ts` | - | 缺少 overflow handler 触发的集成测试 | G-04 |
| 8 | `sandbox.ts` | L460 | 错误信息 `'签名无效或已过期'` 未包含具体命令信息 | G-06 |

## 改进建议

### 短期改进（1-2 周）

1. **删除 `interfaces.ts` 死代码**：该文件完全未被使用，类型在 `sandbox.ts` 和 `semantic-detector.ts` 中已重新定义。删除后统一类型来源到 `src/types/index.ts` 或各实现文件
2. **为 `SandboxManager` 添加直接测试**：创建 `sandbox-manager.test.ts`，覆盖 `exec`（各模式）、`checkSudoStatus`、`signCommand`/`validateCommandSignature`、`verifyCommandExecutable` 等核心方法
3. **修复导入风格一致性**：`sandbox.ts` 的标准库导入统一使用 `node:` 前缀，按标准库/第三方/内部分组
4. **为 7 个缺失 JSDoc 的顶层导出添加文档**

### 中期改进（1-2 月）

1. **拆分 `sandbox.ts` "上帝文件"**：建议拆分为：
   - `sandbox-manager.ts`：核心 SandboxManager 类（exec、executeInSandbox）
   - `isolation-strategies.ts`：4 种隔离策略（sandbox-exec、unshare、bubblewrap、directory）
   - `command-signer.ts`：命令签名和验证（signCommand、validateCommandSignature）
   - `executable-verifier.ts`：可执行文件验证（verifyCommandExecutable、resolveCommandPath、computeFileHash）
   - `sudo-checker.ts`：sudo 状态检查（checkSudoStatus、testSudo、testBwrapSudo、testUnshareSudo）
2. **提取通用执行器消除 4 个 exec 方法的重复**：创建 `executeInIsolation(strategy, cmd, args, options, cwd, env)` 通用方法
3. **修复 `createSandbox` 的封装破坏**：将 `manager['detector']` 改为通过公共 API 访问，或在 SandboxManager 上暴露必要的检测方法
4. **清理 `index.ts` 的跨模块重导出**：移除对 `security-protocol` 的重导出，让消费方直接 import

### 长期改进（3-6 月）

1. **引入策略模式重构隔离执行**：将 4 种隔离策略抽象为 `IsolationStrategy` 接口，每种策略实现为独立类，通过工厂选择
2. **建立模块边界规范**：明确 sandbox 模块不应代理其他模块的导出，建立模块门面的使用规范
3. **增加 memory-monitor 的集成测试**：测试 overflow handler 在内存压力下的实际触发行为

## 标杆亮点

1. **依赖注入设计**：`SandboxManagerDeps` 接口（`sandbox.ts`:L98-L107）允许自定义替换 detector、ruleEngine、audit、securityGuard，可测试性优秀
2. **零 `any` 类型**：全模块 1,686 行源码无一处 `any` 使用，类型安全执行到位
3. **完善的语义检测器**：`semantic-detector.ts` 覆盖中英文双语 prompt injection 检测（12 种模式）和 16 种语义危险命令模式，安全防护全面
4. **多层降级策略**：隔离策略从 sandbox-exec → bubblewrap → unshare → directory 逐级降级，worktree-manager 从 git worktree 降级到 fs.cp，确保在各种环境下都能工作
5. **timing-safe 比较**：`validateCommandSignature`（`sandbox.ts`:L463-L466）使用 `timingSafeEqual` 防止时序攻击，安全意识良好
