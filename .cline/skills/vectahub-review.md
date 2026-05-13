# VectaHub Review Skill

> Use this when the user asks for review, audit, code review, or “看看有没有问题”.

## Goal

Produce a useful engineering review, not a vague opinion.

## Review Order

1. Read the relevant spec or user requirement
2. Read changed files
3. Check nearest tests
4. Classify findings into:
   - confirmed bugs
   - design/architecture debt
   - test gaps
   - open questions

## Output Contract

Findings first. For each finding, prefer:

- severity
- short description
- why it matters
- file path
- line number

## Important Distinctions

- If evidence proves the issue now: call it a bug
- If behavior is currently correct but may drift later: call it architecture debt
- If you suspect an issue but did not verify enough: call it `待确认`

## Common Review Mistakes

- treating future maintainability risk as current P0
- calling missing optimization a bug
- ignoring tests and only reading implementation
- repeating old fixed issues in follow-up review

