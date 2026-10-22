# Claude Code — Example Workspace

Read the workspace README before changing code. Keep edits scoped and run the relevant checks.

## Ground rules

- `Repos/Draft/` is R&D. Do not add a remote, CI config or a licence to anything in there.
- Migrations are never edited after they are pushed. Add a new one.
- Hand-written SQL only — see `Docs/decisions/0002-no-orm.md`.

## Checks

| Repo | Command |
|:---|:---|
| `atlas-web` | `npm test && npm run lint` |
| `signal-api` | `npm test` |
| `studio-kit` | `npm test && npm run build` |

## Skills

`export-audit`, `migration-check` and `changelog-draft` live in `.claude/skills/`.
They are workspace-scoped on purpose: all three read paths that only exist here.
