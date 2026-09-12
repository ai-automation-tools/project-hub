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

## The hosted demo — added 2026-09-11

There is now a public page at **project-hub.ai-automation-tools.dev**, and the sentence
above about this not being a hosted service still holds: **no server runs there.** The
demo is static files. `Demo/build-demo.mjs` runs the real hub locally against a fixture
workspace, captures its responses, and publishes those captures — GitHub Pages serves
them and nothing else.

What that means for privacy, stated as properties rather than intentions:

- **No filesystem is reachable.** There is no `/api/*` behind the page; those paths are
  answered from captured files by a client-side shim. Nothing accepts a path it was not
  built with, because nothing is listening.
- **The content is invented.** Every workspace, repo, document, person and domain in
  `Demo/Workspace` and `Demo/Home` is fictional, and all of it is in Git where it can be
  read before it is published.
- **Build-machine paths are scrubbed at capture time.** The scan payload carries `base`,
  `home` and each root's `dir`, and the page displays them. They are rewritten to the
  generic `D:/Work` and `C:/Users/demo` the rest of these docs use, so the published
  payload never names a real machine.
- **Commit metadata in the fixture repos is synthetic.** The repositories are created
  during the build with their own git config and fixed author names, never the builder's
  identity or the CI runner's.
- **Third-party requests are unchanged from a local hub** — the same web font stylesheet.

What a visitor cannot do: open a file natively, reveal a folder, trigger a rescan against
anything, or reach a path outside the capture. Those endpoints answer with an explanation
rather than an error, because the honest thing to say is that the feature needs the local
server.

The caveat in the section above applies here too: the *history* of this repository was
never rewritten, and publishing a demo does not change that.

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
