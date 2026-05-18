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
if npm run lint; then
    echo "Lint: PASSED"
else
    echo "Lint: FAILED"
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

# 3. Any Usage (Warning only, does not affect exit code)
echo "== Any Usage =="
# We use || true because grep returns non-zero if no matches found, which we don't want to treat as script failure
rg -n --glob '*.ts' ': any|as any|<any>' src || echo "No 'any' usage found."
echo ""

# 4. Console Usage (Warning only, does not affect exit code)
echo "== Console Usage =="
rg -n --glob '*.ts' 'console\.(log|debug|warn|error|info)' src || echo "No console usage found."
echo ""

echo "== Summary =="
if [ $EXIT_CODE -eq 0 ]; then
    echo "Quality Check: SUCCESS"
else
    echo "Quality Check: FAILURE (Check Lint/Typecheck outputs)"
fi

exit $EXIT_CODE
