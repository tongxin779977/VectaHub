# github-issues - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** All 4 open GitHub issues closed — 2 by fixing the root causes they tracked (CI flaky test on main + 11 npm audit vulnerabilities), 2 by closing stale automation tracking issues. After this, the issue tracker is clean and the automation won't recreate them.

**Why this approach:** All 4 issues are bot-created tracking reports, not human feature requests. Two track real problems (CI failure + npm audit vulns) that must be fixed or the automation will immediately recreate the issues. The CI failure was already fixed locally (commit `4ab5b42`) but never pushed. The npm audit vulns are fixable via a stryker 9.x upgrade + npm overrides. The other 2 issues (#16, #19) have no auto-close logic in `notify.yml` and need manual closure.

**What it will NOT do:** Will NOT modify the automation workflows (self-healing/notify/security/stale .yml). Will NOT delete any branches. Will NOT merge the fix/codeql-ws* branches. Will NOT touch low-severity npm audit vulns. Will NOT change public API or CLI output.

**Effort:** Short
**Risk:** Medium - stryker 8.x→9.x major version bump could break typecheck/build; CI flaky test might recur
**Decisions to sanity-check:** (1) Using npm overrides instead of merging 4 Dependabot PRs — single cleaner commit. (2) Upgrading stryker to 9.6.1 (major bump, dev-only, not in main CI path). (3) Closing #19 for an abandoned branch without deleting it.

Your next move: approve, or run a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Short effort, Medium risk — fix CI flaky test (push 3 local commits) + fix 11 npm audit moderate+ vulns (stryker 9.x + overrides) + close 4 bot-created GitHub issues.

## Scope
### Must have
1. Push 3 unpushed local commits on `main` (including flaky-test fix `4ab5b42`) to `origin/main` and verify CI passes
2. Fix all 11 moderate+ npm audit vulnerabilities (7 high + 4 moderate) so `npm audit --audit-level=moderate` exits 0
3. Close #19 (stale CI failure on abandoned `feat/ci-modernization` branch) with explanatory comment
4. Close #16 (CI failure: CI on main) after CI passes — `notify.yml` has no auto-close logic
5. Verify #30 (CI automation report) auto-closes via `self-healing.yml` resolve job after CI passes; close manually if not closed within 24h
6. Verify #23 (Security automation report) auto-closes via `security.yml` after npm audit is clean; close manually if not closed within 24h

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must NOT modify the automation workflows themselves (`self-healing.yml`, `notify.yml`, `security.yml`, `stale.yml`) — adding auto-close to `notify.yml` is out of scope
- Must NOT delete any branches (`feat/ci-modernization`, `fix/codeql-ws*`, `dependabot/*`) — only close issues
- Must NOT change public API, CLI output contract, or storage format
- Must NOT merge the `fix/codeql-ws*` branches — those are separate CodeQL work, not part of this issue-triage scope
- Must NOT touch the 5 low-severity npm audit vulnerabilities — `security.yml` only checks `--audit-level=moderate`
- Must NOT skip the `npm run bump` → `npm run build` → commit workflow for code changes
- Must NOT use `npm audit fix --force` — manually edit `package.json` deps + overrides only
- Must NOT push to `main` with a dirty working tree — stash or commit WIP first
- Must NOT replace the existing `overrides` block — merge new keys into it, preserving `esbuild: 0.28.1`

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + existing CI gates (no new tests needed — this is dependency upgrades + issue closure)
- Evidence: <attemptDir>/task-<N>-github-issues.<ext> (attemptDir = currentAttemptDir from 'omo ulw-loop status --json', .omo/evidence/ulw/<session>/<goalId>/a<attempt>; outside ulw-loop use .omo/evidence/)

## Execution strategy
### Parallel execution waves
> Wave 1 (CI fix + npm audit fix can run in parallel — different files). Wave 2 (issue closure — depends on Wave 1). Wave 3 (final verification).

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 (push main + verify CI) | — | 4 (close #16), 5 (verify #30 auto-close) | 2 (npm audit fix), 3 (close #19) |
| 2 (fix npm audit vulns) | — | 6 (verify #23 auto-close) | 1 (push main), 3 (close #19) |
| 3 (close #19) | — | — | 1, 2 |
| 4 (close #16) | 1 (CI must pass) | — | 6 (if #23 closed) |
| 5 (verify/close #30) | 1 (CI must pass) | — | 4, 6 |
| 6 (verify/close #23) | 2 (npm audit clean) | — | 4, 5 |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Push local main commits to origin and verify CI passes
  What to do / Must NOT do: **PRECONDITION: working tree must be clean.** Run `git status` — if there are uncommitted changes (there are 30+ modified files on the current `fix/codeql-ws4-p2-dead-code` branch), stash them with `git stash` before switching branches. Switch to `main` branch, verify it's ahead of `origin/main` (HEAD at `4ab5b42`, 2-3 commits ahead). Push to `origin/main`. The key commit is `4ab5b42 fix(test): mute logger in vscode-diagnostic test to dodge pino/file rmSync race` which fixes the flaky pino/file rmSync race that caused the CI failure. After push, wait for CI workflow (id 273289531) to complete on `origin/main` and verify ALL jobs pass (4 matrix cells: Node 22/24 × ubuntu/macos, plus VS Code extension, plus benchmark regression check). The previous failure (run 28709198952) was ONLY in the "Root package (24 / macos-latest)" job, "Test with coverage" step. Must NOT force-push or rewrite history. Must NOT push other branches. Must NOT push with dirty working tree.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 5
  References (executor has NO interview context - be exhaustive): 
  - `.git/config:8-13` (remote origin URL)
  - Local main HEAD: `4ab5b42`, origin/main last CI run on `1c40a66` (run 28709198952, 2026-07-04, conclusion=failure)
  - Failed job: "Root package (24 / macos-latest)" job 85139801364, step 9 "Test with coverage" failed
  - Fix commit: `4ab5b42 fix(test): mute logger in vscode-diagnostic test to dodge pino/file rmSync race`
  - CI workflow: `.github/workflows/ci.yml`, workflow id 273289531
  - CI matrix: Node 22 + 24, ubuntu-latest + macos-latest (4 cells) + VS Code extension + benchmark
  - Self-healing workflow: `.github/workflows/self-healing.yml` (auto-closes #30 on CI success)
  - GitHub issue #16 (CI failure: CI on main), #30 (CI automation report)
  Acceptance criteria (agent-executable): 
  1. `git status` is clean (or WIP stashed) before switching to main
  2. `git checkout main && git log --oneline origin/main..main` shows unpushed commits
  3. `git push origin main` succeeds
  4. After CI completes: `gh run list --workflow=ci.yml --branch=main --limit=1 --json conclusion` returns `"conclusion": "success"` (ALL jobs, not just the previously-failing one)
  5. If CI fails: investigate the specific failing job via `gh run view <run-id> --log-failed`, fix, re-push
  QA scenarios (name the exact tool + invocation): 
  - Happy: `git stash` → `git checkout main` → `git push origin main` → CI run starts → `gh run watch` → conclusion=success. Evidence: CI run URL + conclusion JSON
  - Failure: CI still fails on Node 24/macOS → `gh run view <run-id> --log-failed` → identify failing test → fix → re-push. Evidence: failed log excerpt + fix commit
  Commit: N | (push only, no new commit)

- [ ] 2. Fix all moderate+ npm audit vulnerabilities
  What to do / Must NOT do: Fix all 11 moderate+ vulnerabilities (7 high + 4 moderate) so `npm audit --audit-level=moderate` exits 0. Steps: (a) Upgrade `shell-quote` from `^1.8.4` to `^1.9.0` in `package.json:58` dependencies. (b) Upgrade `@stryker-mutator/core`, `@stryker-mutator/typescript-checker`, `@stryker-mutator/vitest-runner` from `^8.7.1` to `^9.6.1` in `package.json:68-70` devDependencies (fixes transitive: tmp, ajv, @inquirer/*, external-editor, @babel/core). (c) MERGE new override keys into the existing `"overrides": {"esbuild":"0.28.1"}` block at `package.json:85-87` — do NOT replace the block, add keys alongside `esbuild`. Add overrides for: `brace-expansion`, `fast-uri`, `js-yaml`, `linkify-it`, `postcss` — run `npm audit --json` first to get exact fix versions for each. (d) Run `npm install` to regenerate `package-lock.json` (CRITICAL — CI uses `npm ci` which requires an updated lockfile). (e) Run `npm audit --audit-level=moderate` to verify exit code 0. (f) Run `npm run typecheck` to verify stryker 9.x didn't break types. (g) Run `npm run test:run` to verify nothing broke. (h) Run `npm run mutation` or `npx stryker run --help` to verify stryker 9.x still works (no stryker.conf exists, uses defaults — 9.x may change default behavior). Must NOT use `npm audit fix --force` — manually edit `package.json` only. Must NOT touch the 5 low-severity vulns. Must NOT merge Dependabot branches (use overrides instead — cleaner single commit). Must NOT change production dependencies except `shell-quote`. Must NOT replace the existing `overrides` block. Must NOT forget to stage `package-lock.json` in the commit.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 6
  References (executor has NO interview context - be exhaustive):
  - `package.json:52-61` (dependencies — `shell-quote` at line 58)
  - `package.json:62-84` (devDependencies — `@stryker-mutator/*` at lines 68-70)
  - `package.json:85-87` (overrides section — currently `{"esbuild":"0.28.1"}`, MERGE new keys into this)
  - `.github/workflows/security.yml:35-48` (npm audit step — uses `--audit-level=moderate`)
  - `.github/workflows/security.yml:158-181` (close resolved security issue — auto-closes #23 when audit clean AND dependabot alerts clear)
  - `.github/workflows/e2e-mutation.yml` (stryker runs here via `npm run mutation` — manual trigger only, NOT in main CI)
  - GitHub issue #23 (Security automation report — "npm audit vulnerabilities: true")
  - 6 Dependabot branches on origin (reference for fix versions, do NOT merge): `shell-quote-1.8.4`, `shell-quote-1.9.0`, `fast-uri-3.1.4`, `linkify-it-5.0.2`, `postcss-8.5.14`, `multi-6246f1f737`, `multi-788bd52763`
  - Vulnerable packages (from `npm audit --audit-level=moderate --json`): shell-quote (high, direct), brace-expansion (high, transitive), fast-uri (high, transitive), js-yaml (high, transitive), linkify-it (high, transitive), postcss (high, transitive), tmp (high, transitive via external-editor→@stryker-mutator/core), @stryker-mutator/core (moderate, direct dev), @stryker-mutator/typescript-checker (moderate, direct dev), @stryker-mutator/vitest-runner (moderate, direct dev), ajv (moderate, transitive)
  Acceptance criteria (agent-executable):
  1. `npm audit --audit-level=moderate` exits with code 0 (no moderate+ vulnerabilities)
  2. `npm run test:run` passes (vitest --run, no new failures)
  3. `npm run typecheck` passes (tsc --noEmit — stryker 9.x API may have changed)
  4. `npm run build` passes (tsup — verify stryker import paths still resolve)
  5. `npx stryker run --help` succeeds (stryker 9.x CLI is functional)
  6. `package-lock.json` is updated and staged (`git diff --name-only | grep package-lock.json`)
  QA scenarios (name the exact tool + invocation):
  - Happy: Edit package.json → `npm install` → `npm audit --audit-level=moderate` exits 0 → `npm run typecheck` + `npm run test:run` pass. Evidence: audit exit code + test output
  - Failure: stryker 9.x breaks typecheck → `npm run typecheck` fails → check stryker 9.x changelog → fix import paths or pin to `^9.0.0` with overrides. Evidence: typecheck error + fix
  Commit: Y | fix(deps): upgrade shell-quote and stryker, add transitive vulnerability overrides

- [ ] 3. Close stale issue #19 (CI failure: Release Check on feat/ci-modernization)
  What to do / Must NOT do: Close GitHub issue #19 with a comment explaining it's stale — the `feat/ci-modernization` branch was merged to main via PR #18/#21 (commit `1c40a66`), and the Release Check workflow failure on that branch is no longer relevant. Use `github.update_issue` with `state: "closed"`, `state_reason: "completed"`, and add a comment via `github.create_issue_comment`. Must NOT delete the `feat/ci-modernization` branch. Must NOT close #16, #30, or #23 in this todo.
  Parallelization: Wave 1 | Blocked by: — | Blocks: —
  References (executor has NO interview context - be exhaustive):
  - GitHub issue #19: title "CI failure: Release Check", branch `feat/ci-modernization`, commit `649613a25e99e127fc77c02ac7ac85e2608fc65d`, run https://github.com/tongxin779977/VectaHub/actions/runs/28704410097
  - `.github/workflows/notify.yml:81-124` (creates "CI failure: <workflow>" issues, has NO auto-close logic)
  - Commit `1c40a66` message: "ci: governance, matrix, coverage, commit hooks, automation, publish h… (#18) (#21) Sync CI modernization from develop to main" — feat/ci-modernization was merged
  - GitHub API: `github.update_issue` (owner: tongxin779977, repo: VectaHub, issueNumber: 19, state: "closed") + `github.create_issue_comment` (issueNumber: 19, body: explanatory comment)
  Acceptance criteria (agent-executable):
  1. `github.get_issue` for #19 returns `"state": "closed"`, `"state_reason": "completed"`
  2. A comment exists on #19 explaining the closure reason
  QA scenarios (name the exact tool + invocation):
  - Happy: `github.update_issue` → state=closed → `github.create_issue_comment` → verify via `github.get_issue`. Evidence: issue state JSON
  - Failure: API returns error → retry with explicit state_reason. Evidence: error response
  Commit: N | (GitHub issue management, no code commit)

- [ ] 4. Close issue #16 (CI failure: CI on main) after CI passes
  What to do / Must NOT do: After todo 1 confirms CI passed on `origin/main`, close GitHub issue #16 with a comment explaining the CI failure was a flaky test on Node 24/macOS (pino/file rmSync race) fixed by commit `4ab5b42`, and the latest CI run passed. Use `github.update_issue` (state: "closed", state_reason: "completed") + `github.create_issue_comment`. Must NOT close #16 before CI passes (verify via `gh run list --workflow=ci.yml --branch=main --limit=1 --json conclusion` returns success first). Must NOT close #30 or #23 in this todo.
  Parallelization: Wave 2 | Blocked by: 1 (CI must pass) | Blocks: —
  References (executor has NO interview context - be exhaustive):
  - GitHub issue #16: title "CI failure: CI", branch `main`, 25 bot comments, labels: automation, ci, workflow-failure
  - `.github/workflows/notify.yml:81-124` (notify workflow creates "CI failure: <workflow>" issues, has NO auto-close logic — must close manually)
  - Fix commit: `4ab5b42 fix(test): mute logger in vscode-diagnostic test to dodge pino/file rmSync race`
  - CI workflow id: 273289531, `.github/workflows/ci.yml`
  - GitHub API: `github.update_issue` (owner: tongxin779977, repo: VectaHub, issueNumber: 16, state: "closed") + `github.create_issue_comment` (issueNumber: 16)
  Acceptance criteria (agent-executable):
  1. Pre-condition: `gh run list --workflow=ci.yml --branch=main --limit=1 --json conclusion` returns `"conclusion": "success"`
  2. `github.get_issue` for #16 returns `"state": "closed"`, `"state_reason": "completed"`
  3. A comment exists on #16 explaining the fix and pointing to the passing CI run
  QA scenarios (name the exact tool + invocation):
  - Happy: Verify CI passed → `github.update_issue` → state=closed → `github.create_issue_comment` → verify. Evidence: issue state JSON + CI run URL
  - Failure: CI hasn't passed yet → wait and retry. Evidence: CI run status
  Commit: N | (GitHub issue management, no code commit)

- [ ] 5. Verify #30 (CI automation report) auto-closes; close manually if not
  What to do / Must NOT do: After todo 1 confirms CI passed on `origin/main`, the `self-healing.yml` resolve job (lines 142-187) should automatically close issue #30 within the same CI run cycle. Wait up to 24 hours for the self-healing workflow to run. If #30 is still open after 24h, close it manually via `github.update_issue` (state: "closed", state_reason: "completed") with a comment explaining CI is now green. Must NOT close #30 before verifying CI passed. Must NOT modify `self-healing.yml`.
  Parallelization: Wave 2 | Blocked by: 1 (CI must pass) | Blocks: —
  References (executor has NO interview context - be exhaustive):
  - GitHub issue #30: title "CI automation report", labels: automation, ci, last updated 2026-07-26
  - `.github/workflows/self-healing.yml:142-187` (resolve job — closes "CI automation report" issue when CI conclusion=success)
  - `.github/workflows/self-healing.yml:55-130` (healing job — creates/updates #30 when CI fails, runs `if: always()`)
  - CI workflow id: 273289531
  - GitHub API: `github.get_issue` (issueNumber: 30) to check state; `github.update_issue` (issueNumber: 30, state: "closed") if manual close needed
  Acceptance criteria (agent-executable):
  1. Pre-condition: CI passed on main (from todo 1)
  2. `github.get_issue` for #30 returns `"state": "closed"` (either auto-closed by self-healing or manually closed)
  3. If manually closed, a comment explains CI is green
  QA scenarios (name the exact tool + invocation):
  - Happy: CI passes → self-healing resolve job runs → #30 auto-closes → `github.get_issue` confirms closed. Evidence: issue state JSON
  - Failure: #30 still open after 24h → `github.update_issue` manual close + comment. Evidence: issue state JSON + manual close timestamp
  Commit: N | (GitHub issue management, no code commit)

- [ ] 6. Verify #23 (Security automation report) auto-closes; close manually if not
  What to do / Must NOT do: After todo 2 confirms `npm audit --audit-level=moderate` exits 0, the `security.yml` workflow (daily cron `0 1 * * *`) should automatically close issue #23 on its next run — BUT ONLY IF Dependabot alerts are also clear (security.yml:159 condition: `npm audit NOT vulnerable AND (dependabot alerts unavailable OR alert_count == '0')`). Wait up to 24 hours for the security workflow to run. If #23 is still open after 24h (Dependabot alerts may still be open until GitHub processes the merged fixes), close it manually via `github.update_issue` (state: "closed", state_reason: "completed") with a comment explaining npm audit is now clean and the Dependabot alerts are being resolved. Must NOT close #23 before verifying `npm audit --audit-level=moderate` exits 0 locally. Must NOT modify `security.yml`. Must NOT trigger the security workflow manually (it runs on schedule).
  Parallelization: Wave 2 | Blocked by: 2 (npm audit must be clean) | Blocks: —
  References (executor has NO interview context - be exhaustive):
  - GitHub issue #23: title "Security automation report", labels: automation, security, updated 2026-07-29, body says "npm audit vulnerabilities: true", "open Dependabot alerts: 0", "Dependabot alerts API: unavailable"
  - `.github/workflows/security.yml:1-6` (daily cron `0 1 * * *`)
  - `.github/workflows/security.yml:35-48` (npm audit step — `npm audit --audit-level=moderate --json`)
  - `.github/workflows/security.yml:50-70` (Dependabot alerts check — uses `gh api repos/.../dependabot/alerts?state=open`; may return "unavailable" with current token)
  - `.github/workflows/security.yml:158-181` (close resolved security issue — runs when `npm audit NOT vulnerable AND (dependabot status != available OR alert_count == '0')`)
  - `.github/workflows/security.yml:86-156` (create/update security issue — runs when npm audit IS vulnerable OR dependabot alerts exist)
  - GitHub API: `github.get_issue` (issueNumber: 23) to check state; `github.update_issue` (issueNumber: 23, state: "closed") if manual close needed
  - Note: #23 body says "Dependabot alerts API: unavailable" — the workflow token can't access Dependabot alerts API, so `status=unavailable` which means the close condition `dependabot status != available` is TRUE. So #23 SHOULD auto-close once npm audit is clean, because the Dependabot condition is already satisfied (unavailable).
  Acceptance criteria (agent-executable):
  1. Pre-condition: `npm audit --audit-level=moderate` exits 0 (from todo 2)
  2. `github.get_issue` for #23 returns `"state": "closed"` (either auto-closed by security workflow or manually closed)
  3. If manually closed, a comment explains npm audit is clean
  QA scenarios (name the exact tool + invocation):
  - Happy: npm audit clean → security workflow runs next day → Dependabot condition already "unavailable" (satisfied) → #23 auto-closes → `github.get_issue` confirms closed. Evidence: issue state JSON
  - Failure: #23 still open after 24h → `github.update_issue` manual close + comment. Evidence: issue state JSON + npm audit exit code 0
  Commit: N | (GitHub issue management, no code commit)

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Verify: all 4 issues (#16, #19, #23, #30) are in `"state": "closed"` on GitHub. Run `github.list_repository_issues` (state: "open") and confirm 0 issues returned. Verify `npm audit --audit-level=moderate` exits 0. Verify CI on main is green (ALL jobs, not just the previously-failing one).
- [ ] F2. Code quality review
  Verify: `npm run typecheck` passes (stryker 9.x didn't break types). `npm run lint` passes. `npm run build` passes. `node dist/cli.js --version` works (smoke test). `npx stryker run --help` succeeds (stryker 9.x CLI functional).
- [ ] F3. Real manual QA
  Verify: `npm run test:run` passes with no new failures. `npm run test:coverage` passes (coverage gate). Run `npm audit --audit-level=moderate --json` and confirm 0 moderate+ vulnerabilities. Verify `package-lock.json` is updated and committed.
- [ ] F4. Scope fidelity
  Verify: no automation workflows were modified. No branches were deleted. No public API/CLI output contract changed. Only `package.json` + `package-lock.json` were changed (dependency upgrades + overrides). Only GitHub issue state changes (no issue body rewrites beyond closure comments). Existing `overrides` block preserved (`esbuild: 0.28.1` still present alongside new keys).

## Commit strategy
- Todo 2 (npm audit fix): Edit `package.json` → `npm install` (regenerate lockfile) → `npm run bump` → `npm run build` → `git add package.json package-lock.json` → `git commit -m "fix(deps): upgrade shell-quote and stryker, add transitive vulnerability overrides"`
- Todos 1, 3, 4, 5, 6: No code commits (push only / GitHub issue management)
- Commit message format: `<type>(<scope>): <lowercase active-voice description>`
- Note: `npm run bump` bumps patch version (1.0.42→1.0.43) across 3 package.json files — appropriate for a security fix release

## Success criteria
1. `github.list_repository_issues` (state: "open") returns 0 issues — all 4 bot issues closed
2. `npm audit --audit-level=moderate` exits with code 0
3. CI on `origin/main` is green (latest run conclusion=success, ALL jobs including benchmark)
4. `npm run test:run` passes with no new failures
5. `npm run typecheck` + `npm run lint` + `npm run build` all pass
6. `npx stryker run --help` succeeds (stryker 9.x CLI functional)
7. `node dist/cli.js --version` + `node dist/cli.js version --json` succeed (smoke test)
8. No automation workflows modified, no branches deleted
9. `package-lock.json` is updated and committed alongside `package.json`
