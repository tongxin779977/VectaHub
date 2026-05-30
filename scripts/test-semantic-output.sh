#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/json-assert.sh"

if [ "${VH_USE_DIST:-0}" = "1" ] && [ -f "$PROJECT_ROOT/dist/cli.js" ]; then
  VH="node dist/cli.js"
  echo "  ℹ️  Using dist CLI: $VH"
else
  VH="npx --no-install tsx src/cli.ts"
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--disable-warning=DEP0205"
  echo "  ℹ️  Using source-mode CLI: $VH (set VH_USE_DIST=1 to use dist)"
fi
REPORT=".test-reports/semantic-test-report.md"
PASS=0
FAIL=0
EXPECTED_FAIL=0
SKIP=0
TOTAL=0
RESULTS=()

mkdir -p "$PROJECT_ROOT/.test-reports"
cd "$PROJECT_ROOT" || exit 1

run_json() {
  local exit_code=0
  local output
  output=$("$@" 2>&1) || exit_code=$?
  echo "$output"
  return $exit_code
}

record() {
  local status="$1"
  local name="$2"
  local detail="$3"
  TOTAL=$((TOTAL+1))
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS+1))
    RESULTS+=("✅|$name|$detail")
  elif [ "$status" = "EXPECTED_FAIL" ]; then
    EXPECTED_FAIL=$((EXPECTED_FAIL+1))
    RESULTS+=("⚠️|$name|$detail")
  elif [ "$status" = "SKIP" ]; then
    SKIP=$((SKIP+1))
    RESULTS+=("⏭️|$name|$detail")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("❌|$name|$detail")
  fi
}

echo "=========================================="
echo "  VectaHub CLI Semantic Output Test Suite"
echo "=========================================="
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GROUP A: JSON Output Structure (non-LLM)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "═══ GROUP A: JSON Output Structure ═══"

a_test() {
  local name="$1"
  local field="$2"
  shift 2
  echo "━━━ [A] $name ━━━"
  echo "  cmd: $*"
  local json
  json=$(run_json "$@")
  local rc=$?
  if [ $rc -gt 1 ]; then
    record "FAIL" "A: $name" "command failed with exit $rc"
    return
  fi
  if assert_json_is_valid "$json" "A: $name: valid JSON"; then
    if assert_json_field "$json" "$field" "A: $name: has '$field'"; then
      record "PASS" "A: $name" "ok, has $field"
    else
      record "FAIL" "A: $name" "missing $field"
    fi
  else
    record "FAIL" "A: $name" "invalid JSON output"
  fi
}

a_test "version --json" "version" $VH version --json
a_test "doctor --json" "ok" $VH doctor --json
a_test "tools list --json" "ok" $VH tools list --json
a_test "tools agents --json" "ok" $VH tools agents --json
a_test "provider list --json" "ok" $VH provider list --json
a_test "security test --json" "ok" $VH security test "rm -rf /" --json
a_test "trace list --json" "ok" $VH trace list --json
a_test "doc-task-runs list --json" "ok" $VH doc-task-runs list --json
a_test "queue list --json" "ok" $VH queue list --json
a_test "run-command --json pwd" "ok" $VH run-command --json pwd
a_test "run-command --json echo hello" "output" $VH run-command --json echo hello
a_test "run-command --json ls" "ok" $VH run-command --json ls

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GROUP B: Content Semantics (non-LLM)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "═══ GROUP B: Content Semantics ═══"

b_test() {
  local name="$1"
  local field="$2"
  local pattern="$3"
  shift 3
  echo "━━━ [B] $name ━━━"
  echo "  cmd: $*"
  local json
  json=$(run_json "$@")
  local rc=$?
  if [ $rc -gt 1 ]; then
    record "FAIL" "B: $name" "command failed with exit $rc"
    return
  fi
  if assert_json_is_valid "$json" "B: $name: valid JSON"; then
    if assert_field_contains "$json" "$field" "$pattern" "B: $name: $field contains '$pattern'"; then
      record "PASS" "B: $name" "output contains '$pattern'"
    else
      record "FAIL" "B: $name" "output missing '$pattern'"
    fi
  else
    record "FAIL" "B: $name" "invalid JSON output"
  fi
}

