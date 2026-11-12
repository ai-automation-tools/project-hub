# AGENTS.md — Project Hub

Zero-dependency Node server + single-file vanilla-JS explorer that turns a folder of
workspaces into a browsable document console on loopback. Repo: `ai-automation-tools/project-hub`
(the folder name `HTML-Project-Design` predates the rename). **Public, MIT** — everything
committed here, this file included, is published.

This is the only agent instructions file: Claude Code, Codex, Gemini CLI and opencode all read
it. Don't add a `CLAUDE.md` or another per-tool copy beside it.

## Layout

| Path | What it is |
|:---|:---|
| `hub/hub.mjs` | Entry point: static server and routes, watcher, content search (~860 lines). Re-exports everything below |
| `hub/scan.mjs` | Config loader, roots, `resolveId()` deny gate, tree walk, git state, scan payload. Also what the scan worker thread loads (~1,480 lines) |
| `hub/markdown.mjs` | Frontmatter, markdown renderer + `sanitizeHtml()`, heading slugs, link check (~440 lines) |
| `hub/index.html` | The entire UI — no framework, no build. Server fills `%TITLE%` `%FAVICON%` `%PORT%` `%NONCE%` per request |
| `hub/{navigation,pictures,pictures-client,reports,open-native,webmarks,favorites}.mjs` | Route/bookmark logic (pure), lazy Pictures cache, signed report routes, native launch, favorites storage + favicons + embed check (server), favorites tree + bookmarks-file format (client, pure) |
| `hub/*.test.mjs` | `node --test`, no framework |
| `hub/Start-Hub.ps1`, `Watch-Hubs.ps1`, `run-watchdog-hidden.vbs` | Launcher, health watchdog, hidden-window wrapper for its scheduled task |
| `project-hub/` | Server config folder + launcher shim. Real `hub.config.json` is gitignored |
| `projects/<Name>/hub.config.json` | One per mounted workspace. Only `projects/_example/` is tracked |
| `demo/` | Fixture workspace + `build-demo.mjs` → static capture published to project-hub-demo.ai-automation-tools.dev |
| `skills/project-hub-scaffold/` | **Travel copy** of the scaffold skill — canonical in `agent-skills`; CI's `scaffold copy` job fails if it drifts, so edit there first and copy here |
| `docs/` | `ROADMAP.md` (P9 is the live work queue), `CHANGELOG.md`, user/engine docs |
| `docs/diagrams/` + `scripts/build-diagram.mjs` | Code-pinned Archify architecture diagram, embedded on the homepage (`project-hub-site`). Edit only the `.json`; rebuild with `node scripts/build-diagram.mjs --pin-head`, `--check` reports drift. Procedure: `docs/diagrams/README.md` |

Deep reference: `hub/README.md` (engine, endpoints, config), `project-hub/README.md` (user manual),
`demo/README.md` (demo build).

## Commands

```sh
cd Hub && npm test                                   # must stay green
node demo/build-demo.mjs                             # from repo root; also an integration test
node hub/hub.mjs --config project-hub/hub.config.json          # run (http://127.0.0.1:4273)
node hub/hub.mjs --config project-hub/hub.config.json --scan   # write scan.json only
```

```powershell
./project-hub/Start-Hub.ps1 -Restart -NoBrowser      # restart the running hub after hub.mjs changes
```

CI (`.github/workflows/test.yml`) runs `npm test` on Node 18.17 and 22, plus the demo build
with a >100-captured-responses check. `demo.yml` deploys the demo on push to `main` touching `hub/` or `demo/`.

## Hard rules

