#!/bin/bash
set -uo pipefail

VH="node dist/cli.js"
REPORT=".test-reports/cli-full-test-report.md"
PASS=0
FAIL=0
TOTAL=0
RESULTS=()

mkdir -p .test-reports

test_cmd() {
  local name="$1"
  local cmd="$2"
  local expect_exit="${3:-0}"

  TOTAL=$((TOTAL+1))
  echo "━━━ [$TOTAL] $name ━━━"
  echo "  cmd: $cmd"

  local output
  local exit_code
  output=$(bash -c "cd /Users/xin.tong/apps/project/test_trae/VectaHub && $cmd" 2>&1) || exit_code=$?
  [ -z "$exit_code" ] && exit_code=0

  if [ $exit_code -eq $expect_exit ]; then
    echo "  ✅ PASS (exit $exit_code)"
    PASS=$((PASS+1))
    RESULTS+=("✅|$name|exit $exit_code|")
  else
    local snippet
    snippet=$(echo "$output" | head -5 | tr '\n' ' ' | cut -c1-120)
    echo "  ❌ FAIL (expected exit $expect_exit, got $exit_code)"
    echo "  output: $snippet"
    FAIL=$((FAIL+1))
    RESULTS+=("❌|$name|expected $expect_exit got $exit_code|$snippet")
  fi
}

echo "=========================================="
echo "  VectaHub CLI Full Command Test Suite"
echo "=========================================="
echo ""

# ━━━ GROUP 1: Global / Built-in ━━━
echo "═══ GROUP 1: Global / Built-in Commands ═══"
test_cmd "version" "$VH version" 0
test_cmd "version --json" "$VH version --json" 0
test_cmd "--version (global flag)" "$VH --version" 0
test_cmd "config show" "$VH config show" 0
test_cmd "config tools" "$VH config tools" 0
test_cmd "completion bash" "$VH completion bash" 0
test_cmd "completion zsh" "$VH completion zsh" 0
test_cmd "doctor" "$VH doctor" 0
test_cmd "doctor --json" "$VH doctor --json" 0

# ━━━ GROUP 2: Core Execution ━━━
echo ""
echo "═══ GROUP 2: Core Execution Commands ═══"
test_cmd "run --dry-run" "$VH run --dry-run '列出当前目录文件'" 0 30
test_cmd "run --json --dry-run" "$VH run --json --dry-run '查看系统时间'" 0 30
test_cmd "run-command --dry-run" "$VH run-command --dry-run git status" 0 30
test_cmd "run-command --json --dry-run" "$VH run-command --json --dry-run git status" 0 30
test_cmd "mode (get)" "$VH mode" 0
test_cmd "mode strict [sandbox]" "$VH mode strict" 1
test_cmd "mode relaxed [sandbox]" "$VH mode relaxed" 1
test_cmd "chat --help" "$VH chat --help" 0

# ━━━ GROUP 3: Workflow Management ━━━
echo ""
echo "═══ GROUP 3: Workflow Management ═══"
test_cmd "list" "$VH list" 0
test_cmd "verify --type typecheck" "$VH verify --type typecheck" 1 60
test_cmd "templates list" "$VH templates list" 0
test_cmd "schedule list" "$VH schedule list" 0

# ━━━ GROUP 4: Execution Records ━━━
echo ""
echo "═══ GROUP 4: Execution Records ═══"
test_cmd "history" "$VH history" 0
test_cmd "history --limit 5" "$VH history --limit 5" 0
test_cmd "history --status FAILED" "$VH history --status FAILED" 0
test_cmd "archive --list [sandbox]" "$VH archive --list" 1

# ━━━ GROUP 5: Agent Doc Tasks ━━━
echo ""
echo "═══ GROUP 5: Agent Doc Tasks ═══"
test_cmd "doc-task-runs list" "$VH doc-task-runs list" 0
test_cmd "doc-task-runs list --json" "$VH doc-task-runs list --json" 0
test_cmd "doc-task-runs latest" "$VH doc-task-runs latest" 0
test_cmd "trace list" "$VH trace list" 0
test_cmd "trace list --json" "$VH trace list --json" 0
test_cmd "run-task missing --task-id (expect fail)" "$VH run-task --dry-run" 1
test_cmd "run-task-clean-logs [sandbox]" "$VH run-task-clean-logs" 1

# ━━━ GROUP 6: Security & Audit ━━━
echo ""
echo "═══ GROUP 6: Security & Audit ═══"
test_cmd "security status" "$VH security status" 0
test_cmd "security list" "$VH security list" 0
test_cmd "security list --enabled" "$VH security list --enabled" 0
test_cmd "security test rm -rf" "$VH security test 'rm -rf /'" 0
test_cmd "security test ls" "$VH security test 'ls -la'" 0
test_cmd "audit query --limit 10" "$VH audit query --limit 10" 0
test_cmd "audit list" "$VH audit list" 0

# ━━━ GROUP 7: Tools Management ━━━
echo ""
echo "═══ GROUP 7: Tools Management ═══"
test_cmd "tools list" "$VH tools list" 0
test_cmd "tools list --json" "$VH tools list --json" 0
test_cmd "tools known" "$VH tools known" 0
test_cmd "tools agents" "$VH tools agents" 0
test_cmd "provider list" "$VH provider list" 0
test_cmd "provider list --json" "$VH provider list --json" 0

