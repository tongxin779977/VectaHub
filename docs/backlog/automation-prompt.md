# Backlog Automation Prompt

> Document Status: Current Automation Prompt
> Authority: Copyable prompt for Trae Solo / Codex automation runs.
> Protocol: [protocol.md](./protocol.md)

```text
在项目 /Users/xin.tong/apps/project/test_trae/VectaHub 中，按照 docs/development-backlog.md、docs/backlog/protocol.md 和 docs/backlog/items/*.md 持续推进 NL Workflow Orchestrator 开发队列。

每次执行必须严格遵守：
- 先读取 docs/backlog/protocol.md。
- 只在完成 lock availability scan 前扫描 item 文件中的 id、priority、status、depends_on、review_findings.status 和 lock 字段。
- 不得读取 active locked item 的 source_docs、required_contracts、scope、done_criteria 或 verification。
- 使用本地 atomic claim：$(git rev-parse --git-path vectahub-backlog-claims/<TASK_ID>)。
- active lock 和 claim lock 超时均为 1 小时。
- 如果某个 item 被 active lock 或 claim lock 占用，跳过该 item，继续选择其他依赖已完成且未锁定的 eligible item。
- 优先修复 status=needs-fix 且 review_findings.status=needs-fix 的任务。
- 每轮最多处理一个 backlog item。
- 只修改本轮 selected item 范围内允许的文件。
- 通过后更新对应 docs/backlog/items/<TASK_ID>.md 的 completion，移除 lock，释放 atomic claim，并只提交本轮相关文件。
- completion.commit 必须使用 `git rev-parse <commit>` 得到的完整 40 位 commit hash；不得使用短 hash、HEAD、pending、空值或手写猜测值。
- 写入 completion.commit 前必须执行 `git cat-file -e <full-hash>^{commit}` 并确认通过；如果该命令失败，不得把 item 标记为 done。
- completion.verification_results 必须覆盖该 item 的 verification 列表中每一条命令；缺失、失败、跳过、只检查 modified files 或使用非标准别名时，不得标记为 done。
- 标记 done 前必须复核该 item 不存在 review_findings.status=needs-fix、重复 completion block、残留 lock 或依赖未完成。
- 未通过时更新该 item 为 needs-fix 或 blocked，记录失败证据，移除 lock，释放 atomic claim，不得提交。

输出格式：

## Selected Task
- task id
- priority
- previous status
- why selected

## Changes
- changed files
- reason for each file

## Audit
- passed / failed
- review_findings fixed
- remaining risks

## Verification
- command results
- skipped gates and reasons

## Backlog Update
- previous status
- new status
- notes added

## Git
- committed: yes/no
- commit hash if committed
- reason if not committed
```
