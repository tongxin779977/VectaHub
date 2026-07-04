---
"vectahub": major
---

# Initial changesets baseline

This change activates Changesets for semantic release. PR contributors
should now add a `.changeset/<branch-or-pr>.md` entry describing the
change. Maintainers run `npx changeset version` on `develop` and
`changeset publish` from `main` (or via the `Publish` workflow).

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the workflow.