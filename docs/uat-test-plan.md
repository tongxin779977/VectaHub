# VectaHub User Acceptance Test (UAT) Plan

> 注释：用户验收测试计划。旨在全面验证 VectaHub 的核心功能、安全性以及 AI 意图识别的准确性。

## 1. Test Objectives (测试目标)
- Verify that Natural Language (NL) inputs correctly trigger the intended workflows.
- Validate the YAML workflow engine's execution logic, including conditional and parallel steps.
- Ensure the Security Sandbox effectively blocks dangerous operations across different modes.
- Assess the stability of the Chat REPL and session management.

## 2. Test Scope (测试范围)

### 2.1 Functional Testing (功能测试)
| ID | Module | Scenario | Expected Outcome |
|----|--------|----------|------------------|
| FT-01 | NL Execution | Run "Find all .ts files" | Correct list of files returned |
| FT-02 | NL Execution | Run "Commit changes with message 'test'" | Git status/commit executed successfully |
| FT-03 | YAML Engine | Run `-f daily-check.yaml` | Sequential/Parallel steps execute as defined |
| FT-04 | Chat REPL | Multi-turn: "Check status" -> "Commit them" | Context-aware execution of the second command |
| FT-05 | Setup/Config | `vectahub setup` & `config get` | Configuration persists and is retrievable |

### 2.2 Security Testing (安全测试)
| ID | Mode | Input | Expected Outcome |
|----|------|-------|------------------|
| ST-01 | Strict | `rm -rf /` | Blocked immediately with critical alert |
| ST-02 | Relaxed | `npm install -g lodash` | Allowed (with warning/audit log) |
| ST-03 | Consensus | `sudo systemctl stop` | Restated and paused for user confirmation |

### 2.3 AI & Intent Testing (AI 与意图测试)
| ID | Feature | Scenario | Expected Outcome |
|----|---------|----------|------------------|
| AT-01 | Keyword Fallback | Run "xxx-not-real" (No LLM) | Fallback to UNKNOWN or prompt for clarification |
| AT-02 | Confidence | Run ambiguous command | Confidence score < 60, triggers refinement |

## 3. Test Environment (测试环境)
- **OS**: Darwin (macOS)
- **Runtime**: Node.js >= 21.0.0
- **Workspace**: `/Users/xin.tong/apps/project/test_trae/VectaHub`

## 4. Issue Recording Protocol (问题记录协议)
> 注释：严格执行“记录不修复”原则。所有缺陷将记录在 `uat-test-report.md` 中。
- **Status**: PASS / FAIL / BLOCKED
- **Severity**: Low / Medium / High / Critical
- **Evidence**: Raw terminal output or error logs.

---
```yaml
version: 1.0.0
owner: Google Senior AI Engineer
status: Draft
```
