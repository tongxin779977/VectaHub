#!/bin/bash
set -uo pipefail

VH="node dist/cli.js"
REPORT=".test-reports/cli-extended-test-report.md"
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
echo "  VectaHub CLI 扩展场景测试"
echo "=========================================="
echo ""

# ━━━ GROUP 14: 不同语言意图测试 ━━━
echo "═══ GROUP 14: 多语言意图测试 ═══"
test_cmd "run 英文意图" "$VH run --dry-run 'Show me the current directory'" 0
test_cmd "run 中文意图" "$VH run --dry-run '查看当前目录'" 0
test_cmd "run 混合语言" "$VH run --dry-run 'List files and 显示最近修改'" 0
test_cmd "run 简单指令" "$VH run --dry-run 'ls'" 0
test_cmd "run 复杂指令" "$VH run --dry-run 'Check git status and run npm install'" 0

# ━━━ GROUP 15: 参数组合测试 ━━━
echo ""
echo "═══ GROUP 15: 参数组合测试 ═══"
test_cmd "list (无参数)" "$VH list" 0
test_cmd "history --limit 1" "$VH history --limit 1" 0
test_cmd "history --limit 100" "$VH history --limit 100" 0
test_cmd "history --status SUCCESS" "$VH history --status SUCCESS" 0
test_cmd "audit query --limit 1" "$VH audit query --limit 1" 0
test_cmd "audit query --limit 50" "$VH audit query --limit 50" 0

# ━━━ GROUP 16: 边界条件测试 ━━━
echo ""
echo "═══ GROUP 16: 边界条件测试 ═══"
test_cmd "history --limit 0" "$VH history --limit 0" 0
test_cmd "history --limit -1" "$VH history --limit -1" 0
test_cmd "history --status INVALID" "$VH history --status INVALID" 0
test_cmd "mode (空值)" "$VH mode ''" 0
test_cmd "security test (空字符串)" "$VH security test ''" 0

# ━━━ GROUP 17: 不同子命令组合 ━━━
echo ""
echo "═══ GROUP 17: 子命令组合测试 ═══"
test_cmd "templates (无参数)" "$VH templates" 1
test_cmd "templates --help" "$VH templates --help" 0
test_cmd "templates list --help" "$VH templates list --help" 0
test_cmd "tools (无参数)" "$VH tools" 1
test_cmd "tools --help" "$VH tools --help" 0
test_cmd "security (无参数)" "$VH security" 1
test_cmd "security --help" "$VH security --help" 0

# ━━━ GROUP 18: 多次调用相同命令 ━━━
echo ""
echo "═══ GROUP 18: 幂等性测试 ═══"
test_cmd "list (第1次)" "$VH list" 0
test_cmd "list (第2次)" "$VH list" 0
test_cmd "list (第3次)" "$VH list" 0
test_cmd "history (第1次)" "$VH history" 0
test_cmd "history (第2次)" "$VH history" 0

# ━━━ GROUP 19: 扩展链式测试 ━━━
echo ""
echo "═══ GROUP 19: 更复杂的链式测试 ═══"

echo ""
echo "--- Chain 7: 完整流程模拟 ---"
test_cmd "chain7: config show" "$VH config show" 0
test_cmd "chain7: list" "$VH list" 0
test_cmd "chain7: history --limit 3" "$VH history --limit 3" 0
test_cmd "chain7: audit query --limit 3" "$VH audit query --limit 3" 0
test_cmd "chain7: doctor" "$VH doctor" 0

echo ""
echo "--- Chain 8: 安全测试完整流程 ---"
test_cmd "chain8: security status" "$VH security status" 0
test_cmd "chain8: security list" "$VH security list" 0
test_cmd "chain8: security test ls" "$VH security test 'ls'" 0
test_cmd "chain8: security test 'pwd'" "$VH security test 'pwd'" 0

echo ""
echo "--- Chain 9: 工具验证 ---"
test_cmd "chain9: tools list" "$VH tools list" 0
test_cmd "chain9: tools known" "$VH tools known" 0
test_cmd "chain9: tools agents" "$VH tools agents" 0
test_cmd "chain9: provider list" "$VH provider list" 0

# ━━━ GROUP 20: 特殊字符测试 ━━━
echo ""
echo "═══ GROUP 20: 特殊字符测试 ═══"
test_cmd "run 引号" "$VH run --dry-run 'Check \"file.txt\"'" 0
test_cmd "run 空格" "$VH run --dry-run 'Check files in my dir'" 0
test_cmd "security test 特殊命令" "$VH security test 'echo \"hello world\"'" 0

# ━━━ GENERATE REPORT ━━━
echo ""
echo "=========================================="
echo "  RESULTS: $PASS passed / $FAIL failed / $TOTAL total"
echo "=========================================="

{
  echo "# VectaHub CLI 扩展场景测试报告"
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