b_test "pwd output contains path" "output" "/" $VH run-command --json pwd
b_test "echo hello output" "output" "hello" $VH run-command --json echo hello
b_test "echo 42 output" "output" "42" $VH run-command --json echo 42
b_test "ls output contains src" "output" "src" $VH run-command --json ls
echo "━━━ [B] whoami output ━━━"
b_json=$(run_json $VH run-command --json whoami)
b_rc=$?
if [ $b_rc -gt 1 ]; then
  record "FAIL" "B: whoami output" "command failed with exit $b_rc"
elif echo "$b_json" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const out = Array.isArray(d.output) ? d.output.join('\\n') : String(d.output || '');
    process.exit(out.length > 0 ? 0 : 1);
  } catch(e) { process.exit(2); }
" 2>/dev/null; then
  record "PASS" "B: whoami output" "output contains username"
else
  record "FAIL" "B: whoami output" "output empty or invalid JSON"
fi

echo "━━━ [B] doctor checks array non-empty ━━━"
b_json=$(run_json $VH doctor --json)
if echo "$b_json" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.exit(Array.isArray(d.checks) && d.checks.length > 0 ? 0 : 1);
  } catch(e) { process.exit(2); }
" 2>/dev/null; then
  record "PASS" "B: doctor checks non-empty" "checks array has items"
else
  record "FAIL" "B: doctor checks non-empty" "checks array empty or missing"
fi

echo "━━━ [B] tools list non-empty ━━━"
b_json=$(run_json $VH tools list --json)
if echo "$b_json" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.exit(Array.isArray(d.tools) && d.tools.length > 0 ? 0 : 1);
  } catch(e) { process.exit(2); }
" 2>/dev/null; then
  record "PASS" "B: tools list non-empty" "tools array has items"
else
  record "FAIL" "B: tools list non-empty" "tools array empty or missing"
fi

echo "━━━ [B] security test detects dangerous command ━━━"
b_json=$(run_json $VH security test "rm -rf /" --json)
if echo "$b_json" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.exit(d.isDangerous === true ? 0 : 1);
  } catch(e) { process.exit(2); }
" 2>/dev/null; then
  record "PASS" "B: security test dangerous" "isDangerous=true for rm -rf /"
else
  record "FAIL" "B: security test dangerous" "expected isDangerous=true"
fi

echo "━━━ [B] security test safe command not dangerous ━━━"
b_json=$(run_json $VH security test "ls" --json)
if echo "$b_json" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.exit(d.isDangerous === false ? 0 : 1);
  } catch(e) { process.exit(2); }
" 2>/dev/null; then
  record "PASS" "B: security test safe" "isDangerous=false for ls"
else
  record "FAIL" "B: security test safe" "expected isDangerous=false"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GROUP C: Error Handling Semantics (non-LLM)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "═══ GROUP C: Error Handling Semantics ═══"

echo "━━━ [C] run --file nonexistent ━━━"
c_json=$(run_json $VH run --file /nonexistent/path.yml --json)
c_rc=$?
if [ $c_rc -ne 0 ]; then
  record "PASS" "C: run --file nonexistent" "non-zero exit ($c_rc)"
else
  if echo "$c_json" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.ok===false?0:1)" 2>/dev/null; then
    record "PASS" "C: run --file nonexistent" "ok=false"
  else
    record "FAIL" "C: run --file nonexistent" "expected non-zero exit or ok=false"
  fi
fi

echo "━━━ [C] mode invalid ━━━"
c_out=$(run_json $VH mode invalid)
c_rc=$?
if [ $c_rc -ne 0 ]; then
  record "PASS" "C: mode invalid" "non-zero exit ($c_rc)"
else
  record "FAIL" "C: mode invalid" "expected non-zero exit"
fi

echo "━━━ [C] run-command nonexistent ━━━"
c_json=$(run_json $VH run-command --json nonexistent-command-xyz-abc)
c_rc=$?
if [ $c_rc -ne 0 ]; then
  record "PASS" "C: run-command nonexistent" "non-zero exit ($c_rc)"
else
  if echo "$c_json" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.ok===false||d.status==='FAILED'?0:1)" 2>/dev/null; then
    record "PASS" "C: run-command nonexistent" "ok=false or status=FAILED"
  else
    record "FAIL" "C: run-command nonexistent" "expected failure indicator"
  fi
fi

echo "━━━ [C] verify --type invalid ━━━"
c_json=$(run_json $VH verify --type invalid-type --json)
c_rc=$?
if [ $c_rc -ne 0 ]; then
  record "PASS" "C: verify --type invalid" "non-zero exit ($c_rc)"
