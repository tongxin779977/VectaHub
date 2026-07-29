---
slug: github-issues
status: drafting
intent: clear
review_required: false
pending-action: write .omo/plans/github-issues.md
approach: <fill: the approach you intend to plan>
---

# Draft: github-issues

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
C1 | #23 Security automation report: npm audit vulnerabilities active as of 2026-07-29 (today) | active | GitHub issue #23 body; security.yml workflow
C2 | #30 CI automation report: self-healing tracking issue, last updated 2026-07-26, branch fix/codeql-ws4-p2-dead-code, diagnostics=success but CI run failed | active | GitHub issue #30 body; self-healing.yml
C3 | #16 CI failure: CI on main — last CI run on main (28709198952, 2026-07-04) conclusion=failure, 25 bot comments, never auto-closes | active | GitHub issue #16; workflow run 28709198952; notify.yml (no close logic)
C4 | #19 CI failure: Release Check on feat/ci-modernization branch — stale feature branch, 4 bot comments, never auto-closes | active | GitHub issue #19 body; notify.yml (no close logic)

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
A1 | #16 and #19 (notify workflow issues) have NO auto-close logic in notify.yml — they must be manually closed | adopted: manual close after root cause fixed | notify.yml has only create/comment, no close step | reversible
A2 | #30 (self-healing) auto-closes when CI succeeds; #23 (security) auto-closes when npm audit is clean | adopted: let automation close these after fix | self-healing.yml resolve job + security.yml close step | reversible
A3 | The CI failure on main (2026-07-04) may already be fixed on develop/feature branches but not merged to main | adopted: needs investigation | commit msg says "flaky failures on re-run"; develop has continued work since | reversible

## Findings (cited - path:lines)
F1: 4 open issues, ALL created by github-actions[bot] — none are human-reported bugs/features (GitHub API list_repository_issues, 2026-07-29)
F2: #23 (Security automation report) — "npm audit vulnerabilities: true", updated TODAY 2026-07-29, run 30421519042 (issue #23 body)
F3: #30 (CI automation report) — "diagnostics result: success", branch fix/codeql-ws4-p2-dead-code, run 30209567266, updated 2026-07-26 (issue #30 body)
F4: #16 (CI failure: CI) — branch main, 25 bot "New failure" comments, last updated 2026-07-26 (issue #16 + comments)
F5: #19 (CI failure: Release Check) — branch feat/ci-modernization, 4 bot comments, last updated 2026-07-24 (issue #19 body)
F6: self-healing.yml — on CI failure creates/updates "CI automation report" (#30); on CI success closes it (self-healing.yml:55-130, 142-187)
F7: notify.yml — on ANY watched workflow failure creates "CI failure: <workflow>" issue or adds "New failure" comment; has NO close logic — issues persist forever (notify.yml:81-124)
F8: security.yml — daily cron; if npm audit vulnerable creates/updates "Security automation report" (#23); if clean closes it (security.yml:86-181)
F9: stale.yml — 30-day stale bot for issues, exempt labels: bug,security,enhancement,priority:high,priority:critical,pinned; automation/ci/workflow-failure labels are NOT exempt (stale.yml:18-29)
F10: Last CI run on main (28709198952, 2026-07-04) conclusion=failure; commit msg: "Sync CI modernization from develop to main... flaky failures on re-run" (GitHub API list_workflow_runs)
F11: Local branches show active fix/codeql-ws1-p0-shared-pkg through ws4-p2-dead-code — CodeQL fix work in progress on separate branches (.git/config:27-38)

## Decisions (with rationale)
D1: The 4 issues are ALL automation tracking issues, not human feature requests — "处理" means addressing the root causes they track + closing resolved ones (rationale: all 4 are bot-created with automation/ci/security labels)

## Scope IN
- Investigate and fix npm audit vulnerabilities (#23 root cause)
- Investigate and fix CI failure on main (#16, #30 root cause)
- Close stale automation issues that no longer track active problems (#19 for abandoned feat/ci-modernization branch)
- Close #16/#19 (notify workflow issues with no auto-close) after root causes are resolved

## Scope OUT (Must NOT have)
- Modifying the automation workflows themselves (self-healing.yml, notify.yml, security.yml, stale.yml) unless the user explicitly wants notify.yml to gain auto-close logic
- Deleting branches (feat/ci-modernization, fix/codeql-ws*) — only close issues
- Changing public API, CLI output contract, or storage format

## Open questions
Q1 (OWNER-DECISION): Scope of "处理" — ANSWERED: (A) fix root causes + close issues

## Approval gate
status: approved
approach: (A) Fix root causes (CI failure on main + npm audit vulnerabilities) AND close stale automation issues (#16, #19 manually; #23, #30 auto-close after fix)
next: plan written at .omo/plans/github-issues.md, Metis gap analysis folded in, awaiting user decision to start work or run high-accuracy review
