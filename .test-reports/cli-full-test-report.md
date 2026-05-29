# VectaHub CLI 全量命令测试报告

**执行时间**: 2026-05-29 00:17:40
**测试环境**: dist 构建产物 (node dist/cli.js)
**总计**: 85 个用例
**通过**: 85
**失败**: 0
**通过率**: 100%

## 测试结果

| 状态 | 测试用例 | 结果 | 备注 |
|------|---------|------|------|
| ✅ | version | exit 0 |  |
| ✅ | version --json | exit 0 |  |
| ✅ | --version (global flag) | exit 0 |  |
| ✅ | config show | exit 0 |  |
| ✅ | config tools | exit 0 |  |
| ✅ | completion bash | exit 0 |  |
| ✅ | completion zsh | exit 0 |  |
| ✅ | doctor | exit 0 |  |
| ✅ | doctor --json | exit 0 |  |
| ✅ | run --dry-run | exit 0 |  |
| ✅ | run --json --dry-run | exit 0 |  |
| ✅ | run-command --dry-run | exit 0 |  |
| ✅ | run-command --json --dry-run | exit 0 |  |
| ✅ | mode (get) | exit 0 |  |
| ✅ | mode strict [sandbox] | exit 1 |  |
| ✅ | mode relaxed [sandbox] | exit 1 |  |
| ✅ | chat --help | exit 0 |  |
| ✅ | list | exit 0 |  |
| ✅ | verify --type typecheck | exit 1 |  |
| ✅ | templates list | exit 0 |  |
| ✅ | schedule list | exit 0 |  |
| ✅ | history | exit 0 |  |
| ✅ | history --limit 5 | exit 0 |  |
| ✅ | history --status FAILED | exit 0 |  |
| ✅ | archive --list [sandbox] | exit 1 |  |
| ✅ | doc-task-runs list | exit 0 |  |
| ✅ | doc-task-runs list --json | exit 0 |  |
| ✅ | doc-task-runs latest | exit 0 |  |
| ✅ | trace list | exit 0 |  |
| ✅ | trace list --json | exit 0 |  |
| ✅ | run-task missing --task-id (expect fail) | exit 1 |  |
| ✅ | run-task-clean-logs [sandbox] | exit 1 |  |
| ✅ | security status | exit 0 |  |
| ✅ | security list | exit 0 |  |
| ✅ | security list --enabled | exit 0 |  |
| ✅ | security test rm -rf | exit 0 |  |
| ✅ | security test ls | exit 0 |  |
| ✅ | audit query --limit 10 | exit 0 |  |
| ✅ | audit list | exit 0 |  |
| ✅ | tools list | exit 0 |  |
| ✅ | tools list --json | exit 0 |  |
| ✅ | tools known | exit 0 |  |
| ✅ | tools agents | exit 0 |  |
| ✅ | provider list | exit 0 |  |
| ✅ | provider list --json | exit 0 |  |
| ✅ | monitor status | exit 0 |  |
| ✅ | debug state | exit 0 |  |
| ✅ | debug breakpoint list | exit 0 |  |
| ✅ | debug watch list | exit 0 |  |
| ✅ | export --help | exit 0 |  |
| ✅ | daemon status | exit 1 |  |
| ✅ | serve --help | exit 0 |  |
| ✅ | client --help | exit 0 |  |
| ✅ | queue list | exit 0 |  |
| ✅ | queue list --json | exit 0 |  |
| ✅ | run --file nonexistent (expect fail) | exit 1 |  |
| ✅ | detail nonexistent-id (exit 0) | exit 0 |  |
| ✅ | rerun nonexistent-id (exit 0) | exit 0 |  |
| ✅ | rollback nonexistent (expect fail) | exit 1 |  |
| ✅ | security delete nonexistent (expect fail) | exit 1 |  |
| ✅ | tools info nonexistent (expect fail) | exit 1 |  |
| ✅ | mode invalid (expect fail) | exit 1 |  |
| ✅ | chain1: config show | exit 0 |  |
| ✅ | chain1: doctor | exit 0 |  |
| ✅ | chain1: mode (get) | exit 0 |  |
| ✅ | chain1: mode strict [sandbox] | exit 1 |  |
| ✅ | chain1: mode relaxed [sandbox] | exit 1 |  |
| ✅ | chain2: security status | exit 0 |  |
| ✅ | chain2: security list | exit 0 |  |
| ✅ | chain2: tools list | exit 0 |  |
| ✅ | chain2: tools known | exit 0 |  |
| ✅ | chain2: audit query | exit 0 |  |
| ✅ | chain3: list | exit 0 |  |
| ✅ | chain3: history | exit 0 |  |
| ✅ | chain3: history --limit 5 | exit 0 |  |
| ✅ | chain4: monitor status | exit 0 |  |
| ✅ | chain4: debug state | exit 0 |  |
| ✅ | chain4: debug breakpoint list | exit 0 |  |
| ✅ | chain4: queue list | exit 0 |  |
| ✅ | chain5: provider list | exit 0 |  |
| ✅ | chain5: tools agents | exit 0 |  |
| ✅ | chain5: trace list | exit 0 |  |
| ✅ | chain5: doc-task-runs list | exit 0 |  |
| ✅ | chain6: templates list | exit 0 |  |
| ✅ | chain6: schedule list | exit 0 |  |
