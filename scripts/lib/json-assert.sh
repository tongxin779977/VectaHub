#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

assert_json_ok() {
  local json="$1"
  local label="${2:-json ok}"
  echo "$json" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.exit(d.ok === true ? 0 : 1);
    } catch(e) { process.exit(2); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label (ok=true)"
  else
    echo "  ❌ FAIL: $label (expected ok=true, got rc=$rc)"
  fi
  return $rc
}

assert_json_not_ok() {
  local json="$1"
  local label="${2:-json not ok}"
  echo "$json" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.exit(d.ok === false ? 0 : 1);
    } catch(e) { process.exit(2); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label (ok=false)"
  else
    echo "  ❌ FAIL: $label (expected ok=false)"
  fi
  return $rc
}

assert_json_field() {
  local json="$1"
  local field="$2"
  local label="${3:-field $field exists}"
  echo "$json" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const v = d['$field'];
      process.exit(v !== undefined && v !== null ? 0 : 1);
    } catch(e) { process.exit(2); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label"
  else
    echo "  ❌ FAIL: $label (field '$field' missing or null)"
  fi
  return $rc
}

assert_json_not_field() {
  local json="$1"
  local field="$2"
  local label="${3:-field $field absent}"
  echo "$json" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.exit(d['$field'] === undefined ? 0 : 1);
    } catch(e) { process.exit(2); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label"
  else
    echo "  ❌ FAIL: $label (field '$field' should not exist)"
  fi
  return $rc
}

assert_field_not_contains() {
  local json="$1"
  local field="$2"
  local pattern="$3"
  local label="${4:-$field not contains '$pattern'}"
  echo "$json" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const v = String(d['$field'] || '');
      process.exit(v.toLowerCase().includes('$pattern'.toLowerCase()) ? 1 : 0);
    } catch(e) { process.exit(2); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label"
  else
    echo "  ❌ FAIL: $label (field contains forbidden pattern)"
  fi
  return $rc
}

assert_field_contains() {
  local json="$1"
  local field="$2"
  local pattern="$3"
  local label="${4:-$field contains '$pattern'}"
  echo "$json" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const v = String(d['$field'] || '');
      process.exit(v.includes('$pattern') ? 0 : 1);
    } catch(e) { process.exit(2); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label"
  else
    echo "  ❌ FAIL: $label (field does not contain expected pattern)"
  fi
  return $rc
}

assert_json_field_value() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local label="${4:-$field == '$expected'}"
  echo "$json" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const v = d['$field'];
      const match = typeof v === 'object' ? JSON.stringify(v) === '$expected' : String(v) === '$expected';
      process.exit(match ? 0 : 1);
    } catch(e) { process.exit(2); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label"
  else
    echo "  ❌ FAIL: $label"
  fi
  return $rc
}

assert_no_hallucination() {
  local json="$1"
  local field="${2:-reply}"
  local label="${3:-no hallucination in $field}"
  local patterns=("simulated environment" "In this simulated" "/home/user" "simulated" "As an AI")
  local failed=0
  for pat in "${patterns[@]}"; do
    echo "$json" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        const v = String(d['$field'] || '');
        process.exit(v.toLowerCase().includes('$pat'.toLowerCase()) ? 1 : 0);
      } catch(e) { process.exit(0); }
    " 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "  ❌ FAIL: $label (found hallucination pattern: '$pat')"
      failed=1
      break
    fi
  done
  if [ $failed -eq 0 ]; then
    echo "  ✅ PASS: $label"
  fi
  return $failed
}

assert_json_is_valid() {
  local json="$1"
  local label="${2:-valid JSON}"
  echo "$json" | node -e "
    try {
      JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.exit(0);
    } catch(e) { process.exit(1); }
  " 2>/dev/null
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ✅ PASS: $label"
  else
    echo "  ❌ FAIL: $label (invalid JSON)"
  fi
  return $rc
}
