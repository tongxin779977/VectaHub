# VectaHub UAT Test Report

> 注释：用户验收测试报告。记录了各项测试用例的执行结果及发现的问题。

## 1. Summary (执行摘要)
- **Execution Date**: 2026-05-07
- **Total Test Cases**: 9
- **Executed**: 8
- **Passed**: 8 (After Batch 1 & 2 Fixes)
- **Failed**: 0
- **Status**: **ALL IDENTIFIED BUGS RESOLVED**

## 2. Test Execution Details (详细执行记录)

### FT-03: YAML Engine - Complex Workflow
- **Status**: PASS
- **Verdict**: Parallel steps now correctly aggregate and display their dry-run output.
- **Evidence**: 
  ```bash
  run-parallel-tests: COMPLETED
  输出:
    [DRY RUN] Would execute: echo Running Parallel Test 1
    [DRY RUN] Would execute: echo Running Parallel Test 2
  ```

### ST-02: Security - Relaxed Mode
- **Status**: PASS
- **Verdict**: LLM connection is stable (no 404), and intent extraction is accurate.
- **Evidence**:
  ```bash
  [LLM DEBUG] Calling API: https://token.sensenova.cn/v1/chat/completions (Normalized)
  [DRY RUN] Would execute: npm install -g lodash
  ```

### ST-03: Security - Consensus Mode
- **Status**: PASS
- **Verdict**: Correctly handles high-risk operations with user checkpoint.

### AT-02: AI - Confidence Handling
- **Status**: PASS
- **Verdict**: System correctly rejects low-confidence matches.

## 3. Fixed Issues Log (已修复问题记录)
> 注释：Batch 2 缺陷修复验证完成。

| Issue ID | Severity | Status | Fix Description |
|----------|----------|--------|-----------------|
| **BUG-004** | **Medium** | FIXED | 重构了 `executor.ts` 中的干跑 (dry-run) 逻辑与输出聚合，支持并行步骤展示。 |
| **BUG-005** | **Low** | FIXED | 优化了 `command-synthesizer.ts` 中的正则提取，支持带 Flag 的包安装。 |
| **BUG-006** | **Critical** | FIXED | 在 `dialog-controller.ts` 中增加了 LLM BaseURL 归一化逻辑，解决了双后缀 404 问题。 |

---
```yaml
version: 1.4.0
status: Completed
```
