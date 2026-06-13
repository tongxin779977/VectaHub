# AgentOps Project Rules

This project uses project-level AgentOps rules.

## Entry

Development agents must read:

1. global `/Users/xin.tong/.agents/AGENTS.md`
2. global `/Users/xin.tong/.agents/agentops/global.md`
3. global `/Users/xin.tong/.agents/agentops/permissions.md`
4. global `/Users/xin.tong/.agents/agentops/skill-policy.md`
5. project `AGENTS.md`
6. project `.agents/global.md`
7. project `.agents/permissions.md`
8. project `.agents/manifest.yaml`
9. project `.agents/tools/<current-tool>.md`
10. relevant project docs

## Precedence

Global AgentOps rules override project rules for:

- agent roles
- permission boundaries
- skill/MCP governance
- new-agent onboarding workflow

Project rules may only define project facts:

- commands
- source layout
- test locations
- package manager
- repository-specific workflows

## Included Development Agents

- Trae Solo
- OpenCode
- Cline
- Codex
- Google Antigravity / Agy

MiniMax is excluded from project development governance by default.

## Primary Agents

Trae Solo, OpenCode, and Cline are primary full-cycle development agents.

They may plan, implement, review, debug, refactor, break down complex tasks, and run project-local verification within permission boundaries.

## Support Agents

- Codex: review, debugging, test repair, risk analysis, second opinion
- Agy / Antigravity: orchestration, complex exploration, multi-agent decomposition

## Skill And MCP Policy

- Project approved skills: `.agents/skills/approved.yaml`
- Project approved MCP: `.agents/mcp/approved.yaml`
- SkillHub is a discovery source only.
- Skill structure follows the installed global `addyosmani/agent-skills` distribution:
  - `/Users/xin.tong/.agents/skills`
  - `/Users/xin.tong/.agents/agentops/skill-anatomy.md`
  - `/Users/xin.tong/.agents/scripts/validate-skills.js`

## Project

Project: VectaHub

Confirmed commands:

- `npm run dev`
- `npm run build`
- `npm run test:run`
- `npm run typecheck`
- `npm run lint`
- `npm run check:docs`
- `npm run check:default-context-usage`
