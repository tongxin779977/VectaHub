#!/bin/bash
# GitHub Actions Hourly Monitor Script
# 每小时执行一次，处理 GitHub Actions 和警告

set -e

# 配置
REPO_DIR="/Users/xin.tong/apps/project/test_trae/VectaHub"
LOG_FILE="/tmp/github-monitor.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

# 日志函数
log() {
    echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

cd "$REPO_DIR" || { log "ERROR: Failed to cd to $REPO_DIR"; exit 1; }

log "========================================="
log "Starting GitHub Actions Monitor"
log "========================================="

# 1. 检查 npm audit
log "Checking npm security audit..."
if npm audit --audit-level=moderate --json > /tmp/npm-audit.json 2>&1; then
    log "✅ No security vulnerabilities found"
else
    log "⚠️ Found security vulnerabilities, check /tmp/npm-audit.json"
fi

# 2. 检查失败的 workflow runs
log "Checking failed workflow runs..."
FAILED_RUNS=$(gh run list --status failure --limit 5 --json databaseId,name,url --jq '.[] | "\(.databaseId)|\(.name)|\(.url)"' 2>/dev/null || echo "")

if [ -z "$FAILED_RUNS" ]; then
    log "✅ No failed workflow runs found"
else
    log "⚠️ Found failed workflow runs:"
    
    COUNT=0
    while IFS='|' read -r RUN_ID NAME URL; do
        if [ -n "$RUN_ID" ] && [ $COUNT -lt 3 ]; then
            log "  - $NAME ($RUN_ID): $URL"
            
            # 自动重试
            log "    Retrying failed run..."
            if gh run rerun "$RUN_ID" --failed 2>/dev/null; then
                log "    ✅ Retried successfully"
            else
                log "    ❌ Failed to retry"
            fi
            
            COUNT=$((COUNT + 1))
        fi
    done <<< "$FAILED_RUNS"
fi

# 3. 检查 Dependabot alerts
log "Checking Dependabot alerts..."
ALERT_COUNT=$(gh api repos/{owner}/{repo}/dependabot/alerts --jq 'length' 2>/dev/null || echo "0")

if [ "$ALERT_COUNT" = "0" ]; then
    log "✅ No open Dependabot alerts"
else
    log "⚠️ Found $ALERT_COUNT open Dependabot alerts"
fi

# 4. 使用 VectaHub 模板处理
log "Running VectaHub processing..."
if [ -f "templates/gh-auto-process-all.yaml" ]; then
    if npm run build 2>&1 | tee -a "$LOG_FILE"; then
        node dist/cli.js run -f templates/gh-auto-process-all.yaml --mode relaxed 2>&1 | tee -a "$LOG_FILE" || log "⚠️ VectaHub processing had issues"
    else
        log "⚠️ Failed to build VectaHub"
    fi
fi

log "========================================="
log "GitHub Actions Monitor completed"
log "========================================="
log ""
