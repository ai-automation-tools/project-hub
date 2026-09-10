# Public release preparation

The current source uses generic workspace examples. Original design exports,
screenshots and ZIP downloads have been removed from the Git index and retained
locally under ignored paths. Local configuration is preserved and remains ignored.
The bundled scaffold skill is a portable copy of the maintained custom skill;
update both copies together when the engine changes.

## Completed in the current version

- Generic names, domains and paths in documentation and test fixtures.
- Configured base/home values for copied paths, including cross-drive roots.
- A watchdog wrapper resolving its script relative to itself, using PowerShell 7 on PATH.
- Ignore rules for private configs, whole local project folders, indexes, logs,
  editor settings, credentials, caches, test output and private design assets.
- Fresh-clone tests accept example configs without requiring a developer's local setup.
- The scaffold supports the single-server Projects model and copies every required module.

## Visibility — changed 2026-09-10

The repository is **public**, under `ai-automation-tools/project-hub` (renamed the same day
from `html-project-design`). The decision was made with the history caveat below understood
and accepted, not overlooked.

**What was verified before the flip:** every tracked file was scanned for personal
identifiers, email addresses, machine paths and credential-shaped tokens, and the remaining
local specifics in `Hub/README.md`, `Hub/hub.mjs` and `Project-Hub/README.md` were replaced
with generic placeholders. Private design exports under `Src/` and `Images/` stay untracked.

**What was not done, and still has not been:** the existing commits still contain the
original files and personal references. Ignore rules and a deletion commit do not erase
those versions, and commit metadata carries author/committer identities. **No history
rewrite or force-push has been performed.** A clean working tree and a clean history are
separate properties; this repo has the first and not the second.

Closing that gap later means either a new public repository populated from a reviewed clean
snapshot, or an explicit history rewrite of this one. Either way, preserve a private backup
first and review all branches, tags, issues, releases, attachments and automation logs.
Neither is scheduled.

## Local operation

Keep the server on loopback. It exposes selected filesystem and user-agent metadata
to the local browser and is not a hosted service with user authentication. Browser
fonts and document images may make external requests. Do not share scan JSON or
logs without reviewing their contents.

[Back to Project Hub](../README.md)

## Verification on 2026-09-09

All 66 Node tests passed in the working checkout, a standalone scaffold, and a
clean public snapshot without local configs. The helper added two fixture
workspaces and rejected an existing destination. An isolated server with an empty
user profile returned healthy status, both project roots, the configured base,
and the HTML interface. Skill validation and ignore-rule checks passed. Current
public files had no matches for the checked personal identifiers, email addresses,
or common credential token patterns; this is not an exhaustive secrets audit.
The watchdog wrapper was inspected but not run against installed scheduled tasks.
