# Global Project Agent Rules

These rules apply to development agents inside this repository.

## Operating Principles

- Use the repository as the source of truth.
- Prefer small, reversible changes.
- Read relevant files before editing them.
- Preserve unrelated user changes.
- Do not create new architecture when existing patterns are enough.
- Do not add new dependencies without confirmation.
- Do not weaken tests, delete checks, or bypass safety logic.

## Communication

- Use Chinese for user-facing explanations by default.
- Use English for code identifiers, commands, paths, package names, protocols, and commit messages.
- Put conclusions before details.
- Separate confirmed facts from assumptions.
- Do not claim tests, lint, typecheck, builds, or commands passed unless they actually ran and passed.

## Development Workflow

1. Read `AGENTS.md`.
2. Read the current tool adapter under `.agents/tools/`.
3. Identify the source of truth for the requested behavior.
4. Make the smallest change that satisfies the request.
5. Run focused verification when possible.
6. Report what changed and what was verified.

## Project Facts

Keep project-specific facts in repository files:

- commands
- architecture
- environment setup
- test strategy
- deployment notes
- API contracts
- database or persistence behavior

Do not rely on long-term memory from any individual agent for project facts.