- **Zero dependencies.** No `npm install`, no lockfile, no bundler, no framework. Node ≥18.17 stdlib only — CI tests 18.17, so don't use newer APIs.
- **No build step for the UI.** `hub/index.html` is served as-is.
- **Every path-addressed endpoint goes through `resolveId()`** (roots + `SECRET_DIRS` + `CREDENTIAL_FILE` deny gate). A new `/api/*` route that reads a path without it is a vulnerability. Tests pin several of these wirings.
- **Loopback only.** Host-header check and CSP on every response; `/api/open` is same-origin only. Never bind `0.0.0.0`.
- **Inline scripts need the `%NONCE%`.** The CSP rejects anything else.
- **`sanitizeHtml()` rebuilds tags from an allowlist** — extend the allowlist, never loosen it to pass-through.
- **No stray control bytes.** A test scans every source file; two past production defects were invisible bytes from a patch script. Prefer the Edit tool over scripted rewrites; re-run `npm test` after any scripted edit.
- **Client modules the page imports** must be in `build-demo.mjs`'s copy list and the scaffold's `$engineFiles`, or the demo and scaffolded hubs fail to load.
- **Every setting travels in the settings file.** Settings → Backup exports and imports one `project-hub-settings.json`; a setting it misses is silently lost when someone moves to a new hub. See [Adding or changing a setting](#adding-or-changing-a-setting).
- **Demo literals.** `build-demo.mjs` asserts exact string literals in `index.html` (placeholders, asset URLs). Moving them breaks the demo build — update both together.
- **Public repo hygiene.** No personal names, emails, hostnames, or machine paths in tracked files — use `D:/Work`, `C:/Users/you`, `Example_Workspace`. Real configs, `scan.json`, logs, `src/`, most of `images/` are gitignored; keep it that way.
- **Line endings** per `.gitattributes`: LF for js/mjs/json/md/html, CRLF for `.ps1`/`.vbs`. A `.ps1` with non-ASCII must be UTF-8 **with BOM**.
- **Scaffold skill changes land in `agent-skills` first**, then copy here byte-identical.

## Adding or changing a setting

Settings → Backup writes `{format: 'project-hub-settings', version, local, server}`. `local` is this
browser's raw `localStorage` strings; `server` is what the hub keeps (`folders`, `folderIcons`,
`scan`, `favorites`). The format and its merge rules are `exportSettings()` / `importSettings()` in
`hub/navigation.mjs`; the buttons and `importServerSettings()` are in `hub/index.html`. Import
writes `local`, sends `server` through the same routes the Settings view uses, then reloads.

- **A new `localStorage` key** goes in `SETTINGS_KEYS` (`navigation.mjs`). That alone exports and imports it. A test fails on any key the page writes that is neither in `SETTINGS_KEYS` nor on the test's short not-exported list (one-time markers such as `hub.design`), so decide which it is.
- **A list that should merge instead of being replaced** (as bookmarks and recents do) needs its own branch in `importSettings()`. Everything else is replaced by the imported value.
- **A new server-side setting** needs three edits: read it in the `#settings-export` handler, shape it in `importSettings()`, and send it back in `importServerSettings()` through the setting's own validated route. Never add a route that writes the config wholesale.
- **Import must stay safe to repeat** and must report what it could not apply (a folder the computer doesn't have) instead of failing the whole import.
- **Changing the meaning of an existing key or field** means old files still import: keep reading the old shape, and bump `version` only when you can't.
- Update the docs that list settings in the same change: `hub/README.md` (Settings), `project-hub/README.md` (Settings), and, in `agent-skills` first, the `project-hub-client` skill's key table and the scaffold skill's `current-features.md`.

## Skills & agents

Claude Code specifics; other agents can ignore this section.

- `.claude/skills/project-hub-{scan,client,demo}` — maintainer skills, **overlay installed from `agent-skills`** (`skills/projects/project-hub/`). Edit them there and reinstall with `pwsh scripts/install-skills.ps1 -Project project-hub -Destination <this-clone>/.claude/skills` — don't edit the copies here.
- `.claude/agents/hub-reviewer.md` — reviews a diff against the rules above.
- `/check` — tests + demo build + public-hygiene grep, before committing.

## Workflow

- **Single branch `main`, and every change reaches it through a PR** — no `mike_desktop`, no direct commits. Cut a short topic branch from `origin/main`, push it, open a PR, merge on GitHub. That includes one-line fixes and the skill-overlay syncs from `agent-skills`. An org ruleset requires it.
- Imperative-mood subjects, no Conventional Commits prefix (match `git log`).
- Ticking a P9 roadmap item adds a line to `docs/CHANGELOG.md` tagged *(roadmap: P9-NN)* in the same commit.
- `hub.mjs` / `scan.mjs` / `markdown.mjs` changes need a hub restart to take effect; `index.html` changes need only a browser refresh.
- The watchdog restarts a stopped hub within 15 minutes — disable its task first if you mean to keep it down.
