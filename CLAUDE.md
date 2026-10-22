@AGENTS.md

# CLAUDE.md — Project Hub

The repo guide for every agent is [AGENTS.md](AGENTS.md), imported above, so Codex, Gemini CLI and
opencode read the same rules. Only Claude Code specifics go here.

## Skills & agents

- `.claude/skills/project-hub-{scan,client,demo}` — maintainer skills, **overlay installed from `agent-skills`** (`skills/projects/project-hub/`). Edit them there and reinstall with `pwsh scripts/install-skills.ps1 -Project project-hub -Destination <this-clone>/.claude/skills` — don't edit the copies here.
- `.claude/agents/hub-reviewer.md` — reviews a diff against the rules above.
- `/check` — tests + demo build + public-hygiene grep, before committing.
