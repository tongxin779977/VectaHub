# ISSUES-001: E2E 测试发现的关注问题

> Status: open
> Priority: P2-P3
> Source: E2E Test T1-T7
> Discovered: 2026-06-08

## 概述

端到端测试中发现的非 Bug 但需关注的问题，按模块分类。

---

## T2: Workflow 核心流程

### ISSUE-T2-01: `list versions` 始终为空 ✅

- **现象**: 所有工作流的版本历史均为空
- **影响**: 版本管理功能可能未启用或未实现
- **建议**: 确认版本管理是否为已实现功能，若是则排查写入逻辑
- **状态**: 已修复 (2026-06-08)
- **根因**: `saveWorkflow()` 写入工作流文件后未调用 `saveVersion()`，导致版本记录从未被创建。`listVersions()` 逻辑正确但无数据可读。
- **修复**: 在 `storage.saveWorkflow()` 中写入文件后调用 `saveVersion()`，自动为每次保存创建版本记录。JSON 格式保存时版本内容仍为 YAML（与版本系统一致）。
- **变更文件**: `src/workflow/storage.ts`, `src/workflow/storage.test.ts`
- **验证**: typecheck 通过，storage + versioning 26 个测试全部通过（含 3 个新增版本集成测试），engine + templates 49 个测试无回归

### ISSUE-T2-02: 执行模式无差异 ✅

- **现象**: `strict`/`relaxed`/`consensus` 三种执行模式在 `--dry-run` 中输出完全一致
- **影响**: 用户无法通过 dry-run 了解不同模式的执行差异
- **建议**: 在 dry-run 输出中标注模式差异（如确认步骤、安全检查级别等）
- **状态**: 已修复 (2026-06-08)
- **修复**: dry-run 输出中包含 `mode` 字段和模式行为描述；JSON envelope 添加 `mode` 字段；文本输出显示模式名称和说明
- **变更文件**: `src/commands/run-dry-run-envelope.ts`, `src/commands/run.ts`, `src/commands/run-dry-run-envelope.test.ts`, `src/commands/run.dry-run.test.ts`
- **验证**: typecheck 通过，34 个测试全部通过（含 11 个新增测试），431 个相关测试无回归

### ISSUE-T2-03: `verify --type coverage` 语义矛盾 ✅

- **现象**: Coverage 不可用时 VERDICT 为 PASS
- **影响**: 用户可能误以为覆盖率检查通过
- **建议**: Coverage 不可用时 VERDICT 应为 WARN 或 SKIP
- **状态**: 已修复 (2026-06-08)
- **修复**: `VerifyReport.verdict` 类型增加 `'WARN'`；判定逻辑改为有 fail→FAIL，有 warn（无 fail）→WARN，否则→PASS
- **变更文件**: `src/commands/verify.ts`, `src/commands/verify.test.ts`
- **验证**: typecheck 通过，9 个测试全部通过

---

## T3: 执行记录管理

### ISSUE-T3-01: `detail --step` Command 字段为 undefined ✅

- **现象**: 步骤详情中 `Command: undefined`
- **影响**: 无法查看步骤执行的具体命令
- **关联**: BUG-P1-003（workflowId 为 undefined），可能同根因
- **状态**: 已修复 (2026-06-08)
- **修复**: BUG-P1-003 添加了 `normalizeStepRecord` 函数，将 `StepRecord.command` 映射到 `StepExecution` 字段
- **变更文件**: `src/commands/run.ts`, `src/types/workflow.ts`
- **验证**: typecheck 通过，104 个测试全部通过

---

## T4: 安全与审计

### ISSUE-T4-01: audit 写入失败时 ERROR 级别过高 ✅

- **现象**: 审计日志写入失败（EPERM）时以 ERROR 级别输出，每次命令执行都有多条 ERROR 日志
- **影响**: 干扰正常输出，用户可能误以为命令执行失败
- **建议**: 审计写入失败应降级为 WARN 或 DEBUG 级别
- **状态**: 已修复 (2026-06-08)
- **修复**: 将 audit 写入失败相关日志从 `error` 降级为 `warn`
- **变更文件**: `src/infrastructure/context.ts`, `src/infrastructure/trace-audit/async-writer.ts`, `src/infrastructure/audit/service.test.ts`, `src/infrastructure/trace-audit/async-writer.test.ts`
- **验证**: typecheck 通过，22 个测试全部通过（含 2 个新增日志级别验证测试）

---

## T5: 日志系统

### ISSUE-T5-01: app/error 日志文件为空 ✅

- **现象**: `~/.vectahub/logs/app/2026-05-29.log` 和 `~/.vectahub/logs/error/2026-05-29.json` 均为 0 字节
- **影响**: 应用日志和错误日志可能未正确写入
- **建议**: 排查 app logger 和 error logger 的写入逻辑
- **状态**: 已修复 (2026-06-08)
- **根因**: `LoggerService.getLogger()` 始终调用 `createConsoleLogger()`（仅写 stderr），从不调用 `createFileLogger()`（写文件），导致 app/error 日志文件从未被写入
- **修复**: 修改 `getLogger()` 优先使用 `createFileLogger()`，失败时回退到 `createConsoleLogger()`；修改 `createFileLogger()` 在开发环境使用 pino-pretty + 文件输出，生产环境使用 pino/file + 文件输出，console 目标从 stdout 改为 stderr
- **变更文件**: `src/infrastructure/logger/service.ts`, `src/infrastructure/logger/service.test.ts` (新增)
- **验证**: typecheck 通过，5 个新增测试全部通过，139 个 infrastructure 测试无回归

### ISSUE-T5-02: 项目级日志路径未实际使用

- **现象**: 代码已支持 `getProjectLogDir()` 和 DI 注入 `projectRoot`，但 CLI 运行时未传入 projectRoot，所有日志仍写全局目录
- **影响**: 多项目场景下日志无法隔离
- **建议**: CLI 入口处检测当前项目目录并传入 projectRoot

---

## T7: 工具与模板

### ISSUE-T7-01: `tools known` 描述全部为 undefined ✅

- **现象**: 10 个已知工具的描述字段全部显示 `undefined`
- **影响**: 用户无法了解工具用途
- **建议**: 补充工具描述信息
- **状态**: 已修复 (2026-06-08)
- **修复**: 为 `KNOWN_TOOLS` 中 10 个工具添加 `description` 字段
- **变更文件**: `src/cli-tools/discovery/known-tools.ts`, `src/cli-tools/discovery/known-tools.test.ts` (新增)
- **验证**: typecheck 通过，3 个新增测试全部通过，150 个相关测试无回归

### ISSUE-T7-02: `import --dry-run` 参数风格不一致 ✅

- **现象**: `import` 使用 `--no-dry-run` 执行实际导入，而其他命令（`run`、`run-command`）用 `--dry-run` 预览
- **影响**: 参数风格不一致，用户需记忆不同命令的不同参数
- **建议**: 统一为 `--dry-run` 预览模式
- **状态**: 已修复 (2026-06-08)
- **修复**: 将 dry-run 模式下的提示信息从 `使用 --no-dry-run 执行实际导入` 改为 `去掉 --dry-run 参数以执行实际导入`，与其他命令的 UX 风格一致
- **变更文件**: `src/commands/export.ts`, `src/commands/export.test.ts`
- **验证**: typecheck 通过，5 个测试全部通过（含 1 个新增选项一致性测试）
