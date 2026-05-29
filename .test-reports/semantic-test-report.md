# Semantic Output Test Report

**Date**: 2026-05-29 17:24:33
**Branch**: feat/llm-self-bootstrap

## Summary

| Metric | Count |
|--------|-------|
| Total | 35 |
| Pass | 29 |
| Expected Fail | 6 (known bugs) |
| Unexpected Fail | 0 |
| Skip | 0 |
| Pass Rate | 100% (29/29, excl. expected_fail and skip) |

## Results

| Status | Test | Detail |
|--------|------|--------|
| ✅ | A: version --json | ok, has version |
| ✅ | A: doctor --json | ok, has ok |
| ✅ | A: tools list --json | ok, has ok |
| ✅ | A: tools agents --json | ok, has ok |
| ✅ | A: provider list --json | ok, has ok |
| ✅ | A: security test --json | ok, has ok |
| ✅ | A: trace list --json | ok, has ok |
| ✅ | A: doc-task-runs list --json | ok, has ok |
| ✅ | A: queue list --json | ok, has ok |
| ✅ | A: run-command --json pwd | ok, has ok |
| ✅ | A: run-command --json echo hello | ok, has output |
| ✅ | A: run-command --json ls | ok, has ok |
| ✅ | B: pwd output contains path | output contains '/' |
| ✅ | B: echo hello output | output contains 'hello' |
| ✅ | B: echo 42 output | output contains '42' |
| ✅ | B: ls output contains src | output contains 'src' |
| ✅ | B: whoami output | output contains username |
| ✅ | B: doctor checks non-empty | checks array has items |
| ✅ | B: tools list non-empty | tools array has items |
| ✅ | B: security test dangerous | isDangerous=true for rm -rf / |
| ✅ | B: security test safe | isDangerous=false for ls |
| ✅ | C: run --file nonexistent | non-zero exit (1) |
| ✅ | C: mode invalid | non-zero exit (1) |
| ✅ | C: run-command nonexistent | non-zero exit (1) |
| ✅ | C: verify --type invalid | non-zero exit (1) |
| ✅ | C: run no input | non-zero exit (1) |
| ⚠️ | D: git status | UNKNOWN intent, no steps (known P1/P2 bug) |
| ⚠️ | D: list files (CN) | exit 1 (known bug) |
| ⚠️ | D: find ts files (CN) | UNKNOWN intent, no steps (known P1/P2 bug) |
| ⚠️ | D: hello chat | UNKNOWN intent, no steps (known P1/P2 bug) |
| ⚠️ | D: pwd command | UNKNOWN intent, no steps (known P1/P2 bug) |
| ⚠️ | D: echo command | UNKNOWN intent, no steps (known P1/P2 bug) |
| ✅ | E: pwd no hallucination | no hallucination detected |
| ✅ | E: echo no hallucination | no hallucination detected |
| ✅ | E: ls no hallucination | no hallucination detected |

## Known Defects (Expected Failures)

| ID | Level | Description | Status |
|----|-------|-------------|--------|
| P0 | Critical | nl-processor-tool-calling prompt not in BUILTIN_PROMPTS | EXPECTED_FAIL |
| P1 | High | pwd/ls/echo → domains=[] → empty tools | EXPECTED_FAIL |
| P2 | Medium | No generic shell command intent type | EXPECTED_FAIL |

## Notes

- Group A (JSON Structure), B (Content), C (Error Handling): non-LLM, must pass
- Group D (NL Intent), E (Hallucination): requires LLM configured
- EXPECTED_FAIL = known bug, current behavior matches expected failure
- When a bug is fixed, EXPECTED_FAIL tests will show PASS (indicating the fix works)
