# Semantic Output Test Report

**Date**: 2026-05-29 23:45:41
**Branch**: feat/llm-self-bootstrap

## Summary

| Metric | Count |
|--------|-------|
| Total | 35 |
| Pass | 35 |
| Expected Fail | 0 (known bugs) |
| Unexpected Fail | 0 |
| Skip | 0 |
| Pass Rate | 100% (35/35, excl. expected_fail and skip) |

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
| ✅ | D: git status | intent=git-workflow (non-UNKNOWN) |
| ✅ | D: list files (CN) | UNKNOWN but has steps (partial match) |
| ✅ | D: find ts files (CN) | UNKNOWN but has steps (partial match) |
| ✅ | D: hello chat | UNKNOWN with reply |
| ✅ | D: pwd command | UNKNOWN but has steps (partial match) |
| ✅ | D: echo command | UNKNOWN but has steps (partial match) |
| ✅ | E: pwd no hallucination | no hallucination detected |
| ✅ | E: echo no hallucination | no hallucination detected |
| ✅ | E: ls no hallucination | no hallucination detected |

## Known Defects Tracking

| ID | Level | Description | Status |
|----|-------|-------------|--------|
| P0 | Critical | nl-processor-tool-calling prompt not in BUILTIN_PROMPTS | FIXED (prompt exists in BUILTIN_PROMPTS) |
| P1 | High | pwd/ls/echo → domains=[] → empty tools | FIXED (buildAllTools([]) returns all tools; deterministic shell intercept) |
| P2 | Medium | No generic shell command intent type | FIXED (tryDeterministicShellCommand handles pwd/ls/echo/cat/etc.) |

## Notes

- Group A (JSON Structure), B (Content), C (Error Handling): non-LLM, must pass
- Group D (NL Intent), E (Hallucination): requires LLM configured
- EXPECTED_FAIL = known bug, current behavior matches expected failure
- When a bug is fixed, EXPECTED_FAIL tests will show PASS (indicating the fix works)
- Source-mode: default mode uses src/cli.ts; set VH_USE_DIST=1 to run against dist/cli.js
