# VectaHub Spec Implementation Skill

> Use this when the user says: “按文档实现”, “根据 spec 开发”, “先看设计文档再做”.

## Goal

Convert a design document into a small, explicit implementation checklist before code changes.

## Mandatory Workflow

1. Read the named spec first
2. Read only the dependent code and dependent spec sections
3. Extract a checklist with these headings:
   - required data contracts
   - required state transitions
   - required blocking conditions
   - required persistence behavior
   - required trace/audit behavior
   - required tests
4. Mark each item as:
   - already exists
   - implement now
   - out of scope
5. Only then edit code

## Hard Rule

If a spec explicitly requires a field, status, blocking condition, or persistence behavior, do not silently omit it.

## Common Failure Modes

- implement “main flow” but skip persistence
- add type but not runtime behavior
- add runtime behavior but no tests
- build UI/state around guessed contracts instead of spec contracts

## Output Before Coding

Always summarize:

- target spec
- implementation scope
- files to change
- non-goals
- verification plan

