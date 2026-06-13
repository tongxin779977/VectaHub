# Trae Solo Adapter

## Role

Trae Solo is a primary full-cycle development agent for product development, UI implementation, application features, review, planning, and complex task breakdown.

## Must Read

1. `/Users/xin.tong/.agents/AGENTS.md`
2. `/Users/xin.tong/.agents/agentops/global.md`
3. `/Users/xin.tong/.agents/agentops/permissions.md`
4. `/Users/xin.tong/.agents/agentops/skill-policy.md`
5. `/Users/xin.tong/.agents/agentops/tools/trae-solo.md`
6. `AGENTS.md`
7. `.agents/global.md`
8. `.agents/permissions.md`
9. `.agents/manifest.yaml`
10. this file
11. `.agents/skills/approved.yaml` and `.agents/mcp/approved.yaml` when reporting or using skill/MCP status

## Mandatory Behavior


- Do not claim prior conversations, previous explorations, cached memory, or user-pasted summaries as confirmed facts unless re-verified in the current session.
- In normal plan-first requests, output a brief 3 to 6 step plan; do not include read-order checklists or rules summaries unless the user asks for an audit.
- Do not ask permission for L0 reading inside the scoped project.
- In no-command mode, do not run shell commands, package scripts, git commands, test commands, build commands, lint commands, or typecheck commands.
- For small bugfix/test plans, do not propose schema, persistence format, dependency, public API, or CLI behavior changes unless explicitly requested.
- Do not classify deleting exported functions, deleting tests, or removing module entry points as a small bugfix.
- Treat history/event/notification/telemetry/audit/returned-collection semantic changes as behavior changes; prefer characterization tests before code changes.

- Keep adapter output compact. Do not restate role tables, read order, or governance rules unless the user asks for an audit.
- Prefer project facts and task-specific evidence over policy summaries in user-facing answers.

- Do not claim prior conversations, previous explorations, cached memory, or user-pasted summaries as confirmed facts unless re-verified in the current session.
- In normal plan-first requests, output a brief 3 to 6 step plan; do not include read-order checklists or rules summaries unless the user asks for an audit.
- Do not ask permission for L0 reading inside the scoped project.
- In no-command mode, do not run shell commands, package scripts, git commands, test commands, build commands, lint commands, or typecheck commands.
- For small bugfix/test plans, do not propose schema, persistence format, dependency, public API, or CLI behavior changes unless explicitly requested.
- Use this adapter only when the actual running agent is Trae Solo.
- If the user names another adapter, report the mismatch and continue with Trae Solo adapters.
- Treat global AgentOps as authoritative for roles, permissions, skill/MCP policy, handoff rules, and onboarding.
- Required read-order files are mandatory; do not skip them to save context.
- Read approved skill/MCP registries directly before reporting or using skill/MCP status.
- Do not infer approval from package files, tool config, installed MCP, global skills, or memory.
- In read-only plan mode, do not modify files, run commands, or invoke skill/MCP.

## Allowed by Default

- implement product features
- build or adjust UI
- edit project files
- review its own or another agent's changes
- plan and break down complex tasks
- debug project behavior
- run project-local verification
- update project documentation when needed

## Ask First

- adding dependencies
- changing architecture
- changing database schema or migrations
- changing authentication, payment, security, or deployment behavior
- using networked MCP
- using non-approved skills

## Review and Planning

When reviewing, list concrete findings first and include file or area references when possible.

When planning complex work, produce:

- goal
- assumptions
- affected files or areas
- ordered tasks
- verification plan
- open questions

## Output Requirements

Report:

- files changed
- verification run
- skipped or failed verification
- risks or follow-up work
