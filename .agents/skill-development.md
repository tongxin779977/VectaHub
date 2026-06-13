# Skill Development Policy

This project uses the installed global `addyosmani/agent-skills` distribution as the reference for developing agent skills.

Use `https://skillhub.cn/skills` as a discovery source for existing skills and MCP candidates.

## Source Roles

| Source | Role |
|---|---|
| `/Users/xin.tong/.agents/skills` | Installed global skills reference |
| `/Users/xin.tong/.agents/agentops/skill-anatomy.md` | Installed skill anatomy and structure reference |
| `/Users/xin.tong/.agents/scripts/validate-skills.js` | Installed skill validator |
| `https://skillhub.cn/skills` | Discovery source for candidate skills and MCP |
| `.agents/skills/*.yaml` | Project approval registry |
| `.agents/mcp/*.yaml` | Project MCP approval registry |

## Development Rules

- Do not invent skill structure from memory when creating reusable skills.
- Follow the installed global `addyosmani/agent-skills` distribution for new development skills.
- Validate new or updated skills with `/Users/xin.tong/.agents/scripts/validate-skills.js` when possible.
- Keep skill instructions concise and procedural.
- Put detailed references in separate files when needed.
- Include deterministic scripts only when they reduce repeated or fragile work.
- Do not include unnecessary auxiliary docs inside a skill.
- Treat SkillHub entries as candidates until reviewed.
- A skill may be used in this project only after it is listed in `.agents/skills/approved.yaml`.

## Skill Intake Flow

1. Discover a candidate skill on SkillHub or another source.
2. Record it in `.agents/skills/pending.yaml`.
3. Compare its structure and behavior against the installed global `addyosmani/agent-skills` conventions.
4. Review permissions, scripts, dependencies, network behavior, and secret handling.
5. Test it in a low-risk context.
6. Move it to `.agents/skills/approved.yaml` only after review.

## New Skill Creation Flow

1. Define the task the skill should support.
2. Confirm that the task is repeated, specialized, or fragile enough to justify a skill.
3. Use `/Users/xin.tong/.agents/agentops/skill-anatomy.md` as the primary reference for structure and style.
4. Create a concise `SKILL.md`.
5. Add references, scripts, or assets only when they are directly useful.
6. Validate the skill on realistic prompts.
7. Add it to `.agents/skills/approved.yaml` when accepted.

## Review Checklist

- Is the skill's trigger description specific enough?
- Does the skill avoid bloating the agent context?
- Are scripts necessary and inspectable?
- Does it avoid secrets and production resources by default?
- Are network or external-write actions clearly declared?
- Is the skill compatible with this project's permission model?
- Is the skill registered in the correct approval file?
