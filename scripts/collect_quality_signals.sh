#!/usr/bin/env bash

# scripts/collect_quality_signals.sh
# 聚合输出 VectaHub 项目最基本的质量信号

set -e

# 确保在仓库根目录运行
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the repository root."
    exit 1
fi

EXIT_CODE=0

echo "== Quality Signals Collection =="
echo "Started at: $(date)"
echo ""

# 1. Lint
echo "== Lint =="
# Run lint and capture output to count warnings
LINT_OUTPUT=$(npm run lint --silent || true)
echo "$LINT_OUTPUT" | head -n 20
if [ $(echo "$LINT_OUTPUT" | wc -l) -gt 20 ]; then
    echo "... (output truncated)"
fi

# Count problems
TOTAL_PROBLEMS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ problems" | head -1 | awk '{print $1}')
ERRORS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ errors" | head -1 | awk '{print $1}')
WARNINGS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ warnings" | head -1 | awk '{print $1}')

if [ -z "$TOTAL_PROBLEMS" ]; then
    # Maybe 0 problems
    if echo "$LINT_OUTPUT" | grep -q "Done"; then
        echo "Lint: PASSED (0 problems)"
    else
        echo "Lint: Unknown status (Check output above)"
        EXIT_CODE=1
    fi
else
    echo "Lint Summary: $TOTAL_PROBLEMS problems ($ERRORS errors, $WARNINGS warnings)"
    if [ "$ERRORS" -gt 0 ]; then
        echo "Lint: FAILED (Errors found)"
        EXIT_CODE=1
    else
        echo "Lint: PASSED with warnings"
    fi
fi
echo ""

# 2. Typecheck
echo "== Typecheck =="
if npm run typecheck; then
    echo "Typecheck: PASSED"
else
    echo "Typecheck: FAILED"
    EXIT_CODE=1
fi
echo ""

# 3. Any Usage (Warning count)
echo "== Any Usage =="
ANY_COUNT=$(rg -n --glob '*.ts' ': any|as any|<any>' src | wc -l | xargs)
echo "Total 'any' usages: $ANY_COUNT"
echo "Top 5 files with 'any':"
rg -n --glob '*.ts' ': any|as any|<any>' src | cut -d: -f1 | sort | uniq -c | sort -nr | head -n 5
echo ""

# 4. Console Usage (Warning count)
echo "== Console Usage =="
CONSOLE_COUNT=$(rg -n --glob '*.ts' 'console\.(log|debug|warn|error|info)' src | wc -l | xargs)
echo "Total console usages: $CONSOLE_COUNT"
echo ""

echo "== Summary =="
echo "Lint Problems: $TOTAL_PROBLEMS"
echo "Any Usages:    $ANY_COUNT"
echo "Console Logs:  $CONSOLE_COUNT"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo "Quality Check: SUCCESS (Baseline maintained)"
else
    echo "Quality Check: FAILURE (New errors or critical issues found)"
fi

exit $EXIT_CODE