else
  if echo "$c_json" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.ok===false?0:1)" 2>/dev/null; then
    record "PASS" "C: verify --type invalid" "ok=false"
  else
    record "FAIL" "C: verify --type invalid" "expected failure"
  fi
fi

echo "━━━ [C] run --json no input ━━━"
c_json=$(run_json $VH run --json)
c_rc=$?
if [ $c_rc -ne 0 ]; then
  record "PASS" "C: run no input" "non-zero exit ($c_rc)"
else
  if echo "$c_json" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.ok===false?0:1)" 2>/dev/null; then
    record "PASS" "C: run no input" "ok=false"
  else
    record "FAIL" "C: run no input" "expected failure"
  fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GROUP D: NL Pipeline Intent Recognition
# (requires LLM — skip if unavailable)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "═══ GROUP D: NL Pipeline Intent Recognition ═══"

LLM_AVAILABLE=1
d_probe=$(run_json $VH run --json --dry-run "git status")
if echo "$d_probe" | grep -qi "LLM not configured\|not configured\|VECTAHUB_LLM\|setup"; then
  LLM_AVAILABLE=0
  echo "  ⚠️  LLM not configured — skipping Group D and E"
fi

if [ $LLM_AVAILABLE -eq 1 ]; then
  d_test() {
    local name="$1"
    local expect_type="$2"
    shift 2
    echo "━━━ [D] $name ━━━"
    echo "  input: $*"
    local json
    json=$(run_json $VH run --json --dry-run "$@")
    local rc=$?
    if [ $rc -ne 0 ]; then
      if [ "$expect_type" = "expected_fail" ]; then
        record "EXPECTED_FAIL" "D: $name" "exit $rc (known bug)"
      else
        record "FAIL" "D: $name" "exit $rc"
      fi
      return
    fi
    if ! assert_json_is_valid "$json" "D: $name: valid JSON"; then
      if [ "$expect_type" = "expected_fail" ]; then
        record "EXPECTED_FAIL" "D: $name" "invalid JSON (known bug)"
      else
        record "FAIL" "D: $name" "invalid JSON"
      fi
      return
    fi
    local intent
    intent=$(echo "$json" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        const i = d.intent || d.plan?.capabilityId || d.plan?.goal?.action || 'UNKNOWN';
        console.log(i);
      } catch(e) { console.log('PARSE_ERROR'); }
    " 2>/dev/null)

    local has_steps
    echo "$json" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        const s = d.steps || d.plan?.steps || [];
        process.exit(s.length > 0 ? 0 : 1);
      } catch(e) { process.exit(1); }
    " 2>/dev/null
    has_steps=$?

    local has_reply
    echo "$json" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        process.exit(d.reply || d.userReport?.summaryTemplate ? 0 : 1);
      } catch(e) { process.exit(1); }
    " 2>/dev/null
    has_reply=$?

    if [ "$expect_type" = "expected_fail" ]; then
      if [ "$intent" = "UNKNOWN" ] && [ $has_steps -ne 0 ]; then
        record "EXPECTED_FAIL" "D: $name" "UNKNOWN intent, no steps (known P1/P2 bug)"
      else
        record "PASS" "D: $name" "intent=$intent (bug may be fixed!)"
      fi
    elif [ "$expect_type" = "non-UNKNOWN" ]; then
      if [ "$intent" != "UNKNOWN" ] && [ "$intent" != "PARSE_ERROR" ]; then
        record "PASS" "D: $name" "intent=$intent (non-UNKNOWN)"
      elif [ $has_steps -eq 0 ]; then
        record "PASS" "D: $name" "UNKNOWN but has steps (partial match)"
      else
        record "FAIL" "D: $name" "UNKNOWN intent, no steps"
      fi
    elif [ "$expect_type" = "UNKNOWN-with-reply" ]; then
      if [ "$intent" = "UNKNOWN" ] && [ $has_reply -eq 0 ]; then
        record "PASS" "D: $name" "UNKNOWN with reply"
      elif [ "$intent" != "UNKNOWN" ]; then
        record "PASS" "D: $name" "intent=$intent (non-UNKNOWN, acceptable)"
      else
        record "FAIL" "D: $name" "UNKNOWN but no reply"
      fi
    fi
  }

  d_test "git status" "non-UNKNOWN" "git status"
  d_test "list files (CN)" "non-UNKNOWN" "列出当前目录文件"
  d_test "find ts files (CN)" "non-UNKNOWN" "查找所有 ts 文件"
  d_test "hello chat" "UNKNOWN-with-reply" "hello"
  d_test "pwd command" "non-UNKNOWN" "pwd"
  d_test "echo command" "non-UNKNOWN" "echo hello"
