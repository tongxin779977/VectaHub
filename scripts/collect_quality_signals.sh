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

count_matches() {
    if [ -z "$1" ]; then
        echo 0
        return
    fi
    printf '%s\n' "$1" | wc -l | xargs
}

print_top_files() {
    if [ -z "$1" ]; then
        echo "  (none)"
        return
    fi
    printf '%s\n' "$1" | cut -d: -f1 | sort | uniq -c | sort -nr | head -n 5
}

echo "== Quality Signals Collection =="
echo "Started at: $(date)"
echo ""

# 1. Lint
echo "== Lint =="
if LINT_OUTPUT=$(npm run lint --silent 2>&1); then
    if [ -n "$LINT_OUTPUT" ]; then
        echo "$LINT_OUTPUT" | head -n 20
        if [ "$(echo "$LINT_OUTPUT" | wc -l | xargs)" -gt 20 ]; then
            echo "... (output truncated)"
        fi
    fi

    TOTAL_PROBLEMS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ problems" | head -1 | awk '{print $1}' || true)
    ERRORS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ errors" | head -1 | awk '{print $1}' || true)
    WARNINGS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ warnings" | head -1 | awk '{print $1}' || true)
    TOTAL_PROBLEMS=${TOTAL_PROBLEMS:-0}
    ERRORS=${ERRORS:-0}
    WARNINGS=${WARNINGS:-0}

    if [ "$TOTAL_PROBLEMS" -eq 0 ]; then
        echo "Lint: PASSED (0 problems)"
    elif [ "$ERRORS" -gt 0 ]; then
        echo "Lint: FAILED ($ERRORS errors, $WARNINGS warnings)"
        EXIT_CODE=1
    else
        echo "Lint: PASSED with warnings ($WARNINGS warnings)"
    fi
else
    LINT_STATUS=$?
    if [ -n "$LINT_OUTPUT" ]; then
        echo "$LINT_OUTPUT" | head -n 20
        if [ "$(echo "$LINT_OUTPUT" | wc -l | xargs)" -gt 20 ]; then
            echo "... (output truncated)"
        fi
    fi
    TOTAL_PROBLEMS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ problems" | head -1 | awk '{print $1}' || true)
    ERRORS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ errors" | head -1 | awk '{print $1}' || true)
    WARNINGS=$(echo "$LINT_OUTPUT" | grep -oE "[0-9]+ warnings" | head -1 | awk '{print $1}' || true)
    TOTAL_PROBLEMS=${TOTAL_PROBLEMS:-unknown}
    ERRORS=${ERRORS:-unknown}
    WARNINGS=${WARNINGS:-unknown}
    echo "Lint: FAILED (exit code $LINT_STATUS)"
    EXIT_CODE=1
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

# 3. Production Any Usage
echo "== Production Any Usage =="
ANY_OUTPUT=$(rg -n --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.bench.ts' ': any\b|as any\b|<any\b' src || true)
ANY_COUNT=$(count_matches "$ANY_OUTPUT")
echo "Production explicit 'any' usages: $ANY_COUNT"
echo "Top 5 files with production 'any':"
print_top_files "$ANY_OUTPUT"
if [ "$ANY_COUNT" -gt 0 ]; then
    echo "Production Any: FAILED"
    EXIT_CODE=1
else
    echo "Production Any: PASSED"
fi
echo ""

# 4. Current-process Console Usage
echo "== Current-process Console Usage =="
RAW_CONSOLE_OUTPUT=$(rg -n --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.bench.ts' 'console\.(log|debug|warn|error|info)(\(|\b)' src || true)
ALLOWED_CONSOLE_OUTPUT=$(printf '%s\n' "$RAW_CONSOLE_OUTPUT" | grep 'console.log(JSON.parse(process.stdin.read()).map(i => i.url)' || true)
CONSOLE_OUTPUT=$(printf '%s\n' "$RAW_CONSOLE_OUTPUT" | grep -v 'console.log(JSON.parse(process.stdin.read()).map(i => i.url)' || true)
CONSOLE_COUNT=$(count_matches "$CONSOLE_OUTPUT")
ALLOWED_CONSOLE_COUNT=$(count_matches "$ALLOWED_CONSOLE_OUTPUT")
echo "Blocking current-process console usages: $CONSOLE_COUNT"
echo "Allowed child-process code string usages: $ALLOWED_CONSOLE_COUNT"
echo "Top 5 files with blocking console:"
print_top_files "$CONSOLE_OUTPUT"
if [ "$CONSOLE_COUNT" -gt 0 ]; then
    echo "Console: FAILED"
    EXIT_CODE=1
else
    echo "Console: PASSED"
fi
echo ""

# 5. Test Any Usage (Advisory)
echo "== Test Any Usage (Advisory) =="
TEST_ANY_OUTPUT=$(rg -n --glob '*.test.ts' ': any\b|as any\b|<any\b' src || true)
TEST_ANY_COUNT=$(count_matches "$TEST_ANY_OUTPUT")
echo "Test explicit 'any' usages: $TEST_ANY_COUNT"
echo "Top 5 test files with 'any':"
print_top_files "$TEST_ANY_OUTPUT"
echo ""

echo "== Summary =="
echo "Lint Problems:              $TOTAL_PROBLEMS"
echo "Lint Errors:                $ERRORS"
echo "Lint Warnings:              $WARNINGS"
echo "Production Any Usages:      $ANY_COUNT"
echo "Blocking Console Usages:    $CONSOLE_COUNT"
echo "Allowed Console Strings:    $ALLOWED_CONSOLE_COUNT"
echo "Test Any Usages (advisory): $TEST_ANY_COUNT"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo "Quality Check: SUCCESS (Production baseline maintained)"
else
    echo "Quality Check: FAILURE (Blocking issues found)"
fi

exit $EXIT_CODE
