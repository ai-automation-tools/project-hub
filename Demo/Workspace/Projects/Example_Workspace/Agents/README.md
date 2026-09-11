# Agents

Per-workspace CLI runtime config. Everything here is checked in, because a skill that
only exists on one laptop is not a skill — it is a note.

Read the workspace README before changing code. Keep edits scoped and run the relevant
checks.

| Runtime | Config | What it carries |
|:---|:---|:---|
| `Claude/` | `CLAUDE.md` | Three skills, two commands, two sub-agents, three MCP servers |
| `Codex/` | `AGENTS.md` | One skill, one MCP server |

User-scope config that every workspace on the machine inherits lives under the
**User CLIs** root in the sidebar, not here.
