# VectaHub CLI 扩展场景测试报告

**执行时间**: 2026-05-29 00:22:54
**测试环境**: dist 构建产物 (node dist/cli.js)
**总计**: 44 个用例
**通过**: 44
**失败**: 0
**通过率**: 100%

## 测试结果

| 状态 | 测试用例 | 结果 | 备注 |
|------|---------|------|------|
| ✅ | run 英文意图 | exit 0 |  |
| ✅ | run 中文意图 | exit 0 |  |
| ✅ | run 混合语言 | exit 0 |  |
| ✅ | run 简单指令 | exit 0 |  |
| ✅ | run 复杂指令 | exit 0 |  |
| ✅ | list (无参数) | exit 0 |  |
| ✅ | history --limit 1 | exit 0 |  |
| ✅ | history --limit 100 | exit 0 |  |
| ✅ | history --status SUCCESS | exit 0 |  |
| ✅ | audit query --limit 1 | exit 0 |  |
| ✅ | audit query --limit 50 | exit 0 |  |
| ✅ | history --limit 0 | exit 0 |  |
| ✅ | history --limit -1 | exit 0 |  |
| ✅ | history --status INVALID | exit 0 |  |
| ✅ | mode (空值) | exit 0 |  |
| ✅ | security test (空字符串) | exit 0 |  |
| ✅ | templates (无参数) | exit 1 |  |
| ✅ | templates --help | exit 0 |  |
| ✅ | templates list --help | exit 0 |  |
| ✅ | tools (无参数) | exit 1 |  |
| ✅ | tools --help | exit 0 |  |
| ✅ | security (无参数) | exit 1 |  |
| ✅ | security --help | exit 0 |  |
| ✅ | list (第1次) | exit 0 |  |
| ✅ | list (第2次) | exit 0 |  |
| ✅ | list (第3次) | exit 0 |  |
| ✅ | history (第1次) | exit 0 |  |
| ✅ | history (第2次) | exit 0 |  |
| ✅ | chain7: config show | exit 0 |  |
| ✅ | chain7: list | exit 0 |  |
| ✅ | chain7: history --limit 3 | exit 0 |  |
| ✅ | chain7: audit query --limit 3 | exit 0 |  |
| ✅ | chain7: doctor | exit 0 |  |
| ✅ | chain8: security status | exit 0 |  |
| ✅ | chain8: security list | exit 0 |  |
| ✅ | chain8: security test ls | exit 0 |  |
| ✅ | chain8: security test 'pwd' | exit 0 |  |
| ✅ | chain9: tools list | exit 0 |  |
| ✅ | chain9: tools known | exit 0 |  |
| ✅ | chain9: tools agents | exit 0 |  |
| ✅ | chain9: provider list | exit 0 |  |
| ✅ | run 引号 | exit 0 |  |
| ✅ | run 空格 | exit 0 |  |
| ✅ | security test 特殊命令 | exit 0 |  |
