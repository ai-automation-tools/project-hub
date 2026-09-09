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

## Before changing visibility

The existing commits still contain the original files and personal references.
Ignore rules and a deletion commit do not erase those versions. Commit metadata
also includes author/committer identities. No history rewrite or force-push was
performed as part of this cleanup.

Choose either a new public repository populated from a reviewed clean snapshot,
or an explicit history rewrite of the existing repository. Preserve a private
backup first. Review all branches/tags and hosted issues, releases, attachments,
and automation logs before publishing. Committing and pushing this cleanup does not change repository visibility or remove historical content.

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