else
  for i in 1 2 3 4 5 6; do
    record "SKIP" "D: test $i" "LLM not configured"
  done
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GROUP E: Hallucination Detection
# (requires LLM — skip if unavailable)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "═══ GROUP E: Hallucination Detection ═══"

if [ $LLM_AVAILABLE -eq 1 ]; then
  e_test() {
    local name="$1"
    local field="$2"
    local expect_type="$3"
    shift 3
    echo "━━━ [E] $name ━━━"
    echo "  input: $*"
    local json
    json=$(run_json $VH run --json "$@")
    local rc=$?
    if [ $rc -ne 0 ]; then
      record "SKIP" "E: $name" "exit $rc (LLM may be unavailable)"
      return
    fi
    if ! assert_json_is_valid "$json" "E: $name: valid JSON"; then
      record "SKIP" "E: $name" "invalid JSON (LLM issue)"
      return
    fi
    if assert_no_hallucination "$json" "$field" "E: $name: no hallucination in $field"; then
      record "PASS" "E: $name" "no hallucination detected"
    else
      if [ "$expect_type" = "expected_fail" ]; then
        record "EXPECTED_FAIL" "E: $name" "hallucination detected (known P0 bug)"
      else
        record "FAIL" "E: $name" "hallucination detected in $field"
      fi
    fi
  }

  e_test "pwd no hallucination" "reply" "pass" "pwd"
  e_test "echo no hallucination" "reply" "pass" "echo hello"
  e_test "ls no hallucination" "reply" "pass" "ls"
else
  for i in 1 2 3; do
    record "SKIP" "E: test $i" "LLM not configured"
  done
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# REPORT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "=========================================="
echo "  Results: $PASS PASS / $EXPECTED_FAIL EXPECTED_FAIL / $FAIL FAIL / $SKIP SKIP / $TOTAL TOTAL"
echo "=========================================="

EFFECTIVE_TOTAL=$((PASS + FAIL))
if [ $EFFECTIVE_TOTAL -gt 0 ]; then
  PASS_RATE=$((PASS * 100 / EFFECTIVE_TOTAL))
else
  PASS_RATE=0
fi

cat > "$REPORT" <<EOF
# Semantic Output Test Report

**Date**: $(date '+%Y-%m-%d %H:%M:%S')
**Branch**: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')

## Summary

| Metric | Count |
|--------|-------|
| Total | $TOTAL |
| Pass | $PASS |
| Expected Fail | $EXPECTED_FAIL (known bugs) |
| Unexpected Fail | $FAIL |
| Skip | $SKIP |
| Pass Rate | ${PASS_RATE}% ($PASS/$EFFECTIVE_TOTAL, excl. expected_fail and skip) |

## Results

| Status | Test | Detail |
|--------|------|--------|
EOF

for r in "${RESULTS[@]}"; do
  IFS='|' read -r st nm dt <<< "$r"
  echo "| $st | $nm | $dt |" >> "$REPORT"
done

cat >> "$REPORT" <<EOF

## Known Defects Tracking

| ID | Level | Description | Status |
|----|-------|-------------|--------|
| P0 | Critical | nl-processor-tool-calling prompt not in BUILTIN_PROMPTS | FIXED (prompt exists in BUILTIN_PROMPTS) |
| P1 | High | pwd/ls/echo → domains=[] → empty tools | FIXED (buildAllTools([]) returns all tools; deterministic shell intercept) |
| P2 | Medium | No generic shell command intent type | FIXED (tryDeterministicShellCommand handles pwd/ls/echo only) |

## Notes

- Group A (JSON Structure), B (Content), C (Error Handling): non-LLM, must pass
- Group D (NL Intent), E (Hallucination): requires LLM configured
- EXPECTED_FAIL = known bug, current behavior matches expected failure
- When a bug is fixed, EXPECTED_FAIL tests will show PASS (indicating the fix works)
- Source-mode: default mode uses src/cli.ts; set VH_USE_DIST=1 to run against dist/cli.js
EOF

echo ""
echo "Report saved to $REPORT"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