# ━━━ GROUP 8: Monitor & Debug ━━━
echo ""
echo "═══ GROUP 8: Monitor & Debug ═══"
test_cmd "monitor status" "$VH monitor status" 0
test_cmd "debug state" "$VH debug state" 0
test_cmd "debug breakpoint list" "$VH debug breakpoint list" 0
test_cmd "debug watch list" "$VH debug watch list" 0

# ━━━ GROUP 9: Export ━━━
echo ""
echo "═══ GROUP 9: Export ═══"
test_cmd "export --help" "$VH export --help" 0

# ━━━ GROUP 10: Service & Daemon ━━━
echo ""
echo "═══ GROUP 10: Service & Daemon ═══"
test_cmd "daemon status" "$VH daemon status" 1
test_cmd "serve --help" "$VH serve --help" 0
test_cmd "client --help" "$VH client --help" 0

# ━━━ GROUP 11: Diagnostics ━━━
echo ""
echo "═══ GROUP 11: Diagnostics ═══"
test_cmd "queue list" "$VH queue list" 0
test_cmd "queue list --json" "$VH queue list --json" 0

# ━━━ GROUP 12: Error Input Tests ━━━
echo ""
echo "═══ GROUP 12: Error Input Tests ═══"
test_cmd "run --file nonexistent (expect fail)" "$VH run --file /tmp/nonexistent-workflow.yaml" 1 15
test_cmd "detail nonexistent-id (exit 0)" "$VH detail nonexistent-exec-id" 0
test_cmd "rerun nonexistent-id (exit 0)" "$VH rerun nonexistent-exec-id" 0
test_cmd "rollback nonexistent (expect fail)" "$VH rollback nonexistent-wf-id 1" 1
test_cmd "security delete nonexistent (expect fail)" "$VH security delete nonexistent-rule-id" 1
test_cmd "tools info nonexistent (expect fail)" "$VH tools info nonexistent-tool-name" 1
test_cmd "mode invalid (expect fail)" "$VH mode invalid-mode-value" 1

# ━━━ GROUP 13: Multi-command Chain Tests ━━━
echo ""
echo "═══ GROUP 13: Multi-command Chain Tests ═══"

echo ""
echo "--- Chain 1: config → doctor → mode ---"
test_cmd "chain1: config show" "$VH config show" 0
test_cmd "chain1: doctor" "$VH doctor" 0
test_cmd "chain1: mode (get)" "$VH mode" 0
test_cmd "chain1: mode strict [sandbox]" "$VH mode strict" 1
test_cmd "chain1: mode relaxed [sandbox]" "$VH mode relaxed" 1

echo ""
echo "--- Chain 2: security → tools → audit ---"
test_cmd "chain2: security status" "$VH security status" 0
test_cmd "chain2: security list" "$VH security list" 0
test_cmd "chain2: tools list" "$VH tools list" 0
test_cmd "chain2: tools known" "$VH tools known" 0
test_cmd "chain2: audit query" "$VH audit query --limit 5" 0

echo ""
echo "--- Chain 3: workflow → history ---"
test_cmd "chain3: list" "$VH list" 0
test_cmd "chain3: history" "$VH history" 0
test_cmd "chain3: history --limit 5" "$VH history --limit 5" 0

echo ""
echo "--- Chain 4: monitor → debug → queue ---"
test_cmd "chain4: monitor status" "$VH monitor status" 0
test_cmd "chain4: debug state" "$VH debug state" 0
test_cmd "chain4: debug breakpoint list" "$VH debug breakpoint list" 0
test_cmd "chain4: queue list" "$VH queue list" 0

echo ""
echo "--- Chain 5: provider → agents → trace ---"
test_cmd "chain5: provider list" "$VH provider list" 0
test_cmd "chain5: tools agents" "$VH tools agents" 0
test_cmd "chain5: trace list" "$VH trace list" 0
test_cmd "chain5: doc-task-runs list" "$VH doc-task-runs list" 0

echo ""
echo "--- Chain 6: templates → schedule ---"
test_cmd "chain6: templates list" "$VH templates list" 0
test_cmd "chain6: schedule list" "$VH schedule list" 0

# ━━━ GENERATE REPORT ━━━
echo ""
echo "=========================================="
echo "  RESULTS: $PASS passed / $FAIL failed / $TOTAL total"
echo "=========================================="

{
  echo "# VectaHub CLI 全量命令测试报告"
  echo ""
  echo "**执行时间**: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "**测试环境**: dist 构建产物 (node dist/cli.js)"
  echo "**总计**: $TOTAL 个用例"
  echo "**通过**: $PASS"
  echo "**失败**: $FAIL"
  echo "**通过率**: $(( PASS * 100 / TOTAL ))%"
  echo ""
  echo "## 测试结果"
  echo ""
  echo "| 状态 | 测试用例 | 结果 | 备注 |"
  echo "|------|---------|------|------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status name result note <<< "$r"
    echo "| $status | $name | $result | $note |"
  done

  if [ $FAIL -gt 0 ]; then
    echo ""
    echo "## 失败用例清单"
    echo ""
    for r in "${RESULTS[@]}"; do
      IFS='|' read -r status name result note <<< "$r"
      if [ "$status" = "❌" ]; then
        echo "### $name"
        echo "- 结果: $result"
        echo "- 输出: $note"
        echo ""
      fi
    done
  fi
} > "$REPORT"

echo ""
echo "报告已写入: $REPORT"
