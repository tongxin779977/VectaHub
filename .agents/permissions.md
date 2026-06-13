# Permission Policy

This file defines the default permission model for development agents in this project.

## Levels

### L0: Local Read

Examples:

- read project files
- inspect documentation
- search code

Default: allowed.

### L1: Project Write

Examples:

- edit source files
- add tests
- update documentation
- create project-local files

Default: allowed for Trae Solo, OpenCode, and Cline. Allowed for Codex when explicitly asked to implement or fix. Allowed for Antigravity only when the task requires execution after planning.

### L2: Network Read

Examples:

- read official documentation
- search SkillHub
- inspect public package documentation

Default: requires approval or an approved MCP/skill entry.

### L3: External Write

Examples:

- send email or messages
- write to GitHub issues or PRs
- update external services
- create remote resources

Default: requires explicit confirmation every time.

### L4: High Risk

Examples:

- delete files outside scoped work
- access secrets
- deploy or publish
- push commits or tags
- modify production resources
- rewrite git history

Default: denied unless the user explicitly authorizes the exact action, scope, and expected result.

## Secret Handling

- Never print secrets, API keys, tokens, passwords, private keys, or session cookies.
- Prefer environment variable references such as `{env:GITHUB_TOKEN}`.
- Do not ask an agent to discover secrets from local files.

## Destructive Actions

Before any destructive action, state:

- command or action
- working directory
- affected paths or resources
- risk
- expected result
- confirmation needed
