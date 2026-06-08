# Cross-Project Backlog Template

> Document Status: Reuse Template
> Authority: Minimum structure for adapting this backlog system to another project.
> Last Updated: 2026-06-08

## Purpose

Use this template when copying the backlog operating model into another repository.

The target project should adapt names, commands, and verification gates to its own contracts. Do not copy VectaHub-specific behavior as implemented behavior in another project unless that project has the same code paths.

## Required Files

Create this structure:

```text
docs/development-backlog.md
docs/backlog/README.md
docs/backlog/protocol.md
docs/backlog/automation-prompt.md
docs/backlog/cross-project-template.md
docs/backlog/items/
docs/backlog/history/
```

## Entry Point Template

Use `docs/development-backlog.md` as the stable navigation file:

```markdown
# Development Backlog

> Document Status: Current Planning Queue
> Authority: Backlog entry point. Detailed task state lives in `docs/backlog/items/*.md`.

## Purpose

This file is the lightweight entry point for the development backlog.

## Task Index

| Task | Priority | Title |
|------|----------|-------|
| [TASK-001](./backlog/items/TASK-001.md) | P1 | Example task |
```

Do not duplicate task status in the index. Store status in item files.

## Item Template

Use one file per task:

```markdown
# TASK-001: Example task

> Status: todo
> Priority: P1
> Source: <origin>
> Module: `<module>`

## Description

<Problem statement>

## Expected

<Expected behavior or contract>

## Scope

- In-scope: <files or modules>
- Out-of-scope: <files or modules>

## Verification Plan

1. <focused check>
2. <broader check>

## Completion

### Changes

- Pending.

### Verification Evidence

- Pending.
```

## Protocol Adaptation Checklist

Before using the system in another project:

- Replace project-specific commands in `docs/backlog/protocol.md`.
- Replace automation prompt repository names.
- Define valid status values.
- Define lock timeout.
- Define required verification commands.
- Define whether multi-agent work is allowed.
- Define destructive-operation approval rules.
- Define where archived findings should live.

## Verification Commands

Set commands that are real for the target project. Examples:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run check:docs
```

Remove commands that do not exist in the target project. Do not document aspirational checks as required unless the project actually supports them.

